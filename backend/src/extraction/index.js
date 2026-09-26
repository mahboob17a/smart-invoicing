// Runs AI extraction for a bill and writes the result onto its draft.
//
// Extraction runs in the background after upload: POST /api/bills returns
// immediately with extractionStatus "pending", and the app polls the bill
// until it is "completed" or "failed". The extractor function is
// swappable so tests never call the real API.

const { randomUUID } = require("crypto");
const db = require("../db");
const storage = require("../storage");
const { extractWithClaude, describeFailure } = require("./claudeExtractor");

let extractor = extractWithClaude;

/** Tests only: replace the extractor; pass nothing to restore the real one. */
function setExtractor(fn) {
  extractor = fn || extractWithClaude;
}

// Bills awaiting extraction in this process, so tests (and a graceful
// shutdown) can wait for background work to finish.
const inFlight = new Map();

function startExtraction(billId) {
  const job = runExtraction(billId).finally(() => inFlight.delete(billId));
  inFlight.set(billId, job);
  return job;
}

function waitForExtraction(billId) {
  return inFlight.get(billId) ?? Promise.resolve();
}

async function runExtraction(billId) {
  const bill = db
    .prepare(
      `SELECT bills.id, assets.storage_key, assets.mime_type
       FROM bills JOIN assets ON assets.id = bills.image_asset_id
       WHERE bills.id = ?`
    )
    .get(billId);
  if (!bill) return;

  try {
    const buffer = storage.getObject(bill.storage_key);
    const { result, model } = await extractor({ buffer, mimeType: bill.mime_type });
    saveResult(billId, result, model);
  } catch (err) {
    console.error(`Extraction failed for bill ${billId}:`, err);
    db.prepare(
      `UPDATE bills SET extraction_status = 'failed', extraction_error = ?,
         updated_at = datetime('now')
       WHERE id = ?`
    ).run(describeFailure(err), billId);
  }
}

// ---- Turning the model's read into draft values ---------------------------

const text = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const number = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const isoDate = (v) => (isValidIsoDate(v) ? v : null);

function isValidIsoDate(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// A header field is flagged when the model said it was unclear, or when it
// returned something that failed our own checks (e.g. an impossible date).
function headerField(field, normalize, invalidNote) {
  const raw = field?.value ?? null;
  const value = normalize(raw);
  if (raw !== null && value === null) return { value: null, flag: invalidNote };
  if (field?.unclear) return { value, flag: text(field.note) || "unclear" };
  return { value, flag: null };
}

/** Pure: model output -> { header, flags, lineItems, confidence }. */
function toDraft(result) {
  const vendor = headerField(result.vendorName, text, "vendor name unreadable");
  const billNo = headerField(result.billNumber, text, "bill number unreadable");
  const date = headerField(result.billDate, isoDate, "date unreadable");

  const flags = {};
  if (vendor.flag) flags.vendorName = vendor.flag;
  if (billNo.flag) flags.originalBillNo = billNo.flag;
  if (date.flag) flags.originalDate = date.flag;
  if (!result.isBill) flags.bill = text(result.problem) || "This doesn't look like a bill";

  const lineItems = (result.lineItems || []).map((item) => ({
    description: text(item.description),
    quantity: number(item.quantity),
    unit: text(item.unit),
    rate: number(item.rate),
    amount: number(item.amount),
    unclear: !!item.unclear,
    note: item.unclear ? text(item.note) || "unclear" : null,
  }));

  const anyFlag = Object.keys(flags).length > 0 || lineItems.some((i) => i.unclear);
  return {
    header: { vendorName: vendor.value, originalBillNo: billNo.value, originalDate: date.value },
    flags,
    lineItems,
    confidence: anyFlag ? "low" : "high",
  };
}

function saveResult(billId, result, model) {
  const draft = toDraft(result);
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE bills SET
         extraction_status = 'completed', extraction_error = NULL,
         extraction_json = ?, extraction_confidence = ?, extracted_at = datetime('now'),
         vendor_name = ?, original_bill_no = ?, original_date = ?, field_flags_json = ?,
         updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      JSON.stringify({ model, result }),
      draft.confidence,
      draft.header.vendorName,
      draft.header.originalBillNo,
      draft.header.originalDate,
      JSON.stringify(draft.flags),
      billId
    );
    replaceLineItems(billId, draft.lineItems);
  });
  tx();
}

function replaceLineItems(billId, items) {
  db.prepare("DELETE FROM bill_line_items WHERE bill_id = ?").run(billId);
  const insert = db.prepare(
    `INSERT INTO bill_line_items
      (id, bill_id, position, description, quantity, unit, original_rate, amount, flagged_unclear, flag_note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  items.forEach((item, position) => {
    insert.run(
      randomUUID(), billId, position, item.description, item.quantity, item.unit,
      item.rate, item.amount, item.unclear ? 1 : 0, item.note
    );
  });
}

// A server restart abandons in-flight extractions; mark them failed so the
// app offers a retry instead of polling forever.
function recoverInterruptedExtractions() {
  db.prepare(
    `UPDATE bills SET extraction_status = 'failed',
       extraction_error = 'Extraction was interrupted. Try again.'
     WHERE extraction_status = 'pending'`
  ).run();
}

module.exports = {
  startExtraction,
  waitForExtraction,
  setExtractor,
  recoverInterruptedExtractions,
  replaceLineItems,
  isValidIsoDate,
  toDraft,
};
