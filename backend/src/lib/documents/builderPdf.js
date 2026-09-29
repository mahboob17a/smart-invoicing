// Built-in PDF for builder templates, used when LibreOffice is not installed.
// Draws the same layout as builder.js (the Word file): letterhead, accent
// rule, Bill To, item table with zebra rows, totals, supplier reference,
// declaration, signature and footer note. A4, points.
const PDFDocument = require("pdfkit");
const { validateConfig, COLUMNS } = require("../templates/builder");

const PAGE = { w: 595.28, h: 841.89, left: 50, right: 50, top: 45, bottom: 45 };
const ROW_PAD = { compact: 3, normal: 5, relaxed: 8 };
const INK = "#23282B";
const MUTED = "#555555";

function tint(hex, amount) {
  const n = parseInt(hex.replace("#", ""), 16);
  const mix = (v) => Math.round(v + (255 - v) * amount);
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => mix(v).toString(16).padStart(2, "0")).join("")}`;
}

// The standard PDF fonts only cover Western European characters.
const safe = (s) => String(s ?? "").replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF–—‘’“”•€]/g, "?");
const lines = (t) => String(t || "").split(/\r?\n/).filter(Boolean);

function render(config, values, logo) {
  const c = validateConfig(config).config;
  const accent = c.accentColor;
  const zebra = tint(accent, 0.9);
  const grid = tint(accent, 0.6);
  const doc = new PDFDocument({ size: "A4", margins: { top: PAGE.top, bottom: PAGE.bottom + 20, left: PAGE.left, right: PAGE.right }, info: { Title: `${c.title} ${values.InvoiceNo || ""}`.trim(), Author: values.IssuingName || "Smart Invoicing" } });
  const chunks = [];
  doc.on("data", (d) => chunks.push(d));
  const done = new Promise((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const width = PAGE.w - PAGE.left - PAGE.right;
  const font = (bold) => doc.font(bold ? "Helvetica-Bold" : "Helvetica");
  const text = (str, x, y, o = {}) => {
    font(o.bold).fontSize(o.size || 10).fillColor(o.color || INK);
    doc.text(safe(str), x, y, { width: o.width, align: o.align || "left", lineBreak: o.width !== undefined, oblique: o.italic });
    return doc.y;
  };
  const drawLogo = (x, y, maxW, maxH, align = "left") => {
    if (!logo || !["png", "jpg"].includes(logo.type)) return y;
    const ratio = logo.size ? logo.size.w / logo.size.h : 2;
    let w = maxW, h = w / ratio;
    if (h > maxH) { h = maxH; w = h * ratio; }
    const lx = align === "center" ? x + (maxW - w) / 2 : align === "right" ? x + maxW - w : x;
    try { doc.image(logo.buffer, lx, y, { width: w, height: h }); } catch { return y; }
    return y + h + 6;
  };

  // Footer note on every page
  const footer = () => {
    const y = PAGE.h - PAGE.bottom - 12;
    doc.save().moveTo(PAGE.left, y).lineTo(PAGE.w - PAGE.right, y).lineWidth(1.5).strokeColor(accent).stroke().restore();
    if (c.footerNote) {
      const b = doc.page.margins.bottom; doc.page.margins.bottom = 0;
      text(c.footerNote, PAGE.left, y + 4, { size: 8, color: "#666666", width, align: "center" });
      doc.page.margins.bottom = b;
    }
  };
  doc.on("pageAdded", footer);
  footer();

  // Letterhead
  let y = PAGE.top;
  if (c.logoPlacement === "center") y = drawLogo(PAGE.left, y, width, 60, "center");
  const leftW = width * 0.6, rightX = PAGE.left + leftW, rightW = width * 0.4;
  let ly = y, ry = y;
  if (c.logoPlacement === "left") ly = drawLogo(PAGE.left, ly, 150, 60);
  ly = text(values.IssuingName, PAGE.left, ly, { bold: true, size: 15, color: accent, width: leftW - 10 });
  for (const l of lines(values.IssuingAddress)) ly = text(l, PAGE.left, ly, { size: 9, width: leftW - 10 });
  if (values.IssuingRegNo) ly = text(`CR No.: ${values.IssuingRegNo}`, PAGE.left, ly, { size: 9, width: leftW - 10 });
  if (values.IssuingTaxNo) ly = text(`VAT No.: ${values.IssuingTaxNo}`, PAGE.left, ly, { size: 9, width: leftW - 10 });
  const invMeta = (x, yy, w) => {
    yy = text(c.title, x, yy, { bold: true, size: 16, color: accent, width: w, align: "right" });
    yy = text(`Invoice No.: ${values.InvoiceNo || "________________"}`, x, yy + 2, { size: 10, width: w, align: "right" });
    return text(`Date: ${values.InvoiceDate}`, x, yy, { size: 10, width: w, align: "right" });
  };
  if (c.logoPlacement === "right") ry = drawLogo(rightX, ry, rightW, 60, "right");
  if (c.invoiceNoPosition === "header-right") ry = invMeta(rightX, ry, rightW);
  y = Math.max(ly, ry) + 6;
  doc.moveTo(PAGE.left, y).lineTo(PAGE.w - PAGE.right, y).lineWidth(1.5).strokeColor(accent).stroke();
  y += 10;

  // Bill To
  let by = text("Bill To", PAGE.left, y, { bold: true, size: 9, color: accent, width: leftW });
  by = text(values.RecipientName, PAGE.left, by, { bold: true, size: 10, width: leftW - 10 });
  for (const l of lines(values.RecipientAddress)) by = text(l, PAGE.left, by, { size: 9, width: leftW - 10 });
  if (values.RecipientTaxNo) by = text(`VAT No.: ${values.RecipientTaxNo}`, PAGE.left, by, { size: 9, width: leftW - 10 });
  let my = y;
  if (c.invoiceNoPosition === "below-title") my = invMeta(rightX, y, rightW);
  y = Math.max(by, my) + 12;

  // Items table
  const cols = c.columns.map((k) => COLUMNS[k]);
  const total = cols.reduce((a, col) => a + col.width, 0);
  const widths = cols.map((col) => (col.width / total) * width);
  const pad = ROW_PAD[c.rowHeight] ?? 5;
  const rowHeight = (cells, bold) => Math.max(...cells.map((t, i) => {
    font(bold).fontSize(9.5);
    return doc.heightOfString(safe(t), { width: widths[i] - 8 });
  })) + pad * 2;
  const drawRow = (cells, o) => {
    const h = rowHeight(cells, o.bold);
    if (y + h > PAGE.h - PAGE.bottom - 30) { doc.addPage(); y = PAGE.top; if (!o.header) drawRow(cols.map((col) => col.label), { header: true, bold: true }); }
    let x = PAGE.left;
    if (o.fill) doc.rect(PAGE.left, y, width, h).fill(o.fill);
    cells.forEach((t, i) => {
      doc.rect(x, y, widths[i], h).lineWidth(0.5).strokeColor(o.header ? accent : grid).stroke();
      text(t, x + 4, y + pad, { size: 9.5, bold: o.bold, color: o.header ? "#FFFFFF" : INK, width: widths[i] - 8, align: cols[i].align === "right" ? "right" : cols[i].align === "center" ? "center" : "left" });
      x += widths[i];
    });
    y += h;
  };
  drawRow(cols.map((col) => col.label), { header: true, bold: true, fill: accent });
  (values.items || []).forEach((it, i) => drawRow(cols.map((col) => it[col.field]), { fill: c.rowShading && i % 2 === 1 ? zebra : null }));
  y += 10;

  // Totals
  const cur = values.Currency ? `${values.Currency} ` : "";
  const tx = PAGE.left + width * 0.5, tw = width * 0.5;
  const totalRow = (label, value, strong) => {
    if (y + 20 > PAGE.h - PAGE.bottom - 30) { doc.addPage(); y = PAGE.top; }
    if (strong) doc.rect(tx + tw * 0.6, y - 2, tw * 0.4, 16).fill(zebra);
    text(label, tx, y, { size: 10, bold: strong, color: strong ? accent : INK, width: tw * 0.6 - 6, align: "right" });
    text(`${cur}${value}`, tx + tw * 0.6, y, { size: 10, bold: strong, color: strong ? accent : INK, width: tw * 0.4 - 4, align: "right" });
    y += 16;
  };
  totalRow("Subtotal", values.Subtotal);
  totalRow(`${values.TaxLabel} ${values.TaxRate}%`, values.TaxAmount);
  totalRow("Grand Total", values.GrandTotal, true);

  // Supplier reference, declaration, signature
  const block = (h) => { if (y + h > PAGE.h - PAGE.bottom - 30) { doc.addPage(); y = PAGE.top; } };
  if (c.showVendorRef && (values.VendorName || values.OriginalBillNo)) {
    block(20); y += 8;
    const ref = [values.VendorName, values.OriginalBillNo && `bill no. ${values.OriginalBillNo}`, values.OriginalBillDate && `dated ${values.OriginalBillDate}`].filter(Boolean).join(", ");
    y = text(`Supplier reference: ${ref}`, PAGE.left, y, { size: 8.5, italic: true, color: MUTED, width });
  }
  if (c.declarationText) { block(40); y = text(c.declarationText, PAGE.left, y + 12, { size: 9, width }) + 6; }
  if (c.showSignature) {
    block(70); y += 36;
    doc.moveTo(PAGE.left, y).lineTo(PAGE.left + width * 0.45, y).lineWidth(0.5).strokeColor("#999999").stroke();
    y = text("Authorised Signatory", PAGE.left, y + 4, { bold: true, size: 10, width: width * 0.45 });
    text(`For ${values.IssuingName}`, PAGE.left, y, { size: 9, width: width * 0.45 });
  }

  doc.end();
  return done;
}

module.exports = { render };
