// Invoice numbering — Design Document v5.1, Sections 6.8 and 8.8.
//
// The invoice number is the customer's own number, assigned by the app when
// an invoice is generated. It is never taken from the vendor's original bill
// number (that one only identifies the source bill and feeds the filename).
//
// Phase 1 uses formatNumber/previewNext for the settings screen preview.
// allocateNext is the transactional allocator Phase 4 calls from
// POST /api/bills/:id/convert; it is built and tested now so the numbering
// rules are fixed before any invoice is generated.

const db = require("../db");

const PLACEHOLDERS = ["Prefix", "YYYY", "YY", "MM", "Seq"];
const RESET_RULES = ["never", "yearly", "monthly"];

function periodKey(resetRule, date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  if (resetRule === "yearly") return `${y}`;
  if (resetRule === "monthly") return `${y}-${m}`;
  return "all";
}

/** Returns a list of problems with a numbering configuration (empty = valid). */
function validateConfig(cfg) {
  const errors = [];
  const pattern = cfg.formatPattern;
  if (typeof pattern !== "string" || !pattern.trim()) errors.push("Number format is required");
  else {
    const used = [...pattern.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]);
    const unknown = used.filter((p) => !PLACEHOLDERS.includes(p));
    if (unknown.length) errors.push(`Unknown placeholder(s): ${unknown.map((u) => `{${u}}`).join(", ")}`);
    if (!used.includes("Seq")) errors.push("Number format must include {Seq}");
    const literal = pattern.replace(/\{[^}]*\}/g, "");
    if (/[\\/:*?"<>|]/.test(literal)) errors.push('Number format cannot contain \\ / : * ? " < > |');
    const hasYear = used.includes("YYYY") || used.includes("YY");
    if (cfg.resetRule === "yearly" && !hasYear)
      errors.push("A yearly reset needs {YYYY} or {YY} in the format, or numbers would repeat");
    if (cfg.resetRule === "monthly" && !(hasYear && used.includes("MM")))
      errors.push("A monthly reset needs a year and {MM} in the format, or numbers would repeat");
  }
  if (!RESET_RULES.includes(cfg.resetRule)) errors.push("Reset rule must be never, yearly or monthly");
  if (!Number.isInteger(cfg.padding) || cfg.padding < 1 || cfg.padding > 10)
    errors.push("Digits must be a whole number from 1 to 10");
  if (!Number.isInteger(cfg.nextNumber) || cfg.nextNumber < 1)
    errors.push("Next number must be a whole number of 1 or more");
  if (typeof cfg.prefix === "string" && /[\\/:*?"<>|]/.test(cfg.prefix))
    errors.push('Prefix cannot contain \\ / : * ? " < > |');
  return errors;
}

function formatNumber(cfg, seq, date = new Date()) {
  const y = String(date.getFullYear());
  const values = {
    Prefix: cfg.prefix || "",
    YYYY: y,
    YY: y.slice(2),
    MM: String(date.getMonth() + 1).padStart(2, "0"),
    Seq: String(seq).padStart(cfg.padding, "0"),
  };
  return cfg.formatPattern.replace(/\{([^}]*)\}/g, (_, k) => values[k] ?? "");
}

function rowToCfg(row) {
  return {
    id: row.id,
    issuingIdentityId: row.issuing_identity_id,
    mode: row.mode,
    formatPattern: row.format_pattern,
    prefix: row.prefix,
    padding: row.padding,
    startNumber: row.start_number,
    nextNumber: row.next_number,
    resetRule: row.reset_rule,
    periodKey: row.period_key,
    lastIssuedNumber: row.last_issued_number,
  };
}

/** Which sequence number the next invoice would get on `date` (no side effects). */
function nextSeqFor(cfg, date) {
  const key = periodKey(cfg.resetRule, date);
  const rolledOver = cfg.resetRule !== "never" && cfg.periodKey && cfg.periodKey !== key;
  return { seq: rolledOver ? 1 : cfg.nextNumber, key };
}

function previewNext(cfg, date = new Date()) {
  if (cfg.mode === "blank") return null;
  return formatNumber(cfg, nextSeqFor(cfg, date).seq, date);
}

/**
 * Atomically assigns the next invoice number in a series. SQLite serialises
 * write transactions, so two conversions at the same moment cannot receive the
 * same number. (PostgreSQL port: SELECT ... FOR UPDATE on the series row.)
 * Returns { invoiceNo, seq } — invoiceNo is null in Blank mode.
 */
function allocateNext(organizationId, seriesId, date = new Date()) {
  return db.transaction(() => {
    const row = db
      .prepare("SELECT * FROM invoice_number_series WHERE id = ? AND organization_id = ?")
      .get(seriesId, organizationId);
    if (!row) throw Object.assign(new Error("Numbering series not found"), { status: 404 });
    const cfg = rowToCfg(row);
    if (cfg.mode === "blank") return { invoiceNo: null, seq: null };
    const { seq, key } = nextSeqFor(cfg, date);
    db.prepare(
      `UPDATE invoice_number_series
       SET next_number = ?, last_issued_number = ?, period_key = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(seq + 1, seq, key, row.id);
    return { invoiceNo: formatNumber(cfg, seq, date), seq };
  }).immediate();
}

/** The series that applies to invoices issued under a given identity. */
function resolveSeries(organizationId, issuingIdentityId) {
  const org = db.prepare("SELECT invoice_numbering_scope FROM organizations WHERE id = ?").get(organizationId);
  if (org && org.invoice_numbering_scope === "per_identity" && issuingIdentityId) {
    const own = db
      .prepare("SELECT * FROM invoice_number_series WHERE organization_id = ? AND issuing_identity_id = ?")
      .get(organizationId, issuingIdentityId);
    if (own) return own;
  }
  return db
    .prepare("SELECT * FROM invoice_number_series WHERE organization_id = ? AND issuing_identity_id IS NULL")
    .get(organizationId);
}

module.exports = { PLACEHOLDERS, validateConfig, formatNumber, previewNext, allocateNext, resolveSeries, rowToCfg, periodKey };
