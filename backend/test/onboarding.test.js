const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer } = require("./helpers");

let t;
before(async () => { t = await startServer(); });
after(() => t.close());

test("a new organization can complete every onboarding form and finish", async () => {
  const { token } = await t.signup();

  const initial = await t.request("GET", "/api/onboarding/status", { token });
  assert.deepEqual(initial.data.steps, {
    companyProfile: false, issuingIdentity: false, recipient: false,
    conversionRule: false, filenamePattern: false, reportTemplate: false,
  });

  const early = await t.request("POST", "/api/onboarding/complete", { token });
  assert.equal(early.status, 409, "cannot complete onboarding with forms missing");

  const saved = await t.completeAllForms(token);
  assert.equal(saved.companyProfile.logoAssetId, saved.logo.id);
  assert.equal(saved.companyProfile.logoUrl, `/api/assets/${saved.logo.id}`);
  assert.equal(saved.issuingIdentity.logoAssetId, saved.logo.id);
  assert.equal(saved.recipient.code, "NWP");
  assert.equal(saved.conversionRule.decimalPlaces, 3);
  assert.equal(saved.filenamePattern.preview, "Acme Trading_NWP_INV-4471");
  assert.equal(saved.reportTemplate.titleText, "Annexure 1");
  assert.equal(saved.reportTemplate.sortField, "date");
  assert.equal(saved.reportTemplate.showTotalsRow, true);

  const status = await t.request("GET", "/api/onboarding/status", { token });
  assert.ok(Object.values(status.data.steps).every(Boolean));

  const done = await t.request("POST", "/api/onboarding/complete", { token });
  assert.equal(done.status, 200);
  const me = await t.request("GET", "/api/me", { token });
  assert.equal(me.data.organization.onboardingComplete, true);
});

test("company profile and filename pattern are one-per-organization upserts", async () => {
  const { token } = await t.signup();
  const first = await t.request("POST", "/api/company-profile", { token, body: { legalName: "One" } });
  const second = await t.request("POST", "/api/company-profile", { token, body: { legalName: "Two" } });
  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal(second.data.id, first.data.id);
  assert.equal((await t.request("GET", "/api/company-profile", { token })).data.legalName, "Two");

  await t.request("POST", "/api/filename-patterns", { token, body: { patternString: "{VendorName}" } });
  const updated = await t.request("POST", "/api/filename-patterns", { token, body: { patternString: "{Seq}_{VendorName}" } });
  assert.equal(updated.status, 200);
  assert.equal((await t.request("GET", "/api/filename-patterns", { token })).data.patternString, "{Seq}_{VendorName}");
});

test("conversion rule validation", async () => {
  const { token } = await t.signup();
  const post = (body) => t.request("POST", "/api/conversion-rules", { token, body });
  const base = { name: "R", markupPct: 10, taxPct: 5 };
  assert.equal((await post(base)).status, 201);
  assert.equal((await post({ ...base, markupPct: "10" })).status, 400);
  assert.equal((await post({ ...base, markupPct: -1 })).status, 400);
  assert.equal((await post({ ...base, taxPct: 101 })).status, 400);
  assert.equal((await post({ ...base, currencyCode: "dollars" })).status, 400);
  assert.equal((await post({ ...base, decimalPlaces: 1.5 })).status, 400);
});

test("filename pattern validation", async () => {
  const { token } = await t.signup();
  const post = (patternString) => t.request("POST", "/api/filename-patterns", { token, body: { patternString } });
  assert.equal((await post("")).status, 400);
  assert.match((await post("{Nope}_{VendorName}")).data.error, /Unknown placeholder/);
  assert.match((await post("{VendorName")).data.error, /unmatched/);
  assert.match((await post("invoice")).data.error, /at least one placeholder/);

  const placeholders = await t.request("GET", "/api/filename-patterns/placeholders", { token });
  assert.ok(placeholders.data.placeholders.some((p) => p.token === "OriginalBillNo"));
  assert.equal((await post(placeholders.data.defaultPattern)).status, 201);
});

test("report template validation", async () => {
  const { token } = await t.signup();
  const post = (body) => t.request("POST", "/api/report-templates", { token, body });
  const base = { name: "R", titleText: "Schedule A" };
  assert.equal((await post(base)).status, 201, "defaults fill in everything else");
  assert.equal((await post({ ...base, columns: [] })).status, 400);
  assert.equal((await post({ ...base, columns: ["date", "bogus"] })).status, 400);
  assert.equal((await post({ ...base, columns: ["date", "date"] })).status, 400);
  assert.equal((await post({ ...base, columns: ["grandTotal"], sortField: "date" })).status, 400);
  assert.equal((await post({ ...base, groupField: "grandTotal" })).status, 400);
  assert.equal((await post({ ...base, groupField: "vendorName" })).status, 201);
  assert.equal((await post({ ...base, undatedBills: "first" })).status, 400);
  assert.equal((await post({ ...base, remarksRecipientId: "no-such-id" })).status, 400);
});

test("a recipient used by a report template cannot be deleted out from under it", async () => {
  const { token } = await t.signup();
  const { recipient } = await t.completeAllForms(token);
  const res = await t.request("DELETE", `/api/recipients/${recipient.id}`, { token });
  assert.equal(res.status, 409);
});

test("logo upload accepts PNG/JPEG only, within the size limit", async () => {
  const { token } = await t.signup();
  const ok = await t.uploadLogo(token);
  assert.equal(ok.status, 201);

  const fetched = await t.request("GET", ok.data.url, { token });
  assert.equal(fetched.status, 200);
  assert.match(fetched.type, /image\/png/);

  const notImage = await t.uploadLogo(token, Buffer.from("MZ fake exe"), "image/png");
  assert.equal(notImage.status, 400, "magic bytes are checked, not just the declared type");

  const gif = await t.uploadLogo(token, Buffer.from("GIF89a"), "image/gif");
  assert.equal(gif.status, 400);

  const huge = await t.uploadLogo(token, Buffer.alloc(3 * 1024 * 1024, 0x89), "image/png");
  assert.equal(huge.status, 400);

  const noFile = await t.request("POST", "/api/assets/logo", { token, form: new FormData() });
  assert.equal(noFile.status, 400);
});
