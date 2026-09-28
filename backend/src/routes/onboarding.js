const express = require("express");
const db = require("../db");
const { badRequest, handle } = require("../lib/http");

const router = express.Router();

// Onboarding steps in wizard order (Roadmap v1.1, Phase 1 Week 3).
const STEPS = [
  ["companyProfile", "SELECT COUNT(*) c FROM company_profiles WHERE organization_id = ?"],
  ["issuingIdentity", "SELECT COUNT(*) c FROM issuing_identities WHERE organization_id = ?"],
  ["recipient", "SELECT COUNT(*) c FROM recipients WHERE organization_id = ?"],
  ["conversionRule", "SELECT COUNT(*) c FROM conversion_rule_profiles WHERE organization_id = ?"],
  ["invoiceNumbering", "SELECT COUNT(*) c FROM invoice_number_series WHERE organization_id = ?"],
  ["filenamePattern", "SELECT COUNT(*) c FROM filename_patterns WHERE organization_id = ?"],
  ["reportTemplate", "SELECT COUNT(*) c FROM report_template_configs WHERE organization_id = ?"],
];

function stepsFor(orgId) {
  return Object.fromEntries(STEPS.map(([k, sql]) => [k, db.prepare(sql).get(orgId).c > 0]));
}

// GET /api/onboarding/status — lets the wizard resume at the first unsaved step.
router.get("/status", handle((req, res) => {
  const org = db.prepare("SELECT onboarding_complete FROM organizations WHERE id = ?").get(req.organizationId);
  res.json({ onboardingComplete: !!org.onboarding_complete, order: STEPS.map(([k]) => k), steps: stepsFor(req.organizationId) });
}));

// POST /api/onboarding/complete — only once every step has been saved.
router.post("/complete", handle((req, res) => {
  const steps = stepsFor(req.organizationId);
  const missing = Object.keys(steps).filter((k) => !steps[k]);
  if (missing.length) throw badRequest(`Finish these steps first: ${missing.join(", ")}`, missing);
  db.prepare("UPDATE organizations SET onboarding_complete = 1 WHERE id = ?").run(req.organizationId);
  res.json({ onboardingComplete: true });
}));

module.exports = router;
