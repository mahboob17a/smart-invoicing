require("dotenv").config();
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

const app = express();
app.use(cors());
app.use(express.json());

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
app.use("/api/onboarding", onboardingRoutes);
app.use("/api/me", meRoutes);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Smart Invoicing backend listening on http://localhost:${PORT}`);
});
