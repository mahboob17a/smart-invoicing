// The Express app, without app.listen(), so the test suite can start it on
// a random port. src/index.js is the process entry point.
const express = require("express");
const cors = require("cors");

const { requireAuth } = require("./middleware/auth");
const authRoutes = require("./routes/auth");
const companyProfileRoutes = require("./routes/companyProfile");
const issuingIdentityRoutes = require("./routes/issuingIdentities");
const recipientRoutes = require("./routes/recipients");
const conversionRuleRoutes = require("./routes/conversionRules");
const onboardingRoutes = require("./routes/onboarding");
const meRoutes = require("./routes/me");
const { router: assetRoutes } = require("./routes/assets");
const filenamePatternRoutes = require("./routes/filenamePatterns");
const reportTemplateRoutes = require("./routes/reportTemplates");
const billRoutes = require("./routes/bills");

const app = express();
app.use(cors());
app.use(express.json({ limit: "100kb" }));

app.get("/health", (req, res) => res.json({ ok: true, service: "smart-invoicing-backend" }));

// Public (no auth required)
app.use("/api/auth", authRoutes);

// Everything below this line requires a valid session and is
// automatically scoped to req.organizationId by requireAuth.
app.use("/api", requireAuth);
app.use("/api/company-profile", companyProfileRoutes);
app.use("/api/issuing-identities", issuingIdentityRoutes);
app.use("/api/recipients", recipientRoutes);
app.use("/api/conversion-rules", conversionRuleRoutes);
app.use("/api/filename-patterns", filenamePatternRoutes);
app.use("/api/report-templates", reportTemplateRoutes);
app.use("/api/assets", assetRoutes);
app.use("/api/bills", billRoutes);
app.use("/api/onboarding", onboardingRoutes);
app.use("/api/me", meRoutes);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Malformed JSON bodies are the client's mistake, not a server fault.
  if (err.type === "entity.parse.failed" || err.type === "entity.too.large") {
    return res.status(400).json({ error: "Request body is not valid JSON or is too large" });
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
