// Turns raw AI output into clean bill fields plus review flags.
// Design Document §8.2: unreadable or low-confidence fields are flagged for
// the reviewer, never silently guessed.

function parseNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[^\d.,\-]/g, "");
  if (!s || !/\d/.test(s)) return null;
  if (s.includes(",") && s.includes(".")) {
    // "1,234.500" (comma thousands) or "1.234,50" (dot thousands)
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (s.includes(",")) {
    s = /^\-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

function iso(y, m, d) {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  if (y < 1990 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Day-first (GCC / India convention) unless the text is ISO. Returns YYYY-MM-DD or null. */
function parseDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{2,4})$/);
  if (m) {
    let d = +m[1], mo = +m[2];
    if (mo > 12 && d <= 12) [d, mo] = [mo, d]; // clearly month-first, e.g. 08/20/2026
    return iso(+m[3], mo, d);
  }
  const month = (name) => MONTHS[name.toLowerCase().slice(0, 4)] ?? MONTHS[name.toLowerCase().slice(0, 3)];
  m = s.match(/^(\d{1,2})[\s\-./]*([A-Za-z]{3,9})[\s\-.,/]*(\d{2,4})$/);
  if (m && month(m[2])) return iso(+m[3], month(m[2]), +m[1]);
  m = s.match(/^([A-Za-z]{3,9})[\s.]+(\d{1,2}),?\s+(\d{4})$/);
  if (m && month(m[1])) return iso(+m[3], month(m[1]), +m[2]);
  return null;
}

// Decimal-safe half-up rounding: 0.4025 -> 0.403 (plain Math.round gives 0.402).
const round = (n, dp = 3) => (n === null || n === undefined ? null : Number(`${Math.round(Number(`${Number(n.toPrecision(12))}e${dp}`))}e-${dp}`));
const clean = (s) => (typeof s === "string" && s.trim() ? s.trim().replace(/\s+/g, " ") : null);
const low = (c) => c === "low";

/** Key used for duplicate detection: letters and digits only, upper case. */
const billNoKey = (s) => (s ? String(s).toUpperCase().replace(/[^A-Z0-9]/g, "") || null : null);

/** Key used to match vendors: lower case, no punctuation, no legal suffix. */
function vendorKey(name) {
  if (!name) return null;
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, " ")
    .replace(/\b(l\s?l\s?c|spc|saog|saoc|est|co|company|w\s?l\s?l)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim() || null;
}

function normalizeExtraction(raw) {
  const flags = {};
  const r = raw || {};

  if (r.is_bill === false) flags.bill = "This doesn't look like a bill or invoice. Check the photo.";

  const vendorName = clean(r.vendor_name);
  if (!vendorName) flags.vendorName = "Couldn't read the vendor name";
  else if (low(r.vendor_name_confidence)) flags.vendorName = "Check the vendor name";

  const originalBillNo = clean(r.bill_number);
  if (!originalBillNo) flags.originalBillNo = "Couldn't read the bill number";
  else if (low(r.bill_number_confidence)) flags.originalBillNo = "Check the bill number";

  const originalDate = parseDate(r.bill_date_iso) || parseDate(r.bill_date_text);
  if (!originalDate) flags.originalDate = r.bill_date_text ? `Couldn't understand the date "${r.bill_date_text}"` : "Couldn't read the date";
  else if (low(r.date_confidence)) flags.originalDate = "Check the date";

  const items = (Array.isArray(r.line_items) ? r.line_items : []).map((li) => {
    const description = clean(li.description);
    let qty = parseNumber(li.quantity);
    let rate = parseNumber(li.unit_price);
    const amount = parseNumber(li.amount);
    let reason = null;
    if (qty === null && rate !== null && amount !== null && rate !== 0) qty = round(amount / rate, 3);
    if (qty === null && amount !== null && rate === null) qty = 1;
    if (rate === null && qty && amount !== null) {
      rate = round(amount / qty, 3);
      reason = "Rate worked out from the amount";
    }
    if (!description || li.legible === false || low(li.confidence)) reason = "Description unclear";
    else if (qty === null || rate === null) reason = "Quantity or rate missing";
    else if (amount !== null && Math.abs(qty * rate - amount) > Math.max(0.011, Math.abs(amount) * 0.005)) {
      reason = `Qty × rate is ${round(qty * rate)}, but the bill shows ${round(amount)}`;
    }
    return {
      description,
      qty,
      unit: clean(li.unit),
      rate,
      amount: qty !== null && rate !== null ? round(qty * rate) : amount,
      flagged: !!reason,
      reason: reason || (clean(li.note) && low(li.confidence) ? clean(li.note) : null),
    };
  });
  if (!items.length) flags.lineItems = "No line items found. Add them by hand.";

  const subtotal = parseNumber(r.subtotal);
  const total = parseNumber(r.total);
  const itemsSum = round(items.reduce((a, i) => a + (i.amount || 0), 0));
  const compare = subtotal ?? total;
  if (items.length && compare !== null && Math.abs(itemsSum - compare) > Math.max(0.011, compare * 0.01)) {
    // Some bills print only the tax-inclusive total; don't flag if items + tax match it.
    const tax = parseNumber(r.tax_amount);
    const matchesWithTax = subtotal === null && tax !== null && Math.abs(itemsSum + tax - total) <= Math.max(0.011, total * 0.01);
    if (!matchesWithTax) flags.total = `Line items add up to ${itemsSum.toFixed(3)}, but the bill shows ${compare.toFixed(3)}`;
  }

  const checks = 3 + items.length;
  const flaggedCount = ["vendorName", "originalBillNo", "originalDate"].filter((k) => flags[k]).length + items.filter((i) => i.flagged).length;
  return {
    vendorName,
    originalBillNo,
    originalDate,
    currencyCode: clean(r.currency) ? clean(r.currency).toUpperCase().slice(0, 3) : null,
    printedTotal: total ?? subtotal,
    items,
    flags,
    confidence: round(1 - flaggedCount / checks, 2),
  };
}

module.exports = { parseNumber, parseDate, normalizeExtraction, billNoKey, vendorKey, round };
