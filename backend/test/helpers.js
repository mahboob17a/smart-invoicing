// Test harness: each test file runs in its own process (node --test), with a
// fresh in-memory database and a temp upload folder.
const os = require("os");
const path = require("path");
const fs = require("fs");

process.env.DATABASE_FILE = ":memory:";
process.env.JWT_SECRET = "test-secret-" + Math.random();
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "si-uploads-"));

const app = require("../src/app");

let server, base;
async function start() {
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://127.0.0.1:${server.address().port}`;
  return base;
}
async function stop() {
  await new Promise((r) => server.close(r));
}

async function call(method, url, { token, body, raw, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let payload;
  if (raw) payload = raw;
  else if (body !== undefined) {
    h["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(base + url, { method, headers: h, body: payload });
  const buf = Buffer.from(await res.arrayBuffer());
  const text = buf.toString("utf8");
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json, res, buf };
}

let n = 0;
async function newOrg(label = "Org") {
  n += 1;
  const r = await call("POST", "/api/auth/signup", {
    body: { organizationName: `${label} ${n} LLC`, name: `User ${n}`, email: `user${n}.${label.toLowerCase()}@example.com`, password: "correcthorse123" },
  });
  if (r.status !== 201) throw new Error("signup failed: " + JSON.stringify(r.body));
  return r.body.token;
}

/** Runs every onboarding step for an org and returns created ids. */
async function onboard(token) {
  await call("POST", "/api/company-profile", { token, body: { legalName: "Falaj Facilities LLC", taxNo: "OM1100000001" } });
  const idn = await call("POST", "/api/issuing-identities", { token, body: { sameAsCompany: true } });
  const rec = await call("POST", "/api/recipients", { token, body: { name: "University Campus North", code: "ucn" } });
  const rule = await call("POST", "/api/conversion-rules", { token, body: { name: "Standard", markupPct: 15, taxPct: 5 } });
  const ser = await call("POST", "/api/invoice-numbering", { token, body: { issuingIdentityId: idn.body.id } });
  await call("PUT", "/api/filename-patterns", { token, body: { pattern: "{IssuingName}_Invoice_{RecipientCode}_{VendorName}_{OriginalBillNo}_{OriginalDate}" } });
  const rep = await call("POST", "/api/report-templates", {
    token, body: { name: "Annexure", titleText: "Annexure 1", columns: ["date", "original_bill_no", "grand_total"] },
  });
  return { identityId: idn.body.id, recipientId: rec.body.id, ruleId: rule.body.id, seriesId: ser.body.id, reportId: rep.body.id };
}

module.exports = { start, stop, call, newOrg, onboard };
