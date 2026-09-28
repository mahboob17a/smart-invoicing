// Bill processing and helpers (Design Document §8.1–§8.3).
const { randomUUID } = require("crypto");
const db = require("../db");
const storage = require("./storage");
const extraction = require("./extraction");
const { normalizeExtraction, billNoKey, vendorKey, round } = require("./extraction/normalize");

function findVendor(orgId, name) {
  const key = vendorKey(name);
  if (!key) return null;
  return db.prepare("SELECT * FROM vendors WHERE organization_id = ? AND normalized_name = ?").get(orgId, key) || null;
}

function upsertVendor(orgId, name) {
  const key = vendorKey(name);
  if (!key) return null;
  const existing = findVendor(orgId, name);
  if (existing) return existing.id;
  const id = randomUUID();
  db.prepare("INSERT INTO vendors (id, organization_id, name, normalized_name) VALUES (?, ?, ?, ?)").run(id, orgId, name.trim(), key);
  return id;
}

function replaceItems(billId, orgId, items) {
  db.prepare("DELETE FROM bill_line_items WHERE bill_id = ?").run(billId);
  const ins = db.prepare(
    `INSERT INTO bill_line_items (id, bill_id, organization_id, position, description, qty, unit, original_rate, amount, flagged_unclear, flag_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  items.forEach((it, i) =>
    ins.run(randomUUID(), billId, orgId, i, it.description ?? null, it.qty ?? null, it.unit ?? null, it.rate ?? null,
      it.amount ?? null, it.flagged ? 1 : 0, it.reason ?? null)
  );
}

function friendlyError(e) {
  const status = e?.status;
  if (status === 401) return "The AI service rejected the API key. Check the key in the server's .env file.";
  if (status === 403 || status === 404) return "The AI key can't use the chosen model. Check EXTRACTION_MODEL, or remove it to let the app choose.";
  if (status === 429) return "The AI service is busy right now. Try again in a minute.";
  if (status === 400 && /image|media|pdf/i.test(e.message)) return "The AI service couldn't open this file. Try a clearer photo or a different file.";
  if (e?.name === "APIConnectionTimeoutError" || /timed? ?out/i.test(e?.message || "")) return "Reading the bill took too long. Try again.";
  return "Couldn't read this bill automatically. Try again, or fill in the details by hand.";
}

/** Runs AI extraction for a bill and stores the result for review. */
async function processBill(billId, orgId) {
  const files = db.prepare("SELECT * FROM bill_files WHERE bill_id = ? AND organization_id = ? ORDER BY page_index").all(billId, orgId);
  const started = Date.now();
  try {
    const result = await extraction.extract(files.map((f) => ({ buffer: storage.read(f.storage_key), mimeType: f.mime_type })));
    const still = db.prepare("SELECT id FROM bills WHERE id = ?").get(billId);
    if (!still) return; // deleted while reading

    if (!result.raw) {
      db.prepare(
        `UPDATE bills SET status = 'needs_review', extraction_provider = ?, extraction_model = NULL, extraction_ms = ?,
           flags_json = ?, extraction_error = NULL, updated_at = datetime('now') WHERE id = ?`
      ).run(result.provider, Date.now() - started, JSON.stringify({ ai: "AI reading is switched off. Enter the details from the photo." }), billId);
      return;
    }

    const n = normalizeExtraction(result.raw);
    const vendor = findVendor(orgId, n.vendorName);
    db.transaction(() => {
      replaceItems(billId, orgId, n.items);
      db.prepare(
        `UPDATE bills SET status = 'needs_review', vendor_id = ?, vendor_name = ?, original_bill_no = ?, original_bill_no_key = ?,
           original_date = ?, currency_code = ?, printed_total = ?, flags_json = ?, extraction_json = ?, extraction_confidence = ?,
           extraction_provider = ?, extraction_model = ?, extraction_ms = ?, extraction_error = NULL, updated_at = datetime('now')
         WHERE id = ?`
      ).run(vendor?.id ?? null, vendor?.name ?? n.vendorName, n.originalBillNo, billNoKey(n.originalBillNo), n.originalDate,
        n.currencyCode, n.printedTotal, JSON.stringify(n.flags), JSON.stringify(result.raw), n.confidence,
        result.provider, result.model, Date.now() - started, billId);
    })();
  } catch (e) {
    console.error("[extraction]", billId, e?.status || "", e?.message);
    db.prepare(
      `UPDATE bills SET status = 'failed', extraction_error = ?, extraction_ms = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(friendlyError(e), Date.now() - started, billId);
  }
}

function startProcessing(billId, orgId) {
  db.prepare("UPDATE bills SET status = 'processing', extraction_error = NULL, updated_at = datetime('now') WHERE id = ?").run(billId);
  setImmediate(() => processBill(billId, orgId));
}

/** Same vendor + same original bill number + same date (§8.3). A missing date on either side still counts. */
function findDuplicates(orgId, bill) {
  const key = bill.original_bill_no_key;
  const vKey = vendorKey(bill.vendor_name);
  if (!key || !vKey) return [];
  return db
    .prepare(
      `SELECT id, vendor_name, original_bill_no, original_date, status, created_at FROM bills
       WHERE organization_id = ? AND id != ? AND original_bill_no_key = ? AND status IN ('needs_review','draft','failed')`
    )
    .all(orgId, bill.id, key)
    .filter((b) => vendorKey(b.vendor_name) === vKey && (!b.original_date || !bill.original_date || b.original_date === bill.original_date))
    .map((b) => ({ id: b.id, vendorName: b.vendor_name, originalBillNo: b.original_bill_no, originalDate: b.original_date, status: b.status, createdAt: b.created_at }));
}

/** Resets processing bills left behind by a server restart. */
function recoverInterrupted() {
  db.prepare(
    "UPDATE bills SET status = 'failed', extraction_error = 'Reading was interrupted. Tap Try again.' WHERE status = 'processing'"
  ).run();
}

module.exports = { processBill, startProcessing, findDuplicates, upsertVendor, replaceItems, recoverInterrupted, round };
