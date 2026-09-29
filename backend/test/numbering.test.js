// Design Document v5.1 §6.8 / §8.8 — invoice numbers are the customer's own,
// assigned by the app; never the vendor's original bill number.
const test = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, call, newOrg, onboard } = require("./helpers");
const lib = require("../src/lib/invoiceNumber");

let T, ids;
test.before(async () => {
  await start();
  T = await newOrg("Num");
  ids = await onboard(T);
});
test.after(stop);

const base = { mode: "auto", formatPattern: "{Prefix}-{YYYY}-{Seq}", prefix: "INV", padding: 4, resetRule: "never", nextNumber: 1 };

test("format placeholders", () => {
  const d = new Date(2026, 8, 28);
  assert.equal(lib.formatNumber(base, 192, d), "INV-2026-0192");
  assert.equal(lib.formatNumber({ ...base, formatPattern: "{Prefix}/{YY}{MM}/{Seq}", padding: 3 }, 7, d), "INV/2609/007");
});

test("validation rules", () => {
  assert.deepEqual(lib.validateConfig(base), []);
  assert.match(lib.validateConfig({ ...base, formatPattern: "{Prefix}-{YYYY}" }).join(), /must include \{Seq\}/);
  assert.match(lib.validateConfig({ ...base, formatPattern: "{Prefix}-{Seq}", resetRule: "yearly" }).join(), /yearly reset/);
  assert.match(lib.validateConfig({ ...base, resetRule: "monthly" }).join(), /monthly reset/);
  assert.match(lib.validateConfig({ ...base, formatPattern: "{Foo}{Seq}" }).join(), /Unknown placeholder/);
  assert.match(lib.validateConfig({ ...base, padding: 0 }).join(), /Digits/);
});

test("allocation is sequential and unique", async () => {
  const seen = new Set();
  const org = await orgId();
  for (let i = 0; i < 200; i++) seen.add((await lib.allocateNext(org, ids.seriesId)).invoiceNo);
  assert.equal(seen.size, 200);
  assert.ok(seen.has("INV-" + new Date().getFullYear() + "-0001"));
  assert.ok(seen.has("INV-" + new Date().getFullYear() + "-0200"));
});

test("preview does not consume a number", async () => {
  const p1 = await call("GET", `/api/invoice-numbering/${ids.seriesId}/preview`, { token: T });
  const p2 = await call("GET", `/api/invoice-numbering/${ids.seriesId}/preview`, { token: T });
  assert.equal(p1.body.preview, p2.body.preview);
  assert.match(p1.body.preview, /-0201$/);
});

test("next number cannot be moved back onto an issued number", async () => {
  const back = await call("PUT", `/api/invoice-numbering/${ids.seriesId}`, { token: T, body: { nextNumber: 150 } });
  assert.equal(back.status, 400);
  assert.match(back.body.error, /200 has already been issued/);
  const fwd = await call("PUT", `/api/invoice-numbering/${ids.seriesId}`, { token: T, body: { nextNumber: 500 } });
  assert.equal(fwd.status, 200);
  assert.match(fwd.body.preview, /-0500$/);
});

test("yearly reset starts again at 1 in a new year", () => {
  const cfg = { ...base, resetRule: "yearly", nextNumber: 42, periodKey: "2026" };
  assert.equal(lib.previewNext(cfg, new Date(2026, 11, 31)), "INV-2026-0042");
  assert.equal(lib.previewNext(cfg, new Date(2027, 0, 1)), "INV-2027-0001");
});

test("blank mode assigns no number", async () => {
  const r = await call("PUT", `/api/invoice-numbering/${ids.seriesId}`, { token: T, body: { mode: "blank" } });
  assert.equal(r.body.preview, null);
  assert.deepEqual(await lib.allocateNext(await orgId(), ids.seriesId), { invoiceNo: null, seq: null });
});

test("one series per identity; one shared series per organisation", async () => {
  const dup = await call("POST", "/api/invoice-numbering", { token: T, body: { issuingIdentityId: ids.identityId } });
  assert.equal(dup.status, 400);
  const shared = await call("POST", "/api/invoice-numbering", { token: T, body: { prefix: "GEN" } });
  assert.equal(shared.status, 201);
  assert.equal((await call("POST", "/api/invoice-numbering", { token: T, body: {} })).status, 400);
  await call("PUT", "/api/invoice-numbering/scope", { token: T, body: { scope: "shared" } });
  assert.equal((await lib.resolveSeries(await orgId(), ids.identityId)).prefix, "GEN");
});

test("unsaved configuration preview", async () => {
  const r = await call("POST", "/api/invoice-numbering/preview", { token: T, body: { formatPattern: "{Prefix}{Seq}", prefix: "FF", padding: 5, nextNumber: 12 } });
  assert.equal(r.body.preview, "FF00012");
  const bad = await call("POST", "/api/invoice-numbering/preview", { token: T, body: { formatPattern: "{Prefix}" } });
  assert.equal(bad.status, 400);
});

async function orgId() {
  return (await require("../src/db").get("SELECT organization_id FROM invoice_number_series WHERE id = ?", ids.seriesId)).organization_id;
}
