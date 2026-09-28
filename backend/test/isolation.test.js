// Roadmap v1.1 risk: multi-tenant isolation must be proven by automated tests.
const test = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, call, newOrg, onboard } = require("./helpers");

let A, B, ids;
test.before(async () => {
  await start();
  A = await newOrg("Alpha");
  B = await newOrg("Beta");
  ids = await onboard(A);
});
test.after(stop);

const lists = [
  ["/api/issuing-identities", "identityId"],
  ["/api/recipients", "recipientId"],
  ["/api/conversion-rules", "ruleId"],
  ["/api/report-templates", "reportId"],
];

for (const [path, key] of lists) {
  test(`${path}: another organisation sees nothing and cannot touch A's record`, async () => {
    const own = await call("GET", path, { token: A });
    assert.equal(own.body.length, 1);
    const other = await call("GET", path, { token: B });
    assert.deepEqual(other.body, []);
    assert.equal((await call("GET", `${path}/${ids[key]}`, { token: B })).status, 404);
    assert.equal((await call("PUT", `${path}/${ids[key]}`, { token: B, body: { name: "hijack" } })).status, 404);
    assert.equal((await call("DELETE", `${path}/${ids[key]}`, { token: B })).status, 404);
    assert.equal((await call("GET", `${path}/${ids[key]}`, { token: A })).status, 200);
  });
}

test("company profile is per organisation", async () => {
  assert.equal((await call("GET", "/api/company-profile", { token: B })).body, null);
  assert.equal((await call("GET", "/api/company-profile", { token: A })).body.legalName, "Falaj Facilities LLC");
});

test("invoice numbering series are per organisation", async () => {
  assert.equal((await call("GET", "/api/invoice-numbering", { token: B })).body.series.length, 0);
  assert.equal((await call("PUT", `/api/invoice-numbering/${ids.seriesId}`, { token: B, body: { prefix: "X" } })).status, 404);
  assert.equal((await call("GET", `/api/invoice-numbering/${ids.seriesId}/preview`, { token: B })).status, 404);
  const r = await call("POST", "/api/invoice-numbering", { token: B, body: { issuingIdentityId: ids.identityId } });
  assert.equal(r.status, 400, "B cannot attach a series to A's identity");
});

test("filename pattern is per organisation", async () => {
  await call("PUT", "/api/filename-patterns", { token: B, body: { pattern: "{InvoiceNo}" } });
  assert.equal((await call("GET", "/api/filename-patterns", { token: A })).body.pattern.startsWith("{IssuingName}"), true);
  assert.equal((await call("GET", "/api/filename-patterns", { token: B })).body.pattern, "{InvoiceNo}");
});

test("B cannot point a report template at A's recipient", async () => {
  const r = await call("POST", "/api/report-templates", {
    token: B, body: { name: "x", titleText: "x", columns: ["date"], remarksRecipientId: ids.recipientId },
  });
  assert.equal(r.status, 400);
});

test("onboarding status only counts the caller's own data", async () => {
  const b = await call("GET", "/api/onboarding/status", { token: B });
  assert.equal(b.body.steps.companyProfile, false);
  assert.equal(b.body.steps.recipient, false);
});
