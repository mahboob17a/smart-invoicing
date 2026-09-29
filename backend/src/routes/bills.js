const express = require("express");
const { randomUUID } = require("crypto");
const multer = require("multer");
const db = require("../db");
const storage = require("../lib/storage");
const { badRequest, notFound, HttpError, handle } = require("../lib/http");
const { startProcessing, findDuplicates, upsertVendor, replaceItems } = require("../lib/bills");
const { parseDate, parseNumber, billNoKey, round } = require("../lib/extraction/normalize");
const { providerName } = require("../lib/extraction");
const invoices = require("../lib/invoices");

// Bills (Design Document §8.1–§8.3, Roadmap v1.1 Phase 2)
// POST   /api/bills                     multipart "files" (1–5 images, or 1 PDF) -> 202, reading starts
// GET    /api/bills?status=&q=          list
// GET    /api/bills/summary             counts for Home
// GET    /api/bills/:id                 bill + items + files + possible duplicates
// PUT    /api/bills/:id                 save the reviewer's corrections -> status "draft"
// POST   /api/bills/:id/extract         read the bill again
// DELETE /api/bills/:id
// GET    /api/bills/:id/files/:fileId   the original image/PDF (signed-in users of the same organization only)
// POST   /api/bills/:id/convert/preview totals, invoice number preview and filename — takes no number
// POST   /api/bills/:id/convert         generate the invoice { recipientId?, conversionRuleId?, templateId?, issuingIdentityId? }

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

async function getBill(id, orgId) {
  const b = await db.get("SELECT * FROM bills WHERE id = ? AND organization_id = ?", id, orgId);
  if (!b) throw notFound("Bill not found");
  return b;
}

async function itemsOf(billId) {
  return (await db.all("SELECT * FROM bill_line_items WHERE bill_id = ? ORDER BY position", billId)).map((i) => ({
    id: i.id, description: i.description, qty: i.qty, unit: i.unit, rate: i.original_rate, amount: i.amount,
    flagged: !!i.flagged_unclear, reason: i.flag_reason,
  }));
}

async function filesOf(bill) {
  return (await db.all("SELECT id, mime_type, size_bytes, page_index FROM bill_files WHERE bill_id = ? ORDER BY page_index", bill.id))
    .map((f) => ({ id: f.id, mimeType: f.mime_type, sizeBytes: f.size_bytes, page: f.page_index + 1, url: `/api/bills/${bill.id}/files/${f.id}` }));
}

async function summaryOf(b) {
  const items = await db.get("SELECT COUNT(*) n, SUM(amount) total, SUM(flagged_unclear) flagged FROM bill_line_items WHERE bill_id = ?", b.id);
  const first = await db.get("SELECT id FROM bill_files WHERE bill_id = ? ORDER BY page_index LIMIT 1", b.id);
  const flags = JSON.parse(b.flags_json || "{}");
  const inv = await db.get("SELECT id, invoice_no, status FROM invoices WHERE bill_id = ?", b.id);
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
    invoice: inv ? { id: inv.id, invoiceNo: inv.invoice_no, status: inv.status } : null,
  };
}

async function fullBill(b, orgId) {
  return {
    ...(await summaryOf(b)),
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
    items: await itemsOf(b.id),
    files: await filesOf(b),
    possibleDuplicates: b.status === "processing" ? [] : await findDuplicates(orgId, b),
  };
}

router.post("/", upload.array("files", MAX_FILES), handle(async (req, res) => {
  const files = req.files || [];
  if (!files.length) throw badRequest('Attach the bill as multipart field "files"');
  const pdfs = files.filter((f) => f.mimetype === "application/pdf");
  if (pdfs.length && files.length > 1) throw badRequest("Upload a PDF on its own, or up to 5 photos");

  const id = randomUUID();
  const saved = [];
  try {
    for (const f of files) saved.push(await storage.save(req.organizationId, f.buffer, TYPES[f.mimetype]));
    await db.tx(async () => {
      await db.run("INSERT INTO bills (id, organization_id, status, created_by) VALUES (?, ?, 'processing', ?)", id, req.organizationId, req.userId);
      for (const [i, f] of files.entries()) {
        await db.run("INSERT INTO bill_files (id, bill_id, organization_id, storage_key, mime_type, size_bytes, page_index) VALUES (?, ?, ?, ?, ?, ?, ?)",
          randomUUID(), id, req.organizationId, saved[i], f.mimetype, f.size, i);
      }
    });
  } catch (e) {
    await Promise.all(saved.map((k) => storage.remove(k)));
    throw e;
  }
  await startProcessing(id, req.organizationId);
  res.status(202).json({ ...(await fullBill(await getBill(id, req.organizationId), req.organizationId)), aiProvider: providerName() });
}));

router.get("/summary", handle(async (req, res) => {
  const rows = await db.all(`SELECT CASE WHEN EXISTS (SELECT 1 FROM invoices i WHERE i.bill_id = bills.id) THEN 'converted' ELSE status END status, COUNT(*) n
     FROM bills WHERE organization_id = ? GROUP BY 1`, req.organizationId);
  const by = Object.fromEntries(rows.map((r) => [r.status, r.n]));
  const recent = await db.all("SELECT * FROM bills WHERE organization_id = ? ORDER BY created_at DESC LIMIT 5", req.organizationId);
  res.json({
    processing: by.processing || 0,
    needsReview: (by.needs_review || 0) + (by.failed || 0),
    drafts: by.draft || 0,
    converted: by.converted || 0,
    total: rows.reduce((a, r) => a + r.n, 0),
    aiProvider: providerName(),
    recent: await Promise.all(recent.map(summaryOf)),
  });
}));

router.get("/", handle(async (req, res) => {
  const { status, q } = req.query;
  const where = ["organization_id = ?"];
  const args = [req.organizationId];
  const converted = "EXISTS (SELECT 1 FROM invoices i WHERE i.bill_id = bills.id)";
  if (status === "needs_review") where.push("status IN ('needs_review','failed','processing')");
  else if (status === "converted") where.push(converted);
  else if (status === "draft") where.push(`status = 'draft' AND NOT ${converted}`);
  else if (status) { where.push("status = ?"); args.push(String(status)); }
  if (q) {
    where.push("(vendor_name ILIKE ? OR original_bill_no ILIKE ? OR EXISTS (SELECT 1 FROM invoices i WHERE i.bill_id = bills.id AND i.invoice_no ILIKE ?))");
    args.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const rows = await db.all(`SELECT * FROM bills WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT 200`, ...args);
  res.json(await Promise.all(rows.map(summaryOf)));
}));

router.get("/:id", handle(async (req, res) => {
  res.json(await fullBill(await getBill(req.params.id, req.organizationId), req.organizationId));
}));

router.put("/:id", handle(async (req, res) => {
  const bill = await getBill(req.params.id, req.organizationId);
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
    const ok = await db.get("SELECT id FROM recipients WHERE id = ? AND organization_id = ?", b.recipientId, req.organizationId);
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

  await db.tx(async () => {
    const vendorId = await upsertVendor(req.organizationId, vendorName);
    await replaceItems(bill.id, req.organizationId, items);
    // The reviewer has checked everything, so extraction flags are cleared.
    // The original AI reading stays in extraction_json (§8.2).
    await db.run(`UPDATE bills SET vendor_id = ?, vendor_name = ?, original_bill_no = ?, original_bill_no_key = ?, original_date = ?,
         currency_code = COALESCE(?, currency_code), recipient_id = ?, flags_json = '{}', status = 'draft',
         reviewed_at = utc_now_ms(), reviewed_by = ?, updated_at = utc_now()
       WHERE id = ?`, vendorId, vendorName, originalBillNo, billNoKey(originalBillNo), originalDate,
      typeof b.currencyCode === "string" && /^[A-Za-z]{3}$/.test(b.currencyCode) ? b.currencyCode.toUpperCase() : null,
      b.recipientId || null, req.userId, bill.id);
  });
  res.json(await fullBill(await getBill(bill.id, req.organizationId), req.organizationId));
}));

const hasInvoiceError = async (bill, action) => {
  const inv = await invoices.invoiceForBill(bill.organization_id, bill.id);
  if (inv) throw new HttpError(409, `This bill is invoice ${inv.invoice_no || "(number left blank)"}, so it can't be ${action}. Invoices are kept as accounting records.`);
};

router.post("/:id/extract", handle(async (req, res) => {
  const bill = await getBill(req.params.id, req.organizationId);
  await hasInvoiceError(bill, "read again");
  if (bill.status === "processing") throw new HttpError(409, "This bill is already being read");
  await startProcessing(bill.id, req.organizationId);
  res.status(202).json(await fullBill(await getBill(bill.id, req.organizationId), req.organizationId));
}));

router.delete("/:id", handle(async (req, res) => {
  const bill = await getBill(req.params.id, req.organizationId);
  await hasInvoiceError(bill, "deleted");
  const files = await db.all("SELECT storage_key FROM bill_files WHERE bill_id = ?", bill.id);
  await db.run("DELETE FROM bills WHERE id = ?", bill.id);
  await Promise.all(files.map((f) => storage.remove(f.storage_key)));
  res.status(204).send();
}));

router.post("/:id/convert/preview", handle(async (req, res) => {
  res.json((await invoices.preview(req.organizationId, req.params.id, req.body || {})).public);
}));

router.post("/:id/convert", handle(async (req, res) => {
  const inv = await invoices.generate(req.organizationId, req.userId, req.params.id, req.body || {});
  res.status(201).json(await invoices.toApi(inv));
}));

router.get("/:id/files/:fileId", handle(async (req, res) => {
  const f = await db.get("SELECT * FROM bill_files WHERE id = ? AND bill_id = ? AND organization_id = ?", req.params.fileId, req.params.id, req.organizationId);
  if (!f) throw notFound("File not found");
  res.set("Cache-Control", "private, max-age=3600");
  res.type(f.mime_type).send(await storage.read(f.storage_key));
}));

module.exports = router;
