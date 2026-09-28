const test = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, call } = require("./helpers");

test.before(start);
test.after(stop);

test("sign-up creates an organisation and an Account Owner", async () => {
  const r = await call("POST", "/api/auth/signup", {
    body: { organizationName: "Acme LLC", name: "Jordan", email: "Jordan@Acme.test ", password: "correcthorse123" },
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.isAccountOwner, true);
  assert.equal(r.body.user.email, "jordan@acme.test");
  assert.equal(r.body.organization.onboardingComplete, false);
});

test("duplicate email is rejected regardless of case", async () => {
  const r = await call("POST", "/api/auth/signup", {
    body: { organizationName: "Other", name: "X", email: "JORDAN@acme.test", password: "correcthorse123" },
  });
  assert.equal(r.status, 409);
});

test("sign-up validates email and password length", async () => {
  assert.equal((await call("POST", "/api/auth/signup", { body: { organizationName: "A", name: "B", email: "nope", password: "correcthorse123" } })).status, 400);
  assert.equal((await call("POST", "/api/auth/signup", { body: { organizationName: "A", name: "B", email: "a@b.co", password: "short" } })).status, 400);
});

test("login works with any email case; wrong password fails", async () => {
  const ok = await call("POST", "/api/auth/login", { body: { email: "JORDAN@ACME.TEST", password: "correcthorse123" } });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);
  const bad = await call("POST", "/api/auth/login", { body: { email: "jordan@acme.test", password: "wrongpass123" } });
  assert.equal(bad.status, 401);
});

test("protected routes need a valid token", async () => {
  assert.equal((await call("GET", "/api/me")).status, 401);
  assert.equal((await call("GET", "/api/me", { token: "garbage" })).status, 401);
});

test("malformed JSON gets a 400, not a 500", async () => {
  const r = await call("POST", "/api/auth/login", { raw: "{not json", headers: { "Content-Type": "application/json" } });
  assert.equal(r.status, 400);
});
