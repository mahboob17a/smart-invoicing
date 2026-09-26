// Shared test harness: a fresh in-memory database and a throwaway upload
// directory per test file (node --test runs each file in its own process),
// plus a tiny fetch wrapper around the real Express app on a random port.
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATABASE_FILE = ":memory:";
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "si-uploads-"));
process.env.JWT_SECRET = "test-secret";

const app = require("../src/app");

// Smallest valid PNG: 1x1 transparent pixel.
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

async function startServer() {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function request(method, urlPath, { token, body, form } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    let payload;
    if (form) {
      payload = form;
    } else if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = typeof body === "string" ? body : JSON.stringify(body);
    }
    const res = await fetch(baseUrl + urlPath, { method, headers, body: payload });
    const type = res.headers.get("content-type") || "";
    const data = type.includes("application/json") ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data, type };
  }

  let counter = 0;
  async function signup(orgName = `Org ${++counter}`) {
    const email = `owner${counter}-${Date.now()}@example.test`;
    const res = await request("POST", "/api/auth/signup", {
      body: { organizationName: orgName, name: "Owner", email, password: "correcthorse123" },
    });
    if (res.status !== 201) throw new Error(`signup failed: ${JSON.stringify(res.data)}`);
    return { ...res.data, email };
  }

  async function uploadLogo(token, bytes = PNG_BYTES, mimeType = "image/png") {
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: mimeType }), "logo.png");
    return request("POST", "/api/assets/logo", { token, form });
  }

  // Saves every onboarding form for an organization, returning what was
  // created so tests can refer to the ids.
  async function completeAllForms(token) {
    const logo = (await uploadLogo(token)).data;
    const companyProfile = (
      await request("POST", "/api/company-profile", {
        token,
        body: { legalName: "Acme LLC", taxNo: "OM123", logoAssetId: logo.id },
      })
    ).data;
    const issuingIdentity = (
      await request("POST", "/api/issuing-identities", {
        token,
        body: { displayName: "Acme Trading", logoAssetId: logo.id },
      })
    ).data;
    const recipient = (
      await request("POST", "/api/recipients", {
        token,
        body: { name: "Northwind Projects", code: "NWP" },
      })
    ).data;
    const conversionRule = (
      await request("POST", "/api/conversion-rules", {
        token,
        body: { name: "Standard", markupPct: 30, taxPct: 5, taxLabel: "VAT", currencyCode: "OMR", decimalPlaces: 3 },
      })
    ).data;
    const filenamePattern = (
      await request("POST", "/api/filename-patterns", {
        token,
        body: { patternString: "{IssuingName}_{RecipientCode}_{OriginalBillNo}" },
      })
    ).data;
    const reportTemplate = (
      await request("POST", "/api/report-templates", {
        token,
        body: { name: "Annexure", titleText: "Annexure 1", remarksRecipientId: recipient.id },
      })
    ).data;
    return { logo, companyProfile, issuingIdentity, recipient, conversionRule, filenamePattern, reportTemplate };
  }

  return {
    request,
    signup,
    uploadLogo,
    completeAllForms,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

module.exports = { startServer, PNG_BYTES };
