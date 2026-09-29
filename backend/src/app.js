const express = require("express");
const cors = require("cors");

const { requireAuth } = require("./middleware/auth");
const { HttpError } = require("./lib/http");
const uploads = require("./routes/uploads");

const app = express();
app.use(cors({ exposedHeaders: ["Content-Disposition", "X-Filename"] }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", async (req, res) => {
  try {
    await require("./db").get("SELECT 1 AS ok");
    res.json({ ok: true, service: "smart-invoicing-backend" });
  } catch (e) {
    res.status(503).json({ ok: false, error: "Database not reachable" });
  }
});
// Only company logos are public. Bill images, templates and invoices are
// served by their own routes to signed-in users of the same organization.
app.use("/uploads", uploads.serveLogo);

// Public
app.use("/api/auth", require("./routes/auth"));

// Everything below requires a valid session and is scoped to req.organizationId.
app.use("/api", requireAuth);
app.use("/api/me", require("./routes/me"));
app.use("/api/onboarding", require("./routes/onboarding"));
app.use("/api/company-profile", require("./routes/companyProfile"));
app.use("/api/issuing-identities", require("./routes/issuingIdentities"));
app.use("/api/recipients", require("./routes/recipients"));
app.use("/api/conversion-rules", require("./routes/conversionRules"));
app.use("/api/invoice-numbering", require("./routes/invoiceNumbering"));
app.use("/api/filename-patterns", require("./routes/filenamePatterns"));
app.use("/api/report-templates", require("./routes/reportTemplates"));
app.use("/api/uploads", uploads);
app.use("/api/bills", require("./routes/bills"));
app.use("/api/templates", require("./routes/templates"));
app.use("/api/invoices", require("./routes/invoices"));

app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
  if (err.name === "TemplateError") return res.status(400).json({ error: err.message });
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Request body is not valid JSON" });
  if (err.code === "LIMIT_FILE_SIZE")
    return res.status(400).json({
      error: req.originalUrl.startsWith("/api/bills") ? "Each bill file must be 15 MB or smaller"
        : req.originalUrl.startsWith("/api/templates") ? "Template files must be 5 MB or smaller"
        : "Logo must be 2 MB or smaller",
    });
  if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE")
    return res.status(400).json({ error: "Upload up to 5 photos per bill" });
  if (err.status === 404) return res.status(404).json({ error: "Not found" });
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
