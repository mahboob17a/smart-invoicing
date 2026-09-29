// In-app template builder (Design Document v5.1 §6.5): a saved configuration
// that is rendered to a Word document with the customer's own branding.
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType,
  AlignmentType, BorderStyle, ImageRun, Footer, HeightRule, VerticalAlign, TableLayoutType,
} = require("docx");

const COLUMNS = {
  lineNo: { label: "Sl.", field: "LineNo", width: 6, align: AlignmentType.CENTER },
  description: { label: "Description", field: "Description", width: 44, align: AlignmentType.LEFT },
  qty: { label: "Qty", field: "Quantity", width: 9, align: AlignmentType.CENTER },
  unit: { label: "Unit", field: "Unit", width: 9, align: AlignmentType.CENTER },
  rate: { label: "Rate", field: "MarkedUpRate", width: 14, align: AlignmentType.RIGHT },
  amount: { label: "Amount", field: "Amount", width: 18, align: AlignmentType.RIGHT },
};
const COLUMN_ORDER = Object.keys(COLUMNS);
const ROW_HEIGHTS = { compact: 300, normal: 400, relaxed: 520 }; // twips

const DEFAULT_CONFIG = {
  title: "TAX INVOICE",
  accentColor: "#2E3A8C",
  columns: ["lineNo", "description", "qty", "unit", "rate", "amount"],
  rowShading: true,
  rowHeight: "normal",
  logoPlacement: "left",
  invoiceNoPosition: "header-right",
  declarationText: "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.",
  showSignature: true,
  showVendorRef: false,
  footerNote: "",
};

function validateConfig(input) {
  const c = { ...DEFAULT_CONFIG, ...(input || {}) };
  const errors = [];
  if (!/^#[0-9A-Fa-f]{6}$/.test(c.accentColor)) errors.push("Accent colour must be a hex colour like #2E3A8C");
  if (!Array.isArray(c.columns) || c.columns.some((k) => !COLUMNS[k])) errors.push(`Columns must be chosen from: ${COLUMN_ORDER.join(", ")}`);
  else {
    if (!c.columns.includes("description") || !c.columns.includes("amount")) errors.push("The item table needs at least Description and Amount");
    c.columns = COLUMN_ORDER.filter((k) => c.columns.includes(k));
  }
  if (!ROW_HEIGHTS[c.rowHeight]) errors.push("Row height must be compact, normal or relaxed");
  if (!["left", "right", "center", "none"].includes(c.logoPlacement)) errors.push("Logo placement must be left, right, center or none");
  if (!["header-right", "below-title"].includes(c.invoiceNoPosition)) errors.push("Invoice number position must be header-right or below-title");
  for (const k of ["title", "declarationText", "footerNote"]) {
    if (typeof c[k] !== "string") c[k] = "";
    c[k] = c[k].trim();
  }
  if (c.title.length > 40) errors.push("Title must be 40 characters or fewer");
  if (c.declarationText.length > 600) errors.push("Declaration must be 600 characters or fewer");
  if (c.footerNote.length > 200) errors.push("Footer note must be 200 characters or fewer");
  c.rowShading = !!c.rowShading;
  c.showSignature = !!c.showSignature;
  c.showVendorRef = !!c.showVendorRef;
  return { config: c, errors };
}

// ---------- helpers ----------
const hex = (c) => c.replace("#", "").toUpperCase();
function tint(c, amount) {
  const n = parseInt(hex(c), 16);
  const mix = (v) => Math.round(v + (255 - v) * amount);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix).map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}
const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };
const FONT = "Calibri";
const run = (text, o = {}) => new TextRun({ text: String(text ?? ""), font: FONT, size: o.size || 20, bold: o.bold, color: o.color, italics: o.italics });
const para = (children, o = {}) => new Paragraph({ children: Array.isArray(children) ? children : [children], alignment: o.align, spacing: { after: o.after ?? 40, before: o.before ?? 0 }, border: o.border });
const lines = (text) => String(text || "").split(/\r?\n/).filter(Boolean);

function logoRun(logo, maxW = 150, maxH = 70) {
  if (!logo?.buffer) return null;
  const type = logo.type === "jpg" ? "jpg" : logo.type === "webp" ? null : "png";
  if (!type) return null;
  const { w, h } = logo.size || { w: maxW, h: maxH };
  const scale = Math.min(maxW / w, maxH / h, 1);
  return new ImageRun({ type, data: logo.buffer, transformation: { width: Math.round(w * scale), height: Math.round(h * scale) } });
}

function cell(children, width, o = {}) {
  return new TableCell({
    children: Array.isArray(children) ? children : [children],
    width: { size: width, type: WidthType.PERCENTAGE },
    borders: o.borders || NO_BORDERS,
    shading: o.fill ? { type: ShadingType.CLEAR, color: "auto", fill: o.fill } : undefined,
    verticalAlign: o.vAlign || VerticalAlign.CENTER,
    margins: { top: 40, bottom: 40, left: 90, right: 90 },
    columnSpan: o.span,
  });
}

/**
 * Renders a builder template.
 * values: from computeValues(); logo: { buffer, type: 'png'|'jpg', size: {w,h} } or null
 */
async function render(config, values, logo) {
  const c = validateConfig(config).config;
  const accent = hex(c.accentColor);
  const zebra = tint(c.accentColor, 0.9);
  const border = { style: BorderStyle.SINGLE, size: 4, color: tint(c.accentColor, 0.6) };
  const gridBorders = { top: border, bottom: border, left: border, right: border };
  const invNo = values.InvoiceNo || "________________";

  // Letterhead block
  const identity = [
    para(run(values.IssuingName, { bold: true, size: 30, color: accent })),
    ...lines(values.IssuingAddress).map((l) => para(run(l, { size: 18 }))),
    ...(values.IssuingRegNo ? [para(run(`CR No.: ${values.IssuingRegNo}`, { size: 18 }))] : []),
    ...(values.IssuingTaxNo ? [para(run(`VAT No.: ${values.IssuingTaxNo}`, { size: 18 }))] : []),
  ];
  const invMeta = (align) => [
    para(run(c.title, { bold: true, size: 32, color: accent }), { align }),
    para([run("Invoice No.: ", { bold: true }), run(invNo)], { align }),
    para([run("Date: ", { bold: true }), run(values.InvoiceDate)], { align }),
  ];
  const lr = logoRun(logo);
  const header = [];
  if (c.logoPlacement === "center" && lr) header.push(para(lr, { align: AlignmentType.CENTER, after: 120 }));
  const leftCol = [...(c.logoPlacement === "left" && lr ? [para(lr, { after: 80 })] : []), ...identity];
  const rightCol = [
    ...(c.logoPlacement === "right" && lr ? [para(lr, { align: AlignmentType.RIGHT, after: 80 })] : []),
    ...(c.invoiceNoPosition === "header-right" ? invMeta(AlignmentType.RIGHT) : []),
  ];
  header.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, layout: TableLayoutType.FIXED,
    rows: [new TableRow({ children: [cell(leftCol, 60, { vAlign: VerticalAlign.TOP }), cell(rightCol.length ? rightCol : [para(run(""))], 40, { vAlign: VerticalAlign.TOP })] })],
  }));
  header.push(para(run(""), { border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: accent, space: 1 } }, after: 160 }));

  // Bill-to (+ invoice number below the title when chosen)
  const billTo = [
    para(run("Bill To", { bold: true, color: accent, size: 18 })),
    para(run(values.RecipientName, { bold: true })),
    ...lines(values.RecipientAddress).map((l) => para(run(l, { size: 18 }))),
    ...(values.RecipientTaxNo ? [para(run(`VAT No.: ${values.RecipientTaxNo}`, { size: 18 }))] : []),
  ];
  const middle = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, layout: TableLayoutType.FIXED,
    rows: [new TableRow({ children: [
      cell(billTo, 60, { vAlign: VerticalAlign.TOP }),
      cell(c.invoiceNoPosition === "below-title" ? invMeta(AlignmentType.RIGHT) : [para(run(""))], 40, { vAlign: VerticalAlign.TOP }),
    ] })],
  });

  // Items table
  const cols = c.columns.map((k) => COLUMNS[k]);
  const totalW = cols.reduce((a, col) => a + col.width, 0);
  const w = (col) => Math.round((col.width / totalW) * 100);
  const height = { value: ROW_HEIGHTS[c.rowHeight], rule: HeightRule.ATLEAST };
  const headRow = new TableRow({
    tableHeader: true, height,
    children: cols.map((col) => cell(para(run(col.label, { bold: true, color: "FFFFFF", size: 19 }), { align: col.align, after: 0 }), w(col), { fill: accent, borders: gridBorders })),
  });
  const bodyRows = (values.items || []).map((it, i) => new TableRow({
    height,
    children: cols.map((col) => cell(para(run(it[col.field], { size: 19 }), { align: col.align, after: 0 }), w(col), { fill: c.rowShading && i % 2 === 1 ? zebra : undefined, borders: gridBorders })),
  }));
  const items = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headRow, ...bodyRows] });

  // Totals
  const cur = values.Currency ? `${values.Currency} ` : "";
  const totalRow = (label, value, strong) => new TableRow({ children: [
    cell(para(run(label, { bold: strong, color: strong ? accent : undefined }), { align: AlignmentType.RIGHT, after: 0 }), 60),
    cell(para(run(`${cur}${value}`, { bold: strong, color: strong ? accent : undefined }), { align: AlignmentType.RIGHT, after: 0 }), 40,
      { fill: strong ? zebra : undefined }),
  ] });
  const totals = new Table({
    width: { size: 50, type: WidthType.PERCENTAGE }, alignment: AlignmentType.RIGHT, borders: NO_BORDERS,
    rows: [
      totalRow("Subtotal", values.Subtotal),
      totalRow(`${values.TaxLabel} ${values.TaxRate}%`, values.TaxAmount),
      totalRow("Grand Total", values.GrandTotal, true),
    ],
  });

  const tail = [];
  if (c.showVendorRef && (values.VendorName || values.OriginalBillNo)) {
    tail.push(para(run(`Supplier reference: ${[values.VendorName, values.OriginalBillNo && `bill no. ${values.OriginalBillNo}`, values.OriginalBillDate && `dated ${values.OriginalBillDate}`].filter(Boolean).join(", ")}`, { size: 17, italics: true, color: "555555" }), { before: 160 }));
  }
  if (c.declarationText) tail.push(para(run(c.declarationText, { size: 18 }), { before: 240, after: 120 }));
  if (c.showSignature) {
    tail.push(para(run(""), { before: 600 }));
    tail.push(new Paragraph({
      children: [run("Authorised Signatory", { bold: true })],
      indent: { right: 6000 },
      border: { top: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 4 } },
      spacing: { after: 40 },
    }));
    tail.push(para(run(`For ${values.IssuingName}`, { size: 18 })));
  }

  const footer = new Footer({ children: [
    para(c.footerNote ? run(c.footerNote, { size: 16, color: "666666" }) : run(""), {
      align: AlignmentType.CENTER, border: { top: { style: BorderStyle.SINGLE, size: 12, color: accent, space: 4 } },
    }),
  ] });

  const doc = new Document({
    creator: values.IssuingName || "Smart Invoicing",
    title: `${c.title} ${values.InvoiceNo || ""}`.trim(),
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } },
      footers: { default: footer },
      children: [...header, middle, para(run(""), { after: 120 }), items, para(run(""), { after: 120 }), totals, ...tail],
    }],
  });
  return Packer.toBuffer(doc);
}

/** Reads the organization logo (/uploads/<org>/logo-x.png) for embedding. */
async function loadLogo(logoUrl) {
  if (!logoUrl) return null;
  const m = logoUrl.match(/^\/uploads\/([0-9a-f-]{36}\/logo-[0-9a-f-]{36}\.(png|jpg|webp))$/);
  if (!m) return null;
  const buffer = await require("../storage").read(m[1]).catch(() => null);
  if (!buffer) return null;
  return { buffer, type: m[2], size: imageSize(buffer, m[2]) };
}

// Minimal PNG/JPEG size reader (keeps the logo's aspect ratio in the document).
function imageSize(buf, type) {
  try {
    if (type === "png") return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    if (type === "jpg") {
      let i = 2;
      while (i < buf.length) {
        if (buf[i] !== 0xff) return null;
        const marker = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xc3) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
        i += 2 + len;
      }
    }
  } catch { /* fall through */ }
  return null;
}

module.exports = { DEFAULT_CONFIG, COLUMNS, COLUMN_ORDER, validateConfig, render, loadLogo };
