// A ready-made Word template with {{placeholders}}, for customers who want to
// start from something that already works (GET /api/templates/example.docx).
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, ShadingType } = require("docx");

const p = (text, o = {}) => new Paragraph({ alignment: o.align, spacing: { after: 60 }, children: [new TextRun({ text, bold: o.bold, size: o.size || 20, font: "Calibri" })] });
const c = (text, o = {}) => new TableCell({
  width: { size: o.w, type: WidthType.PERCENTAGE },
  shading: o.head ? { type: ShadingType.CLEAR, color: "auto", fill: "DDE3F0" } : undefined,
  children: [p(text, { bold: o.head, align: o.align })],
});

async function exampleDocx() {
  const widths = [8, 44, 10, 10, 14, 14];
  const head = ["Sl.", "Description", "Qty", "Unit", "Rate", "Amount"];
  const row = ["{{#items}}{{LineNo}}", "{{Description}}", "{{Quantity}}", "{{Unit}}", "{{MarkedUpRate}}", "{{Amount}}{{/items}}"];
  const doc = new Document({ sections: [{ children: [
    p("{{IssuingName}}", { bold: true, size: 32 }),
    p("{{IssuingAddress}}"),
    p("CR No.: {{IssuingRegNo}}    VAT No.: {{IssuingTaxNo}}"),
    p("TAX INVOICE", { bold: true, size: 28, align: AlignmentType.CENTER }),
    p("Invoice No.: {{InvoiceNo}}        Date: {{InvoiceDate}}"),
    p("To: {{RecipientName}}", { bold: true }),
    p("{{RecipientAddress}}"),
    p("VAT No.: {{RecipientTaxNo}}"),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
      new TableRow({ tableHeader: true, children: head.map((t, i) => c(t, { w: widths[i], head: true })) }),
      new TableRow({ children: row.map((t, i) => c(t, { w: widths[i] })) }),
    ] }),
    p(""),
    p("Subtotal: {{Currency}} {{Subtotal}}", { align: AlignmentType.RIGHT }),
    p("{{TaxLabel}} {{TaxRate}}%: {{Currency}} {{TaxAmount}}", { align: AlignmentType.RIGHT }),
    p("Grand Total: {{Currency}} {{GrandTotal}}", { bold: true, align: AlignmentType.RIGHT }),
    p(""),
    p("Authorised Signatory"),
    p("How to use: keep the double-brace tokens where values should appear. The table row that starts with the items block repeats once per line item. Delete this note.", { size: 16 }),
  ] }] });
  return Packer.toBuffer(doc);
}

module.exports = { exampleDocx };
