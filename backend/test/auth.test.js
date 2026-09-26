const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer } = require("./helpers");

let t;
before(async () => { t = await startServer(); });
after(() => t.close());

test("signup creates an organization and an account-owner user", async () => {
  const res = await t.request("POST", "/api/auth/signup", {
    body: { organizationName: "Acme", name: "Jordan", email: "Jordan@Acme.test", password: "correcthorse123" },
  });
  assert.equal(res.status, 201);
  assert.ok(res.data.token);
  assert.equal(res.data.user.email, "jordan@acme.test");
  assert.equal(res.data.user.isAccountOwner, true);
  assert.equal(res.data.organization.onboardingComplete, false);
});

test("signup rejects a duplicate email regardless of case", async () => {
  const res = await t.request("POST", "/api/auth/signup", {
    body: { organizationName: "Other", name: "X", email: "JORDAN@acme.test", password: "correcthorse123" },
  });
  assert.equal(res.status, 409);
});

test("signup validates required fields and password length", async () => {
  const missing = await t.request("POST", "/api/auth/signup", { body: { email: "a@b.test" } });
  assert.equal(missing.status, 400);
  const short = await t.request("POST", "/api/auth/signup", {
    body: { organizationName: "A", name: "A", email: "short@b.test", password: "123" },
  });
  assert.equal(short.status, 400);
});

test("login succeeds with the right password and fails otherwise", async () => {
  const ok = await t.request("POST", "/api/auth/login", {
    body: { email: " jordan@ACME.test ", password: "correcthorse123" },
  });
  assert.equal(ok.status, 200);
  assert.ok(ok.data.token);

  const bad = await t.request("POST", "/api/auth/login", {
    body: { email: "jordan@acme.test", password: "wrong-password" },
  });
  assert.equal(bad.status, 401);
});

test("protected routes reject missing, malformed and forged tokens", async () => {
  assert.equal((await t.request("GET", "/api/me")).status, 401);
  assert.equal((await t.request("GET", "/api/me", { token: "not-a-jwt" })).status, 401);

  const jwt = require("jsonwebtoken");
  const forged = jwt.sign({ sub: "x", organizationId: "y" }, "some-other-secret");
  assert.equal((await t.request("GET", "/api/me", { token: forged })).status, 401);
});

test("GET /api/me restores the session from a token", async () => {
  const { token, organization } = await t.signup("Session Org");
  const me = await t.request("GET", "/api/me", { token });
  assert.equal(me.status, 200);
  assert.equal(me.data.organization.id, organization.id);
  assert.equal(me.data.organization.onboardingComplete, false);
});

test("malformed JSON is a 400, not a 500", async () => {
  const res = await t.request("POST", "/api/auth/login", { body: "{not json" });
  assert.equal(res.status, 400);
});
