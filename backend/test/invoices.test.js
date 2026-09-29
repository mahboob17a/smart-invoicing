// Phase 4 — conversion engine, invoice numbering at generation time, Word/PDF
// output, filenames (Design Document v5.1 §7.3, §8.4, §8.8; Roadmap Weeks 9–10).
process.env.EXTRACTION_PROVIDER = "mock";
process.env.PDF_ENGINE = "builtin"; // fast; the LibreOffice path has its own test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const PizZip = require("pizzip");
const d = require("docx");
const { start, stop, call, newOrg, onboard } = require("./helpers");
const render = require("../src/lib/templates/render");
const pdf = require("../src/lib/documents/pdf");

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const JPEG = Buffer.from("ffd8ffe000104a46494600010100000100010000ffd9", "hex");
const YEAR = new Date().getFullYear();
const textOf = (buf) => new PizZip(buf).file("word/document.xml").asText().replace(/<[^>]+>/g, "")
  .replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");
const LINES = [
  { description: 'PVC pipe 1" (3 m)', qty: 6, unit: "pcs", rate: 4.5 },
  { description: 'Ball valve 1" brass', qty: 4, unit: "pcs", rate: 6.25 },
  { description: "PTFE thread tape", qty: 10, unit: "roll", rate: 0.35 },
  { description: "Pipe clamp set", qty: 2, unit: "set", rate: 15.375 },
];

let A, B, ids, builderId, billNo = 4470;

async function reviewedBill(token, over = {}) {
  const f = new FormData();
  f.append("files", new Blob([JPEG], { type: "image/jpeg" }), "bill.jpg");
  const up = await call("POST", "/api/bills", { token, raw: f });
  for (let i = 0; i < 100; i++) {
    const r = await call("GET", `/api/bills/${up.body.id}`, { token });
    if (r.body.status !== "processing") break;
    await new Promise((res) => setTimeout(res, 10));
  }
  billNo += 1;
  const r = await call("PUT", `/api/bills/${up.body.id}`, {
    token,
    body: { vendorName: "Gulf Hardware Trading LLC", originalBillNo: String(billNo), originalDate: "14-09-2026", items: LINES, ...over },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
}
const convert = (token, billId, body = {}) => call("POST", `/api/bills/${billId}/convert`, { token, body });
const nextPreview = async () => (await call("GET", `/api/invoice-numbering/${ids.seriesId}/preview`, { token: A })).body.preview;

test.before(async () => {
  await start();
  A = await newOrg("InvA");
  B = await newOrg("InvB");
  ids = await onboard(A);
  await onboard(B);
});
test.after(stop);

test("converting needs a ready template", async () => {
  const bill = await reviewedBill(A);
  const r = await call("POST", `/api/bills/${bill.id}/convert/preview`, { token: A, body: {} });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /invoice template/);
  assert.equal((await convert(A, bill.id)).status, 400);
  const t = await call("POST", "/api/templates", { token: A, body: { name: "Standard", config: { showVendorRef: true } } });
  builderId = t.body.id;
});

test("preview: §8.4 totals, next number, filename — and takes no number", async () => {
  const bill = await reviewedBill(A);
  const before = await nextPreview();
  const r = await call("POST", `/api/bills/${bill.id}/convert/preview`, { token: A, body: {} });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.subtotal, "99.194");
  assert.equal(r.body.taxAmount, "4.960");
  assert.equal(r.body.grandTotal, "104.154");
  assert.equal(r.body.items[3].MarkedUpRate, "17.681");
  assert.equal(r.body.invoiceNo, `INV-${YEAR}-0001`);
  assert.equal(r.body.templateId, builderId);
  assert.equal(r.body.filename, `FalajFacilitiesLLC_Invoice_UCN_GulfHardwareTradingLLC_${bill.originalBillNo}_2026-09-14`);
  assert.equal(await nextPreview(), before, "preview did not consume a number");
});

let firstInvoice, firstBill;
test("convert: number assigned, Word + PDF made, named from the pattern", async () => {
  firstBill = await reviewedBill(A);
  const r = await convert(A, firstBill.id);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  firstInvoice = r.body;
  assert.equal(r.body.status, "ready");
  assert.equal(r.body.invoiceNo, `INV-${YEAR}-0001`);
  assert.equal(r.body.grandTotal, "104.154");
  assert.ok(r.body.hasDocx && r.body.hasPdf);
  assert.equal(await nextPreview(), `INV-${YEAR}-0002`);

  const docx = await call("GET", `/api/invoices/${r.body.id}/file?format=docx`, { token: A });
  assert.equal(docx.status, 200);
  assert.match(docx.res.headers.get("content-disposition"), new RegExp(`_Invoice_UCN_GulfHardwareTradingLLC_${firstBill.originalBillNo}_2026-09-14\\.docx`));
  const text = textOf(docx.buf);
  assert.match(text, new RegExp(`Invoice No\\.: INV-${YEAR}-0001`));
  assert.match(text, new RegExp(`Supplier reference: Gulf Hardware Trading LLC, bill no\\. ${firstBill.originalBillNo}`));
  assert.doesNotMatch(text, new RegExp(`Invoice No\\.: ${firstBill.originalBillNo}`), "vendor's number is never the invoice number");
  assert.match(text, /104\.154/);

  const p = await call("GET", `/api/invoices/${r.body.id}/file`, { token: A });
  assert.equal(p.status, 200);
  assert.equal(p.res.headers.get("content-type"), "application/pdf");
  assert.equal(p.buf.subarray(0, 5).toString(), "%PDF-");
  assert.match(decodeURIComponent(p.res.headers.get("x-filename")), /\.pdf$/);
});

test("a bill converts once; converting again points to Regenerate", async () => {
  const r = await convert(A, firstBill.id);
  assert.equal(r.status, 409);
  assert.match(r.body.error, /Regenerate/);
  assert.equal(r.body.details.invoiceId, firstInvoice.id);
});

test("regenerate keeps the number and date, uses the corrected bill", async () => {
  await call("PUT", `/api/bills/${firstBill.id}`, {
    token: A, body: { vendorName: "Gulf Hardware Trading LLC", originalBillNo: firstBill.originalBillNo, originalDate: "14-09-2026", items: LINES.slice(0, 1) },
  });
  const stale = await call("GET", `/api/invoices/${firstInvoice.id}`, { token: A });
  assert.equal(stale.body.billChangedSince, true);
  const before = await nextPreview();
  const r = await call("POST", `/api/invoices/${firstInvoice.id}/regenerate`, { token: A, body: {} });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.invoiceNo, firstInvoice.invoiceNo);
  assert.equal(r.body.invoiceDate, firstInvoice.invoiceDate);
  assert.equal(r.body.subtotal, "31.050"); // 4.5 × 1.15 = 5.175 × 6
  assert.equal(r.body.generationCount, 2);
  assert.equal(r.body.billChangedSince, false);
  assert.equal(await nextPreview(), before, "regenerate takes no new number");
});

test("a broken template fails before any number is used", async () => {
  const bill = await reviewedBill(A);
  const before = await nextPreview();
  const real = render.renderDocx;
  render.renderDocx = async () => { throw Object.assign(new Error("Unclosed tag {{Total"), { name: "TemplateError" }); };
  try {
    const r = await convert(A, bill.id);
    assert.equal(r.status, 400);
    assert.match(r.body.error, /Unclosed tag/);
  } finally { render.renderDocx = real; }
  assert.equal(await nextPreview(), before);
  assert.equal((await call("GET", `/api/bills/${bill.id}`, { token: A })).body.invoice, null);
});

test("a failure after numbering keeps the number on the invoice — no gap, no duplicate", async () => {
  const bill = await reviewedBill(A);
  const expected = await nextPreview();
  const real = render.renderDocx;
  let calls = 0;
  render.renderDocx = async (...a) => { calls += 1; if (calls === 2) throw new Error("disk full"); return real(...a); };
  let r;
  try { r = await convert(A, bill.id); } finally { render.renderDocx = real; }
  assert.equal(r.status, 201);
  assert.equal(r.body.status, "failed");
  assert.equal(r.body.invoiceNo, expected);
  assert.equal((await call("GET", `/api/invoices/${r.body.id}/file`, { token: A })).status, 409);
  const again = await call("POST", `/api/invoices/${r.body.id}/regenerate`, { token: A, body: {} });
  assert.equal(again.body.status, "ready");
  assert.equal(again.body.invoiceNo, expected);
  const next = await convert(A, (await reviewedBill(A)).id);
  const n = (s) => Number(s.split("-").pop());
  assert.equal(n(next.body.invoiceNo), n(expected) + 1);
});

test("several devices converting at once: distinct, consecutive numbers", async () => {
  const bills = [];
  for (let i = 0; i < 12; i++) bills.push(await reviewedBill(A));
  const first = Number((await nextPreview()).split("-").pop());
  const results = await Promise.all(bills.map((b) => convert(A, b.id)));
  assert.ok(results.every((r) => r.status === 201 && r.body.status === "ready"));
  const nums = results.map((r) => Number(r.body.invoiceNo.split("-").pop())).sort((a, b) => a - b);
  assert.deepEqual(nums, Array.from({ length: 12 }, (_, i) => first + i));
  // Two taps on the same bill at the same moment: one invoice, one number.
  const bill = await reviewedBill(A);
  const both = await Promise.all([convert(A, bill.id), convert(A, bill.id)]);
  assert.deepEqual(both.map((r) => r.status).sort(), [201, 409]);
  assert.equal(Number((await nextPreview()).split("-").pop()), first + 13);
});

test("several server processes on one database never share a number", async (t) => {
  if (!process.env.TEST_DATABASE_URL) return t.skip("needs a PostgreSQL server: set TEST_DATABASE_URL");
  const env = { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL };
  const worker = path.join(__dirname, "fixtures", "allocate-worker.js");
  const run = (args) => new Promise((resolve, reject) =>
    execFile(process.execPath, [worker, ...args], { env }, (e, out, err) => (e ? reject(new Error(err || e.message)) : resolve(JSON.parse(out)))));
  const { org, series } = await run(["setup"]);
  const batches = await Promise.all([1, 2, 3, 4].map(() => run([org, series, "40"])));
  const all = batches.flat();
  assert.equal(all.length, 160);
  assert.equal(new Set(all).size, 160, "no duplicates");
  const nums = all.map((s) => Number(s.split("-").pop())).sort((a, b) => a - b);
  assert.deepEqual(nums, Array.from({ length: 160 }, (_, i) => i + 1), "no gaps");
});

test("Blank mode: no number assigned, field left empty, filename still unique", async () => {
  await call("PUT", `/api/invoice-numbering/${ids.seriesId}`, { token: A, body: { mode: "blank" } });
  await call("PUT", "/api/filename-patterns", { token: A, body: { pattern: "{RecipientCode}_{InvoiceNo}" } });
  try {
    const bill = await reviewedBill(A);
    const r = await convert(A, bill.id);
    assert.equal(r.status, 201);
    assert.equal(r.body.invoiceNo, null);
    assert.match(r.body.filename, new RegExp(`^UCN_${bill.id.slice(0, 8)}$`));
    const text = textOf((await call("GET", `/api/invoices/${r.body.id}/file?format=docx`, { token: A })).buf);
    assert.match(text, /Invoice No\.: ________________/);
  } finally {
    await call("PUT", `/api/invoice-numbering/${ids.seriesId}`, { token: A, body: { mode: "auto" } });
    await call("PUT", "/api/filename-patterns", { token: A, body: { pattern: "{IssuingName}_{InvoiceNo}_{OriginalBillNo}" } });
  }
  const r = await convert(A, (await reviewedBill(A)).id);
  assert.match(r.body.filename, new RegExp(`^FalajFacilitiesLLC_INV-${YEAR}-\\d{4}_\\d+$`));
});

async function uploadedTemplate(token) {
  const cell = (t) => new d.TableCell({ children: [new d.Paragraph(t)] });
  const doc = new d.Document({ sections: [{ children: [
    new d.Paragraph("{{IssuingName}} — Invoice {{InvoiceNo}} dated {{InvoiceDate}}"),
    new d.Paragraph("To {{RecipientName}}. Vendor ref {{OriginalBillNo}}"),
    new d.Table({ rows: [
      new d.TableRow({ children: ["No", "Item", "Qty", "Rate", "Amount"].map(cell) }),
      new d.TableRow({ children: ["{{#items}}{{LineNo}}", "{{Description}}", "{{Quantity}}", "{{MarkedUpRate}}", "{{Amount}}{{/items}}"].map(cell) }),
    ] }),
    new d.Paragraph("Total {{Currency}} {{GrandTotal}}"),
  ] }] });
  const f = new FormData();
  f.append("file", new Blob([await d.Packer.toBuffer(doc)], { type: DOCX }), "Client.docx");
  const up = await call("POST", "/api/templates/upload", { token, raw: f });
  const mappings = up.body.mappings.map(({ token: t, isItem, field }) => ({ token: t, isItem, field }));
  const m = await call("PUT", `/api/templates/${up.body.id}/mapping`, { token, body: { mappings } });
  assert.equal(m.body.status, "ready");
  return up.body.id;
}

let uploadedId;
test("uploaded template: merged Word file; PDF needs LibreOffice", async () => {
  uploadedId = await uploadedTemplate(A);
  const bill = await reviewedBill(A);
  const r = await convert(A, bill.id, { templateId: uploadedId });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.templateName, "Client");
  const text = textOf((await call("GET", `/api/invoices/${r.body.id}/file?format=docx`, { token: A })).buf);
  assert.match(text, new RegExp(`Invoice ${r.body.invoiceNo} dated`));
  assert.match(text, new RegExp(`Vendor ref ${bill.originalBillNo}`));
  assert.match(text, /4Pipe clamp set217\.68135\.362/);
  assert.match(text, /Total OMR 104\.154/);
  assert.equal(r.body.hasPdf, false);
  assert.match(r.body.pdfError, /LibreOffice/);
  const p = await call("GET", `/api/invoices/${r.body.id}/file?format=pdf`, { token: A });
  assert.equal(p.status, 409);
  assert.match(p.body.error, /LibreOffice/);
});

test("LibreOffice makes exact PDFs of uploaded templates (when installed)", async (t) => {
  process.env.PDF_ENGINE = "auto";
  pdf._reset();
  try {
    if (pdf.capabilities().engine !== "libreoffice") return t.skip("LibreOffice not installed here");
    // An invoice made earlier without a PDF gets one on download.
    const list = await call("GET", "/api/invoices", { token: A });
    const noPdf = list.body.find((i) => !i.hasPdf && i.status === "ready");
    const p = await call("GET", `/api/invoices/${noPdf.id}/file?format=pdf`, { token: A });
    assert.equal(p.status, 200, JSON.stringify(p.body));
    assert.equal(p.buf.subarray(0, 5).toString(), "%PDF-");
    const r = await convert(A, (await reviewedBill(A)).id, { templateId: uploadedId });
    assert.equal(r.body.hasPdf, true);
  } finally {
    process.env.PDF_ENGINE = "builtin";
    pdf._reset();
  }
});

test("converted bills: list filter, summary, search by invoice number, can't be deleted", async () => {
  const conv = await call("GET", "/api/bills?status=converted", { token: A });
  assert.ok(conv.body.length >= 15 && conv.body.every((b) => b.invoice));
  const drafts = await call("GET", "/api/bills?status=draft", { token: A });
  assert.ok(drafts.body.every((b) => !b.invoice));
  const s = await call("GET", "/api/bills/summary", { token: A });
  assert.equal(s.body.converted, conv.body.length);
  const found = await call("GET", `/api/bills?q=${encodeURIComponent(firstInvoice.invoiceNo)}`, { token: A });
  assert.deepEqual(found.body.map((b) => b.id), [firstBill.id]);
  const inv = await call("GET", `/api/invoices?q=${encodeURIComponent(firstInvoice.invoiceNo)}`, { token: A });
  assert.equal(inv.body.length, 1);
  const del = await call("DELETE", `/api/bills/${firstBill.id}`, { token: A });
  assert.equal(del.status, 409);
  assert.match(del.body.error, /accounting records/);
  assert.equal((await call("POST", `/api/bills/${firstBill.id}/extract`, { token: A })).status, 409);
});

test("bills with missing data or unreviewed bills can't be converted", async () => {
  const f = new FormData();
  f.append("files", new Blob([JPEG], { type: "image/jpeg" }), "bill.jpg");
  const up = await call("POST", "/api/bills", { token: A, raw: f });
  await new Promise((res) => setTimeout(res, 100));
  const r = await convert(A, up.body.id);
  assert.equal(r.status, 409);
  assert.match(r.body.error, /Review and save/);
});

test("isolation: another organization can't see, download, regenerate or convert", async () => {
  for (const [m, u] of [
    ["GET", `/api/invoices/${firstInvoice.id}`],
    ["GET", `/api/invoices/${firstInvoice.id}/file?format=docx`],
    ["POST", `/api/invoices/${firstInvoice.id}/regenerate`],
    ["POST", `/api/bills/${firstBill.id}/convert`],
    ["POST", `/api/bills/${firstBill.id}/convert/preview`],
  ]) assert.equal((await call(m, u, { token: B, body: m === "POST" ? {} : undefined })).status, 404, `${m} ${u}`);
  assert.deepEqual((await call("GET", "/api/invoices", { token: B })).body, []);
  // B's own choices can't point at A's template.
  const bill = await reviewedBill(B);
  const r = await convert(B, bill.id, { templateId: builderId });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /does not exist in your account/);
});
