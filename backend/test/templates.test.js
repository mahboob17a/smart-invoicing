// Phase 3 — template builder, Word template upload, field mapping, merge engine.
const test = require("node:test");
const assert = require("node:assert/strict");
const PizZip = require("pizzip");
const d = require("docx");
const { start, stop, call, newOrg, onboard } = require("./helpers");
const fields = require("../src/lib/templates/fields");
const { computeValues, SAMPLE_LINES } = require("../src/lib/templates/values");

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const textOf = (buf) => new PizZip(buf).file("word/document.xml").asText().replace(/<[^>]+>/g, "")
  .replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&apos;/g, "'").replace(/\s+/g, " ");

async function makeDocx(paragraphs, rowCells) {
  const cell = (t) => new d.TableCell({ children: [new d.Paragraph(t)] });
  const children = paragraphs.map((t) => new d.Paragraph(t));
  if (rowCells) children.push(new d.Table({ rows: [new d.TableRow({ children: rowCells.map(() => cell("head")) }), new d.TableRow({ children: rowCells.map(cell) })] }));
  return d.Packer.toBuffer(new d.Document({ sections: [{ children }] }));
}
const uploadDocx = (token, url, buf, name = "Client_Invoice.docx", type = DOCX) => {
  const f = new FormData();
  f.append("file", new Blob([buf], { type }), name);
  return call("POST", url, { token, raw: f });
};
const download = (token, url) => call("GET", url, { token });

let T, B;
test.before(async () => {
  await start();
  T = await newOrg("Tpl");
  B = await newOrg("TplB");
  await onboard(T);
});
test.after(stop);

test("field suggestions and invoice-number warning", () => {
  assert.equal(fields.suggest("Inv_No", false), "InvoiceNo");
  assert.equal(fields.suggest("invoice number", false), "InvoiceNo");
  assert.equal(fields.suggest("VendorBillNo", false), "OriginalBillNo");
  assert.equal(fields.suggest("Customer", false), "RecipientName");
  assert.equal(fields.suggest("VAT", false), "TaxAmount");
  assert.equal(fields.suggest("Sl", true), "LineNo");
  assert.equal(fields.suggest("Rate", true), "MarkedUpRate");
  assert.equal(fields.suggest("Total", true), "Amount");
  assert.equal(fields.suggest("Ref", false), null);
  const w = fields.mappingWarnings([{ token: "Inv_No", isItem: false, field: "OriginalBillNo" }]);
  assert.match(w[0], /looks like your invoice-number field/);
});

test("values follow §8.4: marked-up rate, amount = rate × qty, tax on subtotal", () => {
  const v = computeValues({
    identity: { name: "Falaj" }, recipient: { name: "UCN" }, invoiceNo: "INV-2026-0001", invoiceDate: "2026-09-29",
    rule: { markup_pct: 15, tax_pct: 5, tax_label: "VAT", currency_code: "OMR", decimal_places: 3 }, lines: SAMPLE_LINES,
  });
  assert.deepEqual(v.items.map((i) => i.MarkedUpRate), ["5.175", "7.188", "0.403", "17.681"]);
  assert.deepEqual(v.items.map((i) => i.Amount), ["31.050", "28.752", "4.030", "35.362"]);
  assert.equal(v.Subtotal, "99.194");
  assert.equal(v.TaxAmount, "4.960");
  assert.equal(v.GrandTotal, "104.154");
  assert.equal(v.InvoiceDate, "29-09-2026");
});

let builderId;
test("builder template: validation, create, default, sample document", async () => {
  const bad = await call("POST", "/api/templates", { token: T, body: { name: "x", config: { accentColor: "blue", columns: ["qty"] } } });
  assert.equal(bad.status, 400);
  const r = await call("POST", "/api/templates", { token: T, body: { name: "Standard", config: { accentColor: "#C8413B", columns: ["amount", "description", "qty"], showVendorRef: true } } });
  assert.equal(r.status, 201);
  assert.equal(r.body.isDefault, true, "first ready template becomes the default");
  assert.deepEqual(r.body.config.columns, ["description", "qty", "amount"], "columns kept in table order");
  builderId = r.body.id;

  const { status, buf, res } = await download(T, `/api/templates/${builderId}/sample.docx`);
  assert.equal(status, 200);
  assert.equal(res.headers.get("content-type"), DOCX);
  const text = textOf(buf);
  assert.match(text, /Falaj Facilities LLC/);
  assert.match(text, /TAX INVOICE/);
  assert.match(text, new RegExp(`INV-${new Date().getFullYear()}-0001`), "sample shows the next invoice number");
  assert.match(text, /Grand Total/);
  assert.match(text, /University Campus North/);
  assert.match(text, /Supplier reference: Gulf Hardware Trading LLC, bill no\. 4471/);
  assert.doesNotMatch(text, /Unit/, "unit column was not chosen");

  const upd = await call("PUT", `/api/templates/${builderId}`, { token: T, body: { config: { ...r.body.config, showVendorRef: false, title: "INVOICE" } } });
  assert.equal(upd.body.config.title, "INVOICE");
  const again = textOf((await download(T, `/api/templates/${builderId}/sample.docx`)).buf);
  assert.doesNotMatch(again, /Supplier reference/, "vendor reference is off by default (§6.5)");
});

test("builder embeds the company logo", async () => {
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4b40000000049454e44ae426082", "hex");
  const form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), "logo.png");
  const up = await call("POST", "/api/uploads/logo", { token: T, raw: form });
  await call("POST", "/api/company-profile", { token: T, body: { legalName: "Falaj Facilities LLC", logoAssetUrl: up.body.url } });
  const { buf } = await download(T, `/api/templates/${builderId}/sample.docx`);
  assert.ok(Object.keys(new PizZip(buf).files).some((f) => f.startsWith("word/media/")), "logo image is inside the document");
});

let upId;
test("upload a Word template: tokens and item row detected, suggestions offered", async () => {
  const buf = await makeDocx(
    ["Invoice {{Inv_No}} dated {{InvDate}}", "To {{Customer}}", "Our ref {{Ref}}", "Total {{GrandTotal}}"],
    ["{{#items}}{{Sl}}", "{{Desc}}", "{{Qty}}", "{{Rate}}", "{{Amt}}{{/items}}"]
  );
  const r = await uploadDocx(T, "/api/templates/upload", buf);
  assert.equal(r.status, 201);
  upId = r.body.id;
  assert.equal(r.body.status, "needs_mapping");
  assert.equal(r.body.name, "Client_Invoice");
  assert.equal(r.body.loopName, "items");
  assert.equal(r.body.found.tokens, 10);
  const m = Object.fromEntries(r.body.mappings.map((x) => [`${x.isItem ? "i" : "h"}:${x.token}`, x.field]));
  assert.equal(m["h:Inv_No"], "InvoiceNo");
  assert.equal(m["h:Customer"], "RecipientName");
  assert.equal(m["h:Ref"], null, "unknown tokens are not guessed");
  assert.equal(m["i:Desc"], "Description");
  assert.equal(m["i:Amt"], "Amount");
});

test("mapping: validation, invoice-number warning, save", async () => {
  const t = (await call("GET", `/api/templates/${upId}`, { token: T })).body;
  const mappings = t.mappings.map(({ token, isItem, field }) => ({ token, isItem, field }));

  assert.equal((await call("PUT", `/api/templates/${upId}/mapping`, { token: T, body: { mappings: mappings.slice(1) } })).status, 400, "every token needs a choice");
  const wrongKind = mappings.map((x) => (x.token === "Desc" ? { ...x, field: "GrandTotal" } : x));
  assert.match((await call("PUT", `/api/templates/${upId}/mapping`, { token: T, body: { mappings: wrongKind } })).body.error, /inside the item row/);

  const risky = mappings.map((x) => (x.token === "Inv_No" ? { ...x, field: "OriginalBillNo" } : x));
  const w = await call("PUT", `/api/templates/${upId}/mapping`, { token: T, body: { mappings: risky } });
  assert.equal(w.status, 200);
  assert.match(w.body.warnings.join(" "), /Inv_No.*vendor's original bill number/);

  const ok = await call("PUT", `/api/templates/${upId}/mapping`, { token: T, body: { mappings } });
  assert.equal(ok.body.status, "ready");
  assert.deepEqual(ok.body.warnings, []);
});

test("merge engine fills mapped tokens, repeats the item row, leaves unmapped text untouched", async () => {
  const { status, buf } = await download(T, `/api/templates/${upId}/sample.docx`);
  assert.equal(status, 200);
  const text = textOf(buf);
  assert.match(text, new RegExp(`Invoice INV-${new Date().getFullYear()}-0001 dated \\d\\d-\\d\\d-\\d{4}`));
  assert.match(text, /To University Campus North/);
  assert.match(text, /Our ref \{\{Ref\}\}/, "unmapped token stays exactly as written");
  assert.match(text, /1PVC pipe 1" \(3 m\)65\.17531\.050/);
  assert.match(text, /4Pipe clamp set217\.68135\.362/);
  assert.match(text, /Total 104\.154/);
});

test("upload errors are explained", async () => {
  assert.match((await uploadDocx(T, "/api/templates/upload", Buffer.from("hello"), "a.txt", "text/plain")).body.error, /Word files \(\.docx\)/);
  assert.match((await uploadDocx(T, "/api/templates/upload", Buffer.from("not a zip"), "a.docx")).body.error, /isn't a Word/);
  assert.match((await uploadDocx(T, "/api/templates/upload", await makeDocx(["No tokens here"]))).body.error, /No \{\{placeholders\}\}/);
  assert.match((await uploadDocx(T, "/api/templates/upload", await makeDocx(["Broken {{Inv_No"]))).body.error, /missing its closing|Inv_No/);
  assert.match((await uploadDocx(T, "/api/templates/upload", await makeDocx(["{{#items}}{{Desc}}"]))).body.error, /no matching \{\{\/items\}\}/);
});

test("re-upload: new version, mappings carried forward by token name (§7.4)", async () => {
  const v2 = await makeDocx(
    ["Invoice {{Inv_No}} dated {{InvDate}}", "To {{Customer}}", "Our ref {{Ref}}", "Total {{GrandTotal}}", "VAT {{VAT}}"],
    ["{{#items}}{{Sl}}", "{{Desc}}", "{{Qty}}", "{{Rate}}", "{{Amt}}{{/items}}"]
  );
  const r = await uploadDocx(T, `/api/templates/${upId}/upload`, v2, "Client_Invoice_v2.docx");
  assert.equal(r.status, 201);
  assert.equal(r.body.version, 2);
  assert.equal(r.body.carriedOver, 10);
  assert.equal(r.body.newTokens, 1);
  assert.equal(r.body.status, "needs_mapping");
  assert.equal(r.body.versions.length, 2);
  const vat = r.body.mappings.find((x) => x.token === "VAT");
  assert.equal(vat.suggested, true);
  assert.equal(vat.field, "TaxAmount");
  assert.equal(r.body.mappings.find((x) => x.token === "Inv_No").saved, true);
  assert.equal((await call("POST", `/api/templates/${upId}/default`, { token: T })).status, 400, "can't be default until mapped");
});

test("sample values for the live preview", async () => {
  const r = await call("GET", "/api/templates/sample-values", { token: T });
  assert.equal(r.body.values.IssuingName, "Falaj Facilities LLC");
  assert.equal(r.body.values.items.length, 4);
  assert.match(r.body.logoUrl, /^\/uploads\//);
});

test("default template, list, example file", async () => {
  const t = (await call("GET", `/api/templates/${upId}`, { token: T })).body;
  await call("PUT", `/api/templates/${upId}/mapping`, { token: T, body: { mappings: t.mappings.map(({ token, isItem, field }) => ({ token, isItem, field })) } });
  const def = await call("POST", `/api/templates/${upId}/default`, { token: T });
  assert.equal(def.body.isDefault, true);
  const list = (await call("GET", "/api/templates", { token: T })).body;
  assert.equal(list.length, 2);
  assert.equal(list.filter((x) => x.isDefault).length, 1);
  assert.equal(list[0].id, upId, "default is listed first");

  const ex = await download(T, "/api/templates/example.docx");
  assert.equal(ex.status, 200);
  const r = await uploadDocx(T, "/api/templates/upload", ex.buf, "example.docx");
  assert.equal(r.status, 201);
  assert.ok(r.body.mappings.every((m) => m.field), "every token in the example is recognised");
  assert.deepEqual(r.body.warnings, []);
});

test("tenant isolation for templates", async () => {
  assert.deepEqual((await call("GET", "/api/templates", { token: B })).body, []);
  for (const [m, u] of [["GET", `/api/templates/${upId}`], ["PUT", `/api/templates/${upId}`], ["PUT", `/api/templates/${upId}/mapping`],
    ["POST", `/api/templates/${upId}/default`], ["GET", `/api/templates/${upId}/sample.docx`], ["DELETE", `/api/templates/${upId}`]]) {
    assert.equal((await call(m, u, { token: B, body: m === "GET" || m === "DELETE" ? undefined : {} })).status, 404, `${m} ${u}`);
  }
});

test("deleting the default promotes another ready template", async () => {
  assert.equal((await call("DELETE", `/api/templates/${upId}`, { token: T })).status, 204);
  const list = (await call("GET", "/api/templates", { token: T })).body;
  assert.equal(list.filter((x) => x.isDefault).length, 1);
  assert.ok(!list.some((x) => x.id === upId));
});
