const express = require("express");
const { randomUUID } = require("crypto");
const multer = require("multer");
const db = require("../db");
const storage = require("../lib/storage");
const { badRequest, notFound, HttpError, handle } = require("../lib/http");
const { startProcessing, findDuplicates, upsertVendor, replaceItems } = require("../lib/bills");
const { parseDate, parseNumber, billNoKey, round } = require("../lib/extraction/normalize");
const { providerName } = require("../lib/extraction");

// Bills (Design Document §8.1–§8.3, Roadmap v1.1 Phase 2)
// POST   /api/bills                     multipart "files" (1–5 images, or 1 PDF) -> 202, reading starts
// GET    /api/bills?status=&q=          list
// GET    /api/bills/summary             counts for Home
// GET    /api/bills/:id                 bill + items + files + possible duplicates
// PUT    /api/bills/:id                 save the reviewer's corrections -> status "draft"
// POST   /api/bills/:id/extract         read the bill again
// DELETE /api/bills/:id
// GET    /api/bills/:id/files/:fileId   the original image/PDF (signed-in users of the same organization only)

const router = express.Router();
const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
const MAX_FILES = 5;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: MAX_FILES },
  fileFilter(req, file, cb) {
    if (!TYPES[file.mimetype]) return cb(badRequest("Bills must be JPEG, PNG or WebP photos, or a PDF"));
    cb(null, true);
  },
});

function getBill(id, orgId) {
  const b = db.prepare("SELECT * FROM bills WHERE id = ? AND organization_id = ?").get(id, orgId);
  if (!b) throw notFound("Bill not found");
  return b;
}

function itemsOf(billId) {
  return db.prepare("SELECT * FROM bill_line_items WHERE bill_id = ? ORDER BY position").all(billId).map((i) => ({
    id: i.id, description: i.description, qty: i.qty, unit: i.unit, rate: i.original_rate, amount: i.amount,
    flagged: !!i.flagged_unclear, reason: i.flag_reason,
  }));
}

function filesOf(bill) {
  return db.prepare("SELECT id, mime_type, size_bytes, page_index FROM bill_files WHERE bill_id = ? ORDER BY page_index").all(bill.id)
    .map((f) => ({ id: f.id, mimeType: f.mime_type, sizeBytes: f.size_bytes, page: f.page_index + 1, url: `/api/bills/${bill.id}/files/${f.id}` }));
}

function summaryOf(b) {
  const items = db.prepare("SELECT COUNT(*) n, SUM(amount) total, SUM(flagged_unclear) flagged FROM bill_line_items WHERE bill_id = ?").get(b.id);
  const first = db.prepare("SELECT id FROM bill_files WHERE bill_id = ? ORDER BY page_index LIMIT 1").get(b.id);
  const flags = JSON.parse(b.flags_json || "{}");
  return {
    id: b.id,
    status: b.status,
    vendorName: b.vendor_name,
    originalBillNo: b.original_bill_no,
    originalDate: b.original_date,
    currencyCode: b.currency_code,
    itemsTotal: items.total === null ? null : round(items.total),
    itemCount: items.n,
    flagCount: Object.keys(flags).length + (items.flagged || 0),
    thumbnailUrl: first ? `/api/bills/${b.id}/files/${first.id}` : null,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
  };
}

function fullBill(b, orgId) {
  return {
    ...summaryOf(b),
    recipientId: b.recipient_id,
    conversionRuleId: b.conversion_rule_id,
    printedTotal: b.printed_total,
    flags: JSON.parse(b.flags_json || "{}"),
    extraction: {
      provider: b.extraction_provider,
      model: b.extraction_model,
      confidence: b.extraction_confidence,
      error: b.extraction_error,
      ms: b.extraction_ms,
    },
    reviewedAt: b.reviewed_at,
    items: itemsOf(b.id),
    files: filesOf(b),
    possibleDuplicates: b.status === "processing" ? [] : findDuplicates(orgId, b),
  };
}

router.post("/", upload.array("files", MAX_FILES), handle((req, res) => {
  const files = req.files || [];
  if (!files.length) throw badRequest('Attach the bill as multipart field "files"');
  const pdfs = files.filter((f) => f.mimetype === "application/pdf");
  if (pdfs.length && files.length > 1) throw badRequest("Upload a PDF on its own, or up to 5 photos");

  const id = randomUUID();
  const saved = [];
  try {
    db.transaction(() => {
      db.prepare("INSERT INTO bills (id, organization_id, status, created_by) VALUES (?, ?, 'processing', ?)").run(id, req.organizationId, req.userId);
      files.forEach((f, i) => {
        const key = storage.save(req.organizationId, f.buffer, TYPES[f.mimetype]);
        saved.push(key);
        db.prepare(
          "INSERT INTO bill_files (id, bill_id, organization_id, storage_key, mime_type, size_bytes, page_index) VALUES (?, ?, ?, ?, ?, ?, ?)"
        ).run(randomUUID(), id, req.organizationId, key, f.mimetype, f.size, i);
      });
    })();
  } catch (e) {
    saved.forEach(storage.remove);
    throw e;
  }
  startProcessing(id, req.organizationId);
  res.status(202).json({ ...fullBill(getBill(id, req.organizationId), req.organizationId), aiProvider: providerName() });
}));

router.get("/summary", handle((req, res) => {
  const rows = db.prepare("SELECT status, COUNT(*) n FROM bills WHERE organization_id = ? GROUP BY status").all(req.organizationId);
  const by = Object.fromEntries(rows.map((r) => [r.status, r.n]));
  const recent = db.prepare("SELECT * FROM bills WHERE organization_id = ? ORDER BY created_at DESC LIMIT 5").all(req.organizationId);
  res.json({
    processing: by.processing || 0,
    needsReview: (by.needs_review || 0) + (by.failed || 0),
    drafts: by.draft || 0,
    total: rows.reduce((a, r) => a + r.n, 0),
    aiProvider: providerName(),
    recent: recent.map(summaryOf),
  });
}));

router.get("/", handle((req, res) => {
  const { status, q } = req.query;
  const where = ["organization_id = ?"];
  const args = [req.organizationId];
  if (status === "needs_review") where.push("status IN ('needs_review','failed','processing')");
  else if (status) { where.push("status = ?"); args.push(String(status)); }
  if (q) {
    where.push("(vendor_name LIKE ? OR original_bill_no LIKE ?)");
    args.push(`%${q}%`, `%${q}%`);
  }
  const rows = db.prepare(`SELECT * FROM bills WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT 200`).all(...args);
  res.json(rows.map(summaryOf));
}));

router.get("/:id", handle((req, res) => {
  res.json(fullBill(getBill(req.params.id, req.organizationId), req.organizationId));
}));

router.put("/:id", handle((req, res) => {
  const bill = getBill(req.params.id, req.organizationId);
  if (bill.status === "processing") throw new HttpError(409, "This bill is still being read. Wait a moment and try again.");
  const b = req.body || {};

  const vendorName = typeof b.vendorName === "string" ? b.vendorName.trim() : "";
  const originalBillNo = typeof b.originalBillNo === "string" ? b.originalBillNo.trim() : "";
  if (!vendorName) throw badRequest("Enter the vendor name");
  if (!originalBillNo) throw badRequest("Enter the vendor's bill number");
  let originalDate = null;
  if (b.originalDate) {
    originalDate = parseDate(b.originalDate);
    if (!originalDate) throw badRequest("Enter the bill date as DD-MM-YYYY");
  }
  if (b.recipientId) {
    const ok = db.prepare("SELECT id FROM recipients WHERE id = ? AND organization_id = ?").get(b.recipientId, req.organizationId);
    if (!ok) throw badRequest("That client does not exist in your account");
  }
  if (!Array.isArray(b.items) || b.items.length === 0) throw badRequest("Add at least one line item");
  const items = b.items.map((it, i) => {
    const description = typeof it.description === "string" ? it.description.trim() : "";
    const qty = parseNumber(it.qty);
    const rate = parseNumber(it.rate);
    if (!description) throw badRequest(`Line ${i + 1}: enter a description`);
    if (qty === null || qty <= 0) throw badRequest(`Line ${i + 1}: quantity must be more than 0`);
    if (rate === null || rate < 0) throw badRequest(`Line ${i + 1}: enter the rate`);
    return { description, qty, unit: typeof it.unit === "string" && it.unit.trim() ? it.unit.trim() : null, rate, amount: round(qty * rate), flagged: false, reason: null };
  });

  db.transaction(() => {
    const vendorId = upsertVendor(req.organizationId, vendorName);
    replaceItems(bill.id, req.organizationId, items);
    // The reviewer has checked everything, so extraction flags are cleared.
    // The original AI reading stays in extraction_json (§8.2).
    db.prepare(
      `UPDATE bills SET vendor_id = ?, vendor_name = ?, original_bill_no = ?, original_bill_no_key = ?, original_date = ?,
         currency_code = COALESCE(?, currency_code), recipient_id = ?, flags_json = '{}', status = 'draft',
         reviewed_at = datetime('now'), reviewed_by = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(vendorId, vendorName, originalBillNo, billNoKey(originalBillNo), originalDate,
      typeof b.currencyCode === "string" && /^[A-Za-z]{3}$/.test(b.currencyCode) ? b.currencyCode.toUpperCase() : null,
      b.recipientId || null, req.userId, bill.id);
  })();
  res.json(fullBill(getBill(bill.id, req.organizationId), req.organizationId));
}));

router.post("/:id/extract", handle((req, res) => {
  const bill = getBill(req.params.id, req.organizationId);
  if (bill.status === "processing") throw new HttpError(409, "This bill is already being read");
  startProcessing(bill.id, req.organizationId);
  res.status(202).json(fullBill(getBill(bill.id, req.organizationId), req.organizationId));
}));

router.delete("/:id", handle((req, res) => {
  const bill = getBill(req.params.id, req.organizationId);
  const files = db.prepare("SELECT storage_key FROM bill_files WHERE bill_id = ?").all(bill.id);
  db.prepare("DELETE FROM bills WHERE id = ?").run(bill.id);
  files.forEach((f) => storage.remove(f.storage_key));
  res.status(204).send();
}));

router.get("/:id/files/:fileId", handle((req, res) => {
  const f = db
    .prepare("SELECT * FROM bill_files WHERE id = ? AND bill_id = ? AND organization_id = ?")
    .get(req.params.fileId, req.params.id, req.organizationId);
  if (!f) throw notFound("File not found");
  res.set("Cache-Control", "private, max-age=3600");
  res.type(f.mime_type).sendFile(storage.absolutePath(f.storage_key));
}));

module.exports = router;
