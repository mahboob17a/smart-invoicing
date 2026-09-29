// Builds the values a template is filled with. Phase 3 uses a sample bill so
// customers can check their template; Phase 4 passes a real converted bill.
const db = require("../../db");
const { previewNext, rowToCfg, resolveSeries } = require("../invoiceNumber");

const SAMPLE_LINES = [
  { description: 'PVC pipe 1" (3 m)', qty: 6, unit: "pcs", rate: 4.5 },
  { description: 'Ball valve 1" brass', qty: 4, unit: "pcs", rate: 6.25 },
  { description: "PTFE thread tape", qty: 10, unit: "roll", rate: 0.35 },
  { description: "Pipe clamp set", qty: 2, unit: "set", rate: 15.375 },
];

const fmtDate = (iso) => (iso ? iso.split("-").reverse().join("-") : "");
const money = (n, dp) => (n === null || n === undefined ? "" : Number(n).toFixed(dp));
// Decimal-safe half-up rounding: 0.4025 -> 0.403 (plain Math.round gives 0.402).
const round = (n, dp) => Number(`${Math.round(Number(`${Number(n.toPrecision(12))}e${dp}`))}e-${dp}`);

/**
 * Computes invoice values (§8.4): rate × (1 + markup), amount = rate × qty,
 * tax on the marked-up subtotal. Returns strings ready for a document.
 */
function computeValues({ identity, recipient, rule, invoiceNo, invoiceDate, bill, lines }) {
  const dp = rule?.decimal_places ?? 3;
  const markup = (rule?.markup_pct ?? 0) / 100;
  const taxPct = rule?.tax_pct ?? 0;
  const items = lines.map((l, i) => {
    const marked = round(l.rate * (1 + markup), dp);
    const amount = round(marked * l.qty, dp);
    return {
      LineNo: String(i + 1), Description: l.description, Quantity: String(l.qty), Unit: l.unit || "",
      OriginalRate: money(l.rate, dp), MarkedUpRate: money(marked, dp), Amount: money(amount, dp), _amount: amount,
    };
  });
  const subtotal = round(items.reduce((a, i) => a + i._amount, 0), dp);
  const tax = round(subtotal * taxPct / 100, dp);
  items.forEach((i) => delete i._amount);
  return {
    IssuingName: identity?.name || "", IssuingAddress: identity?.address || "",
    IssuingRegNo: identity?.regNo || "", IssuingTaxNo: identity?.taxNo || "",
    RecipientName: recipient?.name || "", RecipientAddress: recipient?.address || "", RecipientTaxNo: recipient?.tax_no || "",
    InvoiceNo: invoiceNo || "", InvoiceDate: fmtDate(invoiceDate),
    VendorName: bill?.vendorName || "", OriginalBillNo: bill?.originalBillNo || "", OriginalBillDate: fmtDate(bill?.originalDate),
    Subtotal: money(subtotal, dp), TaxLabel: rule?.tax_label || "VAT", TaxRate: String(taxPct),
    TaxAmount: money(tax, dp), GrandTotal: money(subtotal + tax, dp), Currency: rule?.currency_code || "",
    items,
  };
}

/**
 * The letterhead an invoice is issued under: the given issuing identity, or the
 * organization's first one (live company profile if it is "same as company").
 */
function issuingIdentityFor(orgId, identityId = null) {
  const cp = db.prepare("SELECT * FROM company_profiles WHERE organization_id = ?").get(orgId);
  const id = identityId
    ? db.prepare("SELECT * FROM issuing_identities WHERE id = ? AND organization_id = ?").get(identityId, orgId)
    : db.prepare("SELECT * FROM issuing_identities WHERE organization_id = ? ORDER BY created_at LIMIT 1").get(orgId);
  const src = !id || id.same_as_company ? cp : id;
  return {
    id: id?.id || null,
    name: (id && !id.same_as_company ? id.display_name : cp?.legal_name) || "",
    address: src?.address_block || "",
    regNo: src?.registration_no || "",
    taxNo: src?.tax_no || "",
    logo: src?.logo_asset_url || cp?.logo_asset_url || null,
  };
}

/** Sample values using the organization's own letterhead, client, rule and numbering. */
function sampleValues(orgId) {
  const identity = issuingIdentityFor(orgId);
  const recipient = db.prepare("SELECT * FROM recipients WHERE organization_id = ? ORDER BY created_at LIMIT 1").get(orgId)
    || { name: "Sample Client LLC", address: "P.O. Box 100, Muscat", tax_no: "OM1100000000" };
  const rule = db.prepare("SELECT * FROM conversion_rule_profiles WHERE organization_id = ? ORDER BY created_at LIMIT 1").get(orgId)
    || { markup_pct: 15, tax_pct: 5, tax_label: "VAT", currency_code: "OMR", decimal_places: 3 };
  const series = resolveSeries(orgId, identity.id);
  const invoiceNo = series ? previewNext(rowToCfg(series)) : "INV-0001";
  const today = new Date().toISOString().slice(0, 10);
  const values = computeValues({
    identity, recipient, rule, invoiceNo, invoiceDate: today,
    bill: { vendorName: "Gulf Hardware Trading LLC", originalBillNo: "4471", originalDate: "2026-09-14" },
    lines: SAMPLE_LINES,
  });
  return { values, logo: identity.logo };
}

module.exports = { computeValues, sampleValues, issuingIdentityFor, SAMPLE_LINES, round, fmtDate };
