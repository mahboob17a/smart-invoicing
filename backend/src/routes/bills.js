const express = require("express");
const multer = require("multer");
const { randomUUID } = require("crypto");
const db = require("../db");
const { sniffFileType } = require("../fileTypes");
const { storeAsset, assetUrl } = require("./assets");
const { startExtraction, replaceLineItems, isValidIsoDate } = require("../extraction");

const router = express.Router();

// Images are resized on the phone before upload, so 5 MB is generous; PDFs
// get more room but stay well inside the extraction service's request limit.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_LINE_ITEMS = 500;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_BYTES, files: 1 },
});

// ---- Shapes -----------------------------------------------------------------

function lineItemToApi(row) {
  return {
    id: row.id,
    description: row.description,
    quantity: row.quantity,
    unit: row.unit,
    rate: row.original_rate,
    amount: row.amount,
    unclear: !!row.flagged_unclear,
    note: row.flag_note,
  };
}

function summaryToApi(row) {
  return {
    id: row.id,
    status: row.status,
    extractionStatus: row.extraction_status,
    vendorName: row.vendor_name,
    originalBillNo: row.original_bill_no,
    originalDate: row.original_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function billToApi(row) {
  const lineItems = db
    .prepare("SELECT * FROM bill_line_items WHERE bill_id = ? ORDER BY position")
    .all(row.id)
    .map(lineItemToApi);
  const image = db.prepare("SELECT mime_type FROM assets WHERE id = ?").get(row.image_asset_id);
  return {
    ...summaryToApi(row),
    extractionError: row.extraction_error,
    extractionConfidence: row.extraction_confidence,
    extractedAt: row.extracted_at,
    fieldFlags: JSON.parse(row.field_flags_json),
    lineItems,
    imageUrl: assetUrl(row.image_asset_id),
    imageMimeType: image?.mime_type ?? null,
    duplicates: findDuplicates(row),
  };
}

// Design doc 8.3: warn when the same vendor + bill number + date is already
// in this organization's account. Matching ignores case and outer spaces,
// and only runs once all three are known.
function findDuplicates(row) {
  if (!row.vendor_name || !row.original_bill_no || !row.original_date) return [];
  return db
    .prepare(
      `SELECT id, status, created_at FROM bills
       WHERE organization_id = ? AND id != ?
         AND lower(trim(vendor_name)) = lower(trim(?))
         AND lower(trim(original_bill_no)) = lower(trim(?))
         AND original_date = ?
       ORDER BY created_at`
    )
    .all(row.organization_id, row.id, row.vendor_name, row.original_bill_no, row.original_date)
    .map((d) => ({ id: d.id, status: d.status, createdAt: d.created_at }));
}

function findOwnedBill(organizationId, billId) {
  return db
    .prepare("SELECT * FROM bills WHERE id = ? AND organization_id = ?")
    .get(billId, organizationId);
}

// ---- Routes -----------------------------------------------------------------

// POST /api/bills  (multipart/form-data, field "file": JPEG, PNG, or PDF)
// Stores the original, creates a draft bill, and starts AI extraction in
// the background. Poll GET /api/bills/:id until extractionStatus is
// "completed" or "failed".
router.post("/", (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === "LIMIT_FILE_SIZE" ? "File must be 20 MB or smaller" : err.message;
      return res.status(400).json({ error: message });
    }
    if (err) return next(err);

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "Attach the bill photo or PDF as the 'file' field" });
    }
    const type = sniffFileType(file.buffer);
    if (!type) {
      return res.status(400).json({ error: "Bill must be a JPEG, PNG, or PDF file" });
    }
    if (type.mimeType !== "application/pdf" && file.size > MAX_IMAGE_BYTES) {
      return res.status(400).json({ error: "Photo must be 5 MB or smaller" });
    }

    const billId = randomUUID();
    const tx = db.transaction(() => {
      const asset = storeAsset(req.organizationId, "bill", file.buffer, type);
      db.prepare(
        `INSERT INTO bills (id, organization_id, image_asset_id, created_by)
         VALUES (?, ?, ?, ?)`
      ).run(billId, req.organizationId, asset.id, req.userId);
    });
    tx();

    startExtraction(billId);
    res.status(201).json(billToApi(findOwnedBill(req.organizationId, billId)));
  });
});

// GET /api/bills — newest first.
router.get("/", (req, res) => {
  const rows = db
    .prepare(
      "SELECT * FROM bills WHERE organization_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 200"
    )
    .all(req.organizationId);
  res.json(rows.map(summaryToApi));
});

router.get("/:id", (req, res) => {
  const bill = findOwnedBill(req.organizationId, req.params.id);
  if (!bill) return res.status(404).json({ error: "Not found" });
  res.json(billToApi(bill));
});

// POST /api/bills/:id/extract — retry a failed extraction.
router.post("/:id/extract", (req, res) => {
  const bill = findOwnedBill(req.organizationId, req.params.id);
  if (!bill) return res.status(404).json({ error: "Not found" });
  if (bill.extraction_status !== "failed") {
    return res.status(409).json({ error: "Only a failed extraction can be retried" });
  }
  db.prepare(
    `UPDATE bills SET extraction_status = 'pending', extraction_error = NULL,
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(bill.id);
  startExtraction(bill.id);
  res.status(202).json(billToApi(findOwnedBill(req.organizationId, bill.id)));
});

// PUT /api/bills/:id — save the reviewer's corrections.
// Body: { vendorName, originalBillNo, originalDate, fieldFlags, lineItems,
//         markReady }. The app sends back the flags the reviewer hasn't
// resolved yet; markReady: true is refused while any remain.
router.put("/:id", (req, res) => {
  const bill = findOwnedBill(req.organizationId, req.params.id);
  if (!bill) return res.status(404).json({ error: "Not found" });
  if (bill.extraction_status === "pending") {
    return res.status(409).json({ error: "Wait for extraction to finish before editing" });
  }

  const parsed = parseEdit(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const edit = parsed.value;

  if (edit.markReady) {
    const problem = readinessProblem(edit);
    if (problem) return res.status(400).json({ error: problem });
  }

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE bills SET vendor_name = ?, original_bill_no = ?, original_date = ?,
         field_flags_json = ?, status = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      edit.vendorName,
      edit.originalBillNo,
      edit.originalDate,
      JSON.stringify(edit.fieldFlags),
      edit.markReady ? "ready" : "draft",
      bill.id
    );
    replaceLineItems(bill.id, edit.lineItems);
  });
  tx();

  res.json(billToApi(findOwnedBill(req.organizationId, bill.id)));
});

router.delete("/:id", (req, res) => {
  const info = db
    .prepare("DELETE FROM bills WHERE id = ? AND organization_id = ?")
    .run(req.params.id, req.organizationId);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.status(204).send();
});

// ---- Validation -------------------------------------------------------------

const FLAGGABLE_FIELDS = new Set(["vendorName", "originalBillNo", "originalDate", "bill"]);

function optionalText(v, name) {
  if (v === undefined || v === null) return { value: null };
  if (typeof v !== "string") return { error: `${name} must be text` };
  return { value: v.trim() || null };
}

function optionalNumber(v, name) {
  if (v === undefined || v === null) return { value: null };
  if (typeof v !== "number" || !Number.isFinite(v)) return { error: `${name} must be a number` };
  return { value: v };
}

function parseEdit(body) {
  const out = { markReady: body.markReady === true };

  for (const [key, name] of [["vendorName", "vendorName"], ["originalBillNo", "originalBillNo"]]) {
    const r = optionalText(body[key], name);
    if (r.error) return r;
    out[key] = r.value;
  }

  const date = optionalText(body.originalDate, "originalDate");
  if (date.error) return date;
  if (date.value && !isValidIsoDate(date.value)) {
    return { error: "originalDate must be a real date in YYYY-MM-DD format" };
  }
  out.originalDate = date.value;

  const flags = body.fieldFlags ?? {};
  if (typeof flags !== "object" || Array.isArray(flags)) {
    return { error: "fieldFlags must be an object" };
  }
  out.fieldFlags = {};
  for (const [field, note] of Object.entries(flags)) {
    if (!FLAGGABLE_FIELDS.has(field)) return { error: `Unknown flagged field: ${field}` };
    if (typeof note !== "string") return { error: "fieldFlags values must be text" };
    out.fieldFlags[field] = note;
  }

  const items = body.lineItems ?? [];
  if (!Array.isArray(items)) return { error: "lineItems must be a list" };
  if (items.length > MAX_LINE_ITEMS) return { error: `A bill can have at most ${MAX_LINE_ITEMS} line items` };
  out.lineItems = [];
  for (const [i, item] of items.entries()) {
    const n = `lineItems[${i}]`;
    if (typeof item !== "object" || item === null) return { error: `${n} must be an object` };
    const fields = {
      description: optionalText(item.description, `${n}.description`),
      unit: optionalText(item.unit, `${n}.unit`),
      note: optionalText(item.note, `${n}.note`),
      quantity: optionalNumber(item.quantity, `${n}.quantity`),
      rate: optionalNumber(item.rate, `${n}.rate`),
      amount: optionalNumber(item.amount, `${n}.amount`),
    };
    const bad = Object.values(fields).find((f) => f.error);
    if (bad) return bad;
    const unclear = item.unclear === true;
    out.lineItems.push({
      description: fields.description.value,
      unit: fields.unit.value,
      quantity: fields.quantity.value,
      rate: fields.rate.value,
      amount: fields.amount.value,
      unclear,
      note: unclear ? fields.note.value || "unclear" : null,
    });
  }

  return { value: out };
}

// What still stands between this draft and "ready to convert".
function readinessProblem(edit) {
  if (Object.keys(edit.fieldFlags).length) {
    return "Resolve the flagged fields before marking the bill ready";
  }
  if (!edit.vendorName) return "Vendor name is required";
  if (edit.lineItems.length === 0) return "Add at least one line item";
  const index = edit.lineItems.findIndex(
    (i) => i.unclear || !i.description || i.quantity === null || i.rate === null
  );
  if (index !== -1) {
    return `Line ${index + 1} needs a description, quantity, and rate, and no unresolved flag`;
  }
  return null;
}

module.exports = router;
