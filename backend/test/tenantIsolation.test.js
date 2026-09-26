// Multi-tenant isolation (design doc Section 12; roadmap Section 5 calls
// this "the one bug class that would be catastrophic to ship" and asks for
// automated tests, not just code review). Organization B must never be
// able to read, modify, delete, or reference anything Organization A owns.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer } = require("./helpers");

let t;
let a;
let b;
let aData;

before(async () => {
  t = await startServer();
  a = await t.signup("Tenant A");
  b = await t.signup("Tenant B");
  aData = await t.completeAllForms(a.token);
});
after(() => t.close());

const LIST_ENDPOINTS = [
  "/api/issuing-identities",
  "/api/recipients",
  "/api/conversion-rules",
  "/api/report-templates",
];

test("B sees none of A's list data", async () => {
  for (const url of LIST_ENDPOINTS) {
    const res = await t.request("GET", url, { token: b.token });
    assert.equal(res.status, 200, url);
    assert.deepEqual(res.data, [], `${url} leaked another tenant's data`);
  }
});

test("B sees none of A's single-record settings", async () => {
  assert.equal((await t.request("GET", "/api/company-profile", { token: b.token })).data, null);
  assert.equal((await t.request("GET", "/api/filename-patterns", { token: b.token })).data, null);
  const status = await t.request("GET", "/api/onboarding/status", { token: b.token });
  assert.ok(Object.values(status.data.steps).every((done) => done === false));
});

test("B's own saves never overwrite A's single-record settings", async () => {
  await t.request("POST", "/api/company-profile", { token: b.token, body: { legalName: "B Corp" } });
  await t.request("POST", "/api/filename-patterns", { token: b.token, body: { patternString: "{Seq}" } });
  const aProfile = await t.request("GET", "/api/company-profile", { token: a.token });
  assert.equal(aProfile.data.legalName, "Acme LLC");
  const aPattern = await t.request("GET", "/api/filename-patterns", { token: a.token });
  assert.equal(aPattern.data.patternString, aData.filenamePattern.patternString);
});

test("B cannot delete A's records", async () => {
  const targets = [
    ["/api/issuing-identities", aData.issuingIdentity.id],
    ["/api/recipients", aData.recipient.id],
    ["/api/conversion-rules", aData.conversionRule.id],
    ["/api/report-templates", aData.reportTemplate.id],
  ];
  for (const [url, id] of targets) {
    const res = await t.request("DELETE", `${url}/${id}`, { token: b.token });
    assert.equal(res.status, 404, `${url}/${id}`);
  }
  for (const url of LIST_ENDPOINTS) {
    const res = await t.request("GET", url, { token: a.token });
    assert.equal(res.data.length, 1, `A's ${url} record was deleted by B`);
  }
});

test("B cannot download A's logo", async () => {
  const res = await t.request("GET", `/api/assets/${aData.logo.id}`, { token: b.token });
  assert.equal(res.status, 404);
});

test("B cannot attach A's logo or A's recipient to B's own settings", async () => {
  const profile = await t.request("POST", "/api/company-profile", {
    token: b.token,
    body: { legalName: "B Corp", logoAssetId: aData.logo.id },
  });
  assert.equal(profile.status, 400);

  const identity = await t.request("POST", "/api/issuing-identities", {
    token: b.token,
    body: { displayName: "B Trading", logoAssetId: aData.logo.id },
  });
  assert.equal(identity.status, 400);

  const report = await t.request("POST", "/api/report-templates", {
    token: b.token,
    body: { name: "R", titleText: "T", remarksRecipientId: aData.recipient.id },
  });
  assert.equal(report.status, 400);
});

test("B cannot mark onboarding complete using A's configuration", async () => {
  const res = await t.request("POST", "/api/onboarding/complete", { token: b.token });
  assert.equal(res.status, 409);
});

test("B can't see, read, edit, retry, delete, or duplicate-match A's bills", async () => {
  const { extraction, cleanExtraction } = require("./helpers");
  extraction.setExtractor(async () => ({ result: cleanExtraction(), model: "test" }));
  try {
    const aBill = await t.uploadAndExtract(a.token);

    assert.deepEqual((await t.request("GET", "/api/bills", { token: b.token })).data, []);
    assert.equal((await t.request("GET", `/api/bills/${aBill.id}`, { token: b.token })).status, 404);
    assert.equal((await t.request("GET", aBill.imageUrl, { token: b.token })).status, 404);
    assert.equal(
      (await t.request("PUT", `/api/bills/${aBill.id}`, { token: b.token, body: { vendorName: "pwned" } })).status,
      404
    );
    assert.equal((await t.request("POST", `/api/bills/${aBill.id}/extract`, { token: b.token })).status, 404);
    assert.equal((await t.request("DELETE", `/api/bills/${aBill.id}`, { token: b.token })).status, 404);

    // The same vendor + number + date in B's account is not a duplicate of A's.
    const bBill = await t.uploadAndExtract(b.token);
    assert.deepEqual(bBill.duplicates, []);

    const aNow = (await t.request("GET", `/api/bills/${aBill.id}`, { token: a.token })).data;
    assert.equal(aNow.vendorName, "City Hardware");
    assert.deepEqual(aNow.duplicates, []);
  } finally {
    extraction.setExtractor();
  }
});
