const express = require("express");
const { randomUUID } = require("crypto");
const db = require("../db");
const { badRequest, notFound, handle } = require("../lib/http");
const { validateConfig, previewNext, rowToCfg, PLACEHOLDERS } = require("../lib/invoiceNumber");

// Invoice Numbering (Design Document v5.1, Section 6.8).
// GET  /api/invoice-numbering              -> { scope, placeholders, series: [...] }
// PUT  /api/invoice-numbering/scope        -> { scope: 'per_identity' | 'shared' }
// POST /api/invoice-numbering              -> create a series
// PUT  /api/invoice-numbering/:id          -> update a series (future invoices only)
// GET  /api/invoice-numbering/:id/preview  -> next number, without consuming it
// POST /api/invoice-numbering/preview      -> preview an unsaved configuration

const router = express.Router();

function toApi(row) {
  const cfg = rowToCfg(row);
  return { ...cfg, preview: previewNext(cfg) };
}

function readConfig(body, base = {}) {
  const pick = (k, d) => (body[k] !== undefined ? body[k] : base[k] !== undefined ? base[k] : d);
  const cfg = {
    mode: pick("mode", "auto"),
    formatPattern: String(pick("formatPattern", "{Prefix}-{YYYY}-{Seq}")).trim(),
    prefix: String(pick("prefix", "INV") ?? "").trim(),
    padding: Number(pick("padding", 4)),
    resetRule: pick("resetRule", "never"),
    nextNumber: Number(pick("nextNumber", pick("startNumber", 1))),
    issuingIdentityId: pick("issuingIdentityId", null) || null,
  };
  if (!["auto", "blank"].includes(cfg.mode)) throw badRequest("mode must be auto or blank");
  const errors = validateConfig(cfg);
  if (errors.length) throw badRequest(errors[0], errors);
  return cfg;
}

async function checkIdentity(orgId, identityId) {
  if (!identityId) return;
  const ok = await db.get("SELECT id FROM issuing_identities WHERE id = ? AND organization_id = ?", identityId, orgId);
  if (!ok) throw badRequest("That issuing identity does not exist in your account");
}

router.get("/", handle(async (req, res) => {
  const org = await db.get("SELECT invoice_numbering_scope FROM organizations WHERE id = ?", req.organizationId);
  const rows = await db.all("SELECT * FROM invoice_number_series WHERE organization_id = ? ORDER BY created_at ASC", req.organizationId);
  res.json({ scope: org.invoice_numbering_scope, placeholders: PLACEHOLDERS, series: rows.map(toApi) });
}));

router.put("/scope", handle(async (req, res) => {
  const { scope } = req.body || {};
  if (!["per_identity", "shared"].includes(scope)) throw badRequest("scope must be per_identity or shared");
  await db.run("UPDATE organizations SET invoice_numbering_scope = ? WHERE id = ?", scope, req.organizationId);
  res.json({ scope });
}));

router.post("/preview", handle(async (req, res) => {
  const cfg = readConfig(req.body || {});
  res.json({ preview: previewNext({ ...cfg, periodKey: null }) });
}));

router.post("/", handle(async (req, res) => {
  const cfg = readConfig(req.body || {});
  await checkIdentity(req.organizationId, cfg.issuingIdentityId);
  const clash = await db.get("SELECT id FROM invoice_number_series WHERE organization_id = ? AND issuing_identity_id IS NOT DISTINCT FROM ?", req.organizationId, cfg.issuingIdentityId);
  if (clash)
    throw badRequest(
      cfg.issuingIdentityId
        ? "This issuing identity already has a numbering series. Edit it instead."
        : "Your account already has a shared numbering series. Edit it instead."
    );
  const id = randomUUID();
  await db.run(`INSERT INTO invoice_number_series
      (id, organization_id, issuing_identity_id, mode, format_pattern, prefix, padding, start_number, next_number, reset_rule)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, req.organizationId, cfg.issuingIdentityId, cfg.mode, cfg.formatPattern, cfg.prefix,
    cfg.padding, cfg.nextNumber, cfg.nextNumber, cfg.resetRule);
  res.status(201).json(toApi(await db.get("SELECT * FROM invoice_number_series WHERE id = ?", id)));
}));

router.put("/:id", handle(async (req, res) => {
  const row = await db.get("SELECT * FROM invoice_number_series WHERE id = ? AND organization_id = ?", req.params.id, req.organizationId);
  if (!row) throw notFound("Numbering series not found");
  const current = rowToCfg(row);
  const cfg = readConfig(req.body || {}, current);
  // Section 6.8: the next number may move forward but never back onto a
  // number that has already been issued in this series.
  if (current.lastIssuedNumber != null && cfg.nextNumber <= current.lastIssuedNumber) {
    throw badRequest(
      `Number ${current.lastIssuedNumber} has already been issued. The next number must be ${current.lastIssuedNumber + 1} or higher.`
    );
  }
  await db.run(`UPDATE invoice_number_series
     SET mode = ?, format_pattern = ?, prefix = ?, padding = ?, next_number = ?, reset_rule = ?, updated_at = utc_now()
     WHERE id = ?`, cfg.mode, cfg.formatPattern, cfg.prefix, cfg.padding, cfg.nextNumber, cfg.resetRule, row.id);
  res.json(toApi(await db.get("SELECT * FROM invoice_number_series WHERE id = ?", row.id)));
}));

router.get("/:id/preview", handle(async (req, res) => {
  const row = await db.get("SELECT * FROM invoice_number_series WHERE id = ? AND organization_id = ?", req.params.id, req.organizationId);
  if (!row) throw notFound("Numbering series not found");
  res.json({ preview: previewNext(rowToCfg(row)) });
}));

module.exports = router;
