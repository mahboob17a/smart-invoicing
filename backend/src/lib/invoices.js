// Conversion & generation (Design Document v5.1 §7.3, §8.4, §8.8; Roadmap Phase 4).
//
// A reviewed bill + Recipient + Conversion Rule + Template + Issuing Identity
// -> invoice values -> Word file (+ PDF) with a filename from the saved pattern.
//
// Invoice-number rules:
//  - The number is allocated only when an invoice is generated, never for
//    previews or drafts.
//  - Before a number is taken, the template is test-filled with the preview
//    number, so a broken template fails *before* any number is used.
//  - Allocation and the invoice row are written in one IMMEDIATE transaction:
//    concurrent conversions (several phones) get distinct, consecutive numbers,
//    and a number always belongs to an invoice row — no gaps.
//  - Regenerate and re-download keep the same number (and invoice date).
//  - Blank mode assigns nothing; the field is left empty for handwriting.

const { randomUUID } = require("crypto");
const db = require("../db");
const storage = require("./storage");
const { badRequest, notFound, HttpError } = require("./http");
const { allocateNext, resolveSeries, rowToCfg, previewNext } = require("./invoiceNumber");
const { renderFilename, DEFAULT_PATTERN } = require("./filename");
const { computeValues, issuingIdentityFor } = require("./templates/values");
const render = require("./templates/render");
const pdf = require("./documents/pdf");

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function getBill(orgId, billId) {
  const b = db.prepare("SELECT * FROM bills WHERE id = ? AND organization_id = ?").get(billId, orgId);
  if (!b) throw notFound("Bill not found");
  return b;
}

function invoiceForBill(orgId, billId) {
  return db.prepare("SELECT * FROM invoices WHERE organization_id = ? AND bill_id = ?").get(orgId, billId);
}

function getInvoice(orgId, id) {
  const inv = db.prepare("SELECT * FROM invoices WHERE id = ? AND organization_id = ?").get(id, orgId);
  if (!inv) throw notFound("Invoice not found");
  return inv;
}

/** Bill lines as the conversion engine needs them; incomplete lines are an error, not a guess. */
function billLines(billId) {
  const rows = db.prepare("SELECT * FROM bill_line_items WHERE bill_id = ? ORDER BY position").all(billId);
  if (!rows.length) throw badRequest("This bill has no line items. Add at least one on the review screen.");
  return rows.map((r, i) => {
    if (r.qty === null || r.original_rate === null)
      throw badRequest(`Line ${i + 1}${r.description ? ` (${r.description})` : ""} needs a quantity and a rate before converting.`);
    return { description: r.description || "", qty: r.qty, unit: r.unit || "", rate: r.original_rate };
  });
}

/**
 * Resolves the choices for a conversion. Anything not given falls back to:
 * the bill's recipient, then the only/first one; the first rule; the default template;
 * the first issuing identity.
 */
function resolveChoices(orgId, bill, input = {}, existing = null) {
  const pick = (table, id, what, extra = "") => {
    if (id) {
      const row = db.prepare(`SELECT * FROM ${table} WHERE id = ? AND organization_id = ?`).get(id, orgId);
      if (!row) throw badRequest(`That ${what} does not exist in your account`);
      return row;
    }
    return db.prepare(`SELECT * FROM ${table} WHERE organization_id = ? ${extra} ORDER BY created_at LIMIT 1`).get(orgId) || null;
  };
  const recipient = pick("recipients", input.recipientId || existing?.recipient_id || bill.recipient_id, "client");
  const rule = pick("conversion_rule_profiles", input.conversionRuleId || existing?.conversion_rule_id || bill.conversion_rule_id, "conversion rule");
  let template;
  const templateId = input.templateId || existing?.template_id;
  if (templateId) template = pick("templates", templateId, "template");
  else template = db.prepare("SELECT * FROM templates WHERE organization_id = ? AND status = 'ready' ORDER BY is_default DESC, created_at LIMIT 1").get(orgId) || null;
  // The identity (and so the number series) is fixed once a number is issued.
  const identityId = existing ? existing.issuing_identity_id : input.issuingIdentityId || null;
  if (identityId && !db.prepare("SELECT id FROM issuing_identities WHERE id = ? AND organization_id = ?").get(identityId, orgId))
    throw badRequest("That issuing identity does not exist in your account");
  const identity = issuingIdentityFor(orgId, identityId);

  if (!recipient) throw badRequest("Add a client (Settings → Clients) before converting a bill.");
  if (!rule) throw badRequest("Add a conversion rule (Settings → Conversion rules) before converting a bill.");
  if (!template) throw badRequest("Set up an invoice template (Settings → Invoice templates) before converting a bill.");
  if (template.status !== "ready") throw badRequest(`The template "${template.name}" still needs its fields mapped before it can be used.`);
  if (!identity.name) throw badRequest("Complete your company profile or issuing identity before converting a bill.");
  return { recipient, rule, template, identity };
}

const valuesFor = (bill, lines, ch, invoiceNo, invoiceDate) => computeValues({
  identity: ch.identity, recipient: ch.recipient, rule: ch.rule, invoiceNo, invoiceDate,
  bill: { vendorName: bill.vendor_name, originalBillNo: bill.original_bill_no, originalDate: bill.original_date },
  lines,
});

function filenameFor(orgId, bill, ch, invoiceNo, seq, seriesRow) {
  const row = db.prepare("SELECT pattern_string FROM filename_patterns WHERE organization_id = ?").get(orgId);
  const pattern = row ? row.pattern_string : DEFAULT_PATTERN;
  const padded = seq != null && seriesRow ? String(seq).padStart(seriesRow.padding, "0") : "";
  const values = {
    IssuingName: ch.identity.name, RecipientCode: ch.recipient.code || ch.recipient.name, RecipientName: ch.recipient.name,
    VendorName: bill.vendor_name, OriginalBillNo: bill.original_bill_no, OriginalDate: bill.original_date,
    InvoiceNo: invoiceNo, Seq: padded,
  };
  let name = renderFilename(pattern, values, "x").replace(/\.x$/, "");
  // Every file needs something unique; a bill with no original number in Blank mode has none.
  const used = [...pattern.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]);
  if (!used.some((p) => ["OriginalBillNo", "InvoiceNo", "Seq"].includes(p) && values[p])) name += `_${bill.id.slice(0, 8)}`;
  return name.slice(0, 180);
}

/** What converting would produce, without taking a number. */
function preview(orgId, billId, input) {
  const bill = getBill(orgId, billId);
  const existing = invoiceForBill(orgId, billId);
  const ch = resolveChoices(orgId, bill, input, existing);
  const lines = billLines(bill.id);
  let invoiceNo, mode, seriesRow = null;
  if (existing) {
    invoiceNo = existing.invoice_no;
    mode = "kept";
    seriesRow = existing.series_id ? db.prepare("SELECT * FROM invoice_number_series WHERE id = ?").get(existing.series_id) : null;
  } else {
    seriesRow = resolveSeries(orgId, ch.identity.id);
    if (!seriesRow) throw badRequest("Set up invoice numbering (Settings → Invoice numbering) before converting a bill.");
    invoiceNo = previewNext(rowToCfg(seriesRow));
    mode = seriesRow.mode;
  }
  const invoiceDate = existing ? existing.invoice_date : today();
  const values = valuesFor(bill, lines, ch, invoiceNo, invoiceDate);
  return {
    bill, existing, ch, lines, seriesRow, values,
    public: {
      invoiceNo, numberMode: mode, invoiceDate,
      filename: filenameFor(orgId, bill, ch, invoiceNo, existing ? existing.seq : invoiceNo ? rowToCfg(seriesRow).nextNumber : null, seriesRow),
      recipientId: ch.recipient.id, conversionRuleId: ch.rule.id, templateId: ch.template.id, issuingIdentityId: ch.identity.id,
      templateName: ch.template.name, currency: values.Currency,
      subtotal: values.Subtotal, taxLabel: values.TaxLabel, taxRate: values.TaxRate, taxAmount: values.TaxAmount, grandTotal: values.GrandTotal,
      items: values.items,
      pdf: pdf.capabilities(),
    },
  };
}

/** Renders Word + PDF for an invoice row that already holds its number. */
async function renderInto(orgId, invoiceId, bill, ch, values, filename) {
  const old = db.prepare("SELECT docx_storage_key, pdf_storage_key FROM invoices WHERE id = ?").get(invoiceId);
  try {
    const { docx, version, logo } = await render.renderDocx(ch.template, values, ch.identity.logo);
    const { pdf: pdfBuf, error: pdfError } = await pdf.toPdf({ docx, template: ch.template, values, logo });
    const docxKey = storage.save(orgId, docx, "docx", "invoices");
    const pdfKey = pdfBuf ? storage.save(orgId, pdfBuf, "pdf", "invoices") : null;
    db.prepare(
      `UPDATE invoices SET status = 'ready', error = NULL, docx_storage_key = ?, pdf_storage_key = ?, pdf_error = ?,
         template_id = ?, template_version = ?, template_name = ?, recipient_id = ?, conversion_rule_id = ?,
         values_json = ?, currency_code = ?, subtotal = ?, tax_amount = ?, grand_total = ?, filename_base = ?,
         generation_count = generation_count + 1, generated_at = datetime('now'), bill_reviewed_at = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(docxKey, pdfKey, pdfError, ch.template.id, version, ch.template.name, ch.recipient.id, ch.rule.id,
      JSON.stringify(values), values.Currency, values.Subtotal, values.TaxAmount, values.GrandTotal, filename, bill.reviewed_at, invoiceId);
    if (old?.docx_storage_key) storage.remove(old.docx_storage_key);
    if (old?.pdf_storage_key) storage.remove(old.pdf_storage_key);
  } catch (e) {
    const message = e.name === "TemplateError" || e instanceof HttpError ? e.message : "The invoice document could not be made";
    if (!(e.name === "TemplateError" || e instanceof HttpError)) console.error("Invoice render failed:", e);
    db.prepare("UPDATE invoices SET status = 'failed', error = ?, updated_at = datetime('now') WHERE id = ?").run(message, invoiceId);
  }
}

/** POST /api/bills/:id/convert */
async function generate(orgId, userId, billId, input) {
  const bill = getBill(orgId, billId);
  if (bill.status !== "draft") throw new HttpError(409, "Review and save this bill before converting it.");
  const already = invoiceForBill(orgId, billId);
  if (already) throw new HttpError(409, `This bill is already invoice ${already.invoice_no || "(number left blank)"}. Use Regenerate to make it again with the same number.`, { invoiceId: already.id });
  const p = preview(orgId, billId, input);

  // Test-fill the template before any number is taken (no gaps from broken templates).
  await render.renderDocx(p.ch.template, p.values, p.ch.identity.logo);

  const invoiceId = randomUUID();
  const date = new Date();
  let allocated;
  try {
    allocated = db.transaction(() => {
      if (invoiceForBill(orgId, billId)) throw new HttpError(409, "This bill was converted on another device a moment ago.");
      const series = resolveSeries(orgId, p.ch.identity.id);
      if (!series) throw badRequest("Set up invoice numbering before converting a bill.");
      const { invoiceNo, seq } = allocateNext(orgId, series.id, date);
      db.prepare(
        `INSERT INTO invoices (id, organization_id, bill_id, issuing_identity_id, series_id, invoice_no, seq, invoice_date,
           recipient_id, conversion_rule_id, template_id, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'generating', ?)`
      ).run(invoiceId, orgId, billId, p.ch.identity.id, series.id, invoiceNo, seq, today(),
        p.ch.recipient.id, p.ch.rule.id, p.ch.template.id, userId);
      return { invoiceNo, seq, series };
    }).immediate();
  } catch (e) {
    if (String(e.code).startsWith("SQLITE_CONSTRAINT")) throw new HttpError(409, "This bill was converted on another device a moment ago.");
    throw e;
  }

  const values = valuesFor(bill, p.lines, p.ch, allocated.invoiceNo, today());
  const filename = filenameFor(orgId, bill, p.ch, allocated.invoiceNo, allocated.seq, allocated.series);
  await renderInto(orgId, invoiceId, bill, p.ch, values, filename);
  return getInvoice(orgId, invoiceId);
}

/** POST /api/invoices/:id/regenerate — same number and date; current bill data; optional new client/rule/template. */
async function regenerate(orgId, invoiceId, input) {
  const inv = getInvoice(orgId, invoiceId);
  const bill = getBill(orgId, inv.bill_id);
  if (bill.status !== "draft") throw new HttpError(409, "Review and save the bill before regenerating its invoice.");
  const ch = resolveChoices(orgId, bill, input, inv);
  const lines = billLines(bill.id);
  const values = valuesFor(bill, lines, ch, inv.invoice_no, inv.invoice_date);
  const series = inv.series_id ? db.prepare("SELECT * FROM invoice_number_series WHERE id = ?").get(inv.series_id) : null;
  const filename = filenameFor(orgId, bill, ch, inv.invoice_no, inv.seq, series);
  await renderInto(orgId, inv.id, bill, ch, values, filename);
  return getInvoice(orgId, inv.id);
}

/** Makes a PDF that is missing (e.g. LibreOffice was installed after generation). */
async function ensurePdf(orgId, inv) {
  // Only LibreOffice can make an exact PDF later from the stored Word file.
  if (inv.pdf_storage_key || !inv.docx_storage_key || pdf.capabilities().engine !== "libreoffice") return inv;
  const { pdf: buf, error } = await pdf.toPdf({ docx: storage.read(inv.docx_storage_key), template: { source: "uploaded" }, values: {}, logo: null });
  if (!buf) {
    db.prepare("UPDATE invoices SET pdf_error = ? WHERE id = ?").run(error, inv.id);
    return getInvoice(orgId, inv.id);
  }
  const key = storage.save(orgId, buf, "pdf", "invoices");
  db.prepare("UPDATE invoices SET pdf_storage_key = ?, pdf_error = NULL WHERE id = ?").run(key, inv.id);
  return getInvoice(orgId, inv.id);
}

function toApi(inv) {
  const bill = db.prepare("SELECT vendor_name, original_bill_no, original_date, updated_at, reviewed_at FROM bills WHERE id = ?").get(inv.bill_id) || {};
  const values = inv.values_json ? JSON.parse(inv.values_json) : null;
  return {
    id: inv.id,
    billId: inv.bill_id,
    invoiceNo: inv.invoice_no,
    invoiceDate: inv.invoice_date,
    status: inv.status,
    error: inv.error,
    vendorName: bill.vendor_name,
    originalBillNo: bill.original_bill_no,
    originalDate: bill.original_date,
    recipientId: inv.recipient_id,
    recipientName: values?.RecipientName || null,
    conversionRuleId: inv.conversion_rule_id,
    templateId: inv.template_id,
    templateName: inv.template_name,
    templateVersion: inv.template_version,
    issuingIdentityId: inv.issuing_identity_id,
    currency: inv.currency_code,
    subtotal: inv.subtotal,
    taxLabel: values?.TaxLabel,
    taxRate: values?.TaxRate,
    taxAmount: inv.tax_amount,
    grandTotal: inv.grand_total,
    items: values?.items || [],
    filename: inv.filename_base,
    hasDocx: !!inv.docx_storage_key,
    hasPdf: !!inv.pdf_storage_key,
    pdfError: inv.pdf_storage_key ? null : inv.pdf_error,
    generationCount: inv.generation_count,
    // The bill was corrected after these files were made; Regenerate brings them up to date.
    billChangedSince: !!(inv.generated_at && bill.reviewed_at !== inv.bill_reviewed_at),
    createdAt: inv.created_at,
    generatedAt: inv.generated_at,
  };
}

/** At startup: an invoice left "generating" by a crash keeps its number and can be regenerated. */
function recoverInterrupted() {
  db.prepare("UPDATE invoices SET status = 'failed', error = 'Making the files was interrupted. Tap Regenerate.' WHERE status = 'generating'").run();
}

module.exports = { recoverInterrupted, preview, generate, regenerate, ensurePdf, getInvoice, invoiceForBill, toApi };
