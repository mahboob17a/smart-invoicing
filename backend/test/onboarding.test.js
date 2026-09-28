const test = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, call, newOrg } = require("./helpers");
const { renderFilename, validatePattern, DEFAULT_PATTERN } = require("../src/lib/filename");

let T;
test.before(async () => { await start(); T = await newOrg("Onb"); });
test.after(stop);

test("cannot complete onboarding until every step is saved", async () => {
  const r = await call("POST", "/api/onboarding/complete", { token: T });
  assert.equal(r.status, 400);
  assert.equal(r.body.details.length, 7);
});

test("wizard steps save and report progress in order", async () => {
  const s0 = await call("GET", "/api/onboarding/status", { token: T });
  assert.deepEqual(s0.body.order, ["companyProfile", "issuingIdentity", "recipient", "conversionRule", "invoiceNumbering", "filenamePattern", "reportTemplate"]);

  assert.equal((await call("POST", "/api/company-profile", { token: T, body: { legalName: "  Falaj Facilities LLC ", registrationNo: "1234567" } })).status, 201);
  const idn = await call("POST", "/api/issuing-identities", { token: T, body: { sameAsCompany: true } });
  assert.equal(idn.status, 201);
  assert.equal(idn.body.displayName, "Falaj Facilities LLC", "same-as-company identity reads the profile");
  assert.equal((await call("POST", "/api/issuing-identities", { token: T, body: {} })).status, 400);

  const rec = await call("POST", "/api/recipients", { token: T, body: { name: "University Campus North", code: "ucn" } });
  assert.equal(rec.body.code, "UCN");
  assert.equal((await call("POST", "/api/recipients", { token: T, body: { name: "Other", code: "UCN" } })).status, 400);
  assert.equal((await call("POST", "/api/recipients", { token: T, body: { name: "Other", code: "U N" } })).status, 400);

  const rule = await call("POST", "/api/conversion-rules", { token: T, body: { name: "Std", markupPct: "15", taxPct: 5, currencyCode: "omr" } });
  assert.equal(rule.status, 201);
  assert.equal(rule.body.currencyCode, "OMR");
  assert.equal(rule.body.decimalPlaces, 3);
  assert.equal((await call("POST", "/api/conversion-rules", { token: T, body: { name: "x", markupPct: -1, taxPct: 5 } })).status, 400);
  const upd = await call("PUT", `/api/conversion-rules/${rule.body.id}`, { token: T, body: { decimalPlaces: 2 } });
  assert.equal(upd.body.decimalPlaces, 2);
  assert.equal(upd.body.markupPct, 15);

  assert.equal((await call("POST", "/api/invoice-numbering", { token: T, body: { issuingIdentityId: idn.body.id, nextNumber: 192 } })).body.preview.endsWith("-0192"), true);

  const fp = await call("GET", "/api/filename-patterns", { token: T });
  assert.equal(fp.body.isSaved, false);
  assert.equal(fp.body.pattern, DEFAULT_PATTERN);
  assert.equal((await call("PUT", "/api/filename-patterns", { token: T, body: { pattern: fp.body.pattern } })).status, 200);

  const rt = await call("POST", "/api/report-templates", { token: T, body: { name: "Default", titleText: "Annexure 1", columns: ["date", "original_bill_no", "invoice_no", "grand_total"], remarksRecipientId: rec.body.id } });
  assert.equal(rt.status, 201);
  assert.equal((await call("POST", "/api/report-templates", { token: T, body: { name: "x", titleText: "x", columns: ["nope"] } })).status, 400);

  const s1 = await call("GET", "/api/onboarding/status", { token: T });
  assert.ok(Object.values(s1.body.steps).every(Boolean));
  assert.equal((await call("POST", "/api/onboarding/complete", { token: T })).status, 200);
  assert.equal((await call("GET", "/api/me", { token: T })).body.organization.onboardingComplete, true);
});

test("filename rules: original bill number identifies the file", () => {
  assert.equal(
    renderFilename(DEFAULT_PATTERN, { IssuingName: "Falaj", RecipientCode: "UCN", VendorName: "Gulf Hardware Trading", OriginalBillNo: "4471", OriginalDate: "2026-09-14" }),
    "Falaj_Invoice_UCN_GulfHardwareTrading_4471_2026-09-14.pdf"
  );
  assert.equal(renderFilename("{VendorName}_{OriginalBillNo}", { VendorName: 'A/B: "C"', OriginalBillNo: "" }), "ABC.pdf");
  assert.match(validatePattern("{VendorName}").join(), /every file name is different/);
  assert.match(validatePattern("{Bogus}_{InvoiceNo}").join(), /Unknown placeholder/);
  assert.deepEqual(validatePattern(DEFAULT_PATTERN), []);
});

test("filename preview endpoint reports problems without saving", async () => {
  const r = await call("POST", "/api/filename-patterns/preview", { token: T, body: { pattern: "{VendorName}" } });
  assert.equal(r.status, 200);
  assert.equal(r.body.errors.length, 1);
  assert.equal((await call("PUT", "/api/filename-patterns", { token: T, body: { pattern: "{VendorName}" } })).status, 400);
});

test("logo upload stores the file per organisation and serves it back", async () => {
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4b40000000049454e44ae426082", "hex");
  const form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), "logo.png");
  const r = await call("POST", "/api/uploads/logo", { token: T, raw: form });
  assert.equal(r.status, 201);
  assert.match(r.body.url, /^\/uploads\/[0-9a-f-]+\/logo-[0-9a-f-]+\.png$/);
  const got = await call("GET", r.body.url);
  assert.equal(got.status, 200);

  const bad = new FormData();
  bad.append("file", new Blob(["hello"], { type: "text/plain" }), "x.txt");
  assert.equal((await call("POST", "/api/uploads/logo", { token: T, raw: bad })).status, 400);
});
