const express = require("express");
const db = require("../db");
const storage = require("../lib/storage");
const { HttpError, handle } = require("../lib/http");
const invoices = require("../lib/invoices");
const pdf = require("../lib/documents/pdf");

// Generated invoices (Roadmap Phase 4)
// GET  /api/invoices?q=                   list, newest first
// GET  /api/invoices/capabilities         which document types this server can make
// GET  /api/invoices/:id                  details
// POST /api/invoices/:id/regenerate       make the files again — same invoice number and date
// GET  /api/invoices/:id/file?format=pdf|docx   download, named from the saved filename pattern

const router = express.Router();
const TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

router.get("/", handle((req, res) => {
  const args = [req.organizationId];
  let where = "i.organization_id = ?";
  if (req.query.q) {
    where += " AND (i.invoice_no LIKE ? OR b.vendor_name LIKE ? OR b.original_bill_no LIKE ?)";
    const q = `%${req.query.q}%`;
    args.push(q, q, q);
  }
  const rows = db.prepare(`SELECT i.* FROM invoices i JOIN bills b ON b.id = i.bill_id WHERE ${where} ORDER BY i.created_at DESC LIMIT 200`).all(...args);
  res.json(rows.map(invoices.toApi));
}));

router.get("/capabilities", handle((req, res) => res.json(pdf.capabilities())));

router.get("/:id", handle((req, res) => {
  res.json(invoices.toApi(invoices.getInvoice(req.organizationId, req.params.id)));
}));

router.post("/:id/regenerate", handle(async (req, res) => {
  res.json(invoices.toApi(await invoices.regenerate(req.organizationId, req.params.id, req.body || {})));
}));

router.get("/:id/file", handle(async (req, res) => {
  const format = req.query.format === "docx" ? "docx" : "pdf";
  let inv = invoices.getInvoice(req.organizationId, req.params.id);
  if (inv.status !== "ready") throw new HttpError(409, inv.error || "This invoice is not ready yet. Try Regenerate.");
  if (format === "pdf") inv = await invoices.ensurePdf(req.organizationId, inv);
  const key = format === "pdf" ? inv.pdf_storage_key : inv.docx_storage_key;
  if (!key) throw new HttpError(409, inv.pdf_error || "The PDF is not available. Download the Word file instead.");
  const name = `${inv.filename_base || "invoice"}.${format}`;
  res.set("Content-Disposition", `attachment; filename="${name.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.set("X-Filename", encodeURIComponent(name));
  res.type(TYPES[format]).send(storage.read(key));
}));

module.exports = router;
