const express = require("express");
const cors = require("cors");

const { requireAuth } = require("./middleware/auth");
const { HttpError } = require("./lib/http");
const uploads = require("./routes/uploads");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (req, res) => res.json({ ok: true, service: "smart-invoicing-backend" }));
app.use("/uploads", express.static(uploads.UPLOAD_ROOT, { fallthrough: false, maxAge: "7d" }));

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

app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Request body is not valid JSON" });
  if (err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ error: "Logo must be 2 MB or smaller" });
  if (err.status === 404) return res.status(404).json({ error: "Not found" });
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
