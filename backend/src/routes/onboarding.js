const express = require("express");
const db = require("../db");

const router = express.Router();

// GET /api/onboarding/status
// Tells the mobile app which onboarding steps are already done, so the
// onboarding wizard (Phase 1, Week 3) can resume where the user left off
// instead of always starting from screen one.
router.get("/status", (req, res) => {
  res.json(onboardingStatus(req.organizationId));
});

function onboardingStatus(organizationId) {
  const org = db
    .prepare("SELECT * FROM organizations WHERE id = ?")
    .get(organizationId);

  const hasCompanyProfile = !!db
    .prepare("SELECT id FROM company_profiles WHERE organization_id = ?")
    .get(organizationId);
  const issuingIdentityCount = db
    .prepare("SELECT COUNT(*) as c FROM issuing_identities WHERE organization_id = ?")
    .get(organizationId).c;
  const recipientCount = db
    .prepare("SELECT COUNT(*) as c FROM recipients WHERE organization_id = ?")
    .get(organizationId).c;
  const conversionRuleCount = db
    .prepare("SELECT COUNT(*) as c FROM conversion_rule_profiles WHERE organization_id = ?")
    .get(organizationId).c;
  const hasFilenamePattern = !!db
    .prepare("SELECT id FROM filename_patterns WHERE organization_id = ?")
    .get(organizationId);
  const reportTemplateCount = db
    .prepare("SELECT COUNT(*) as c FROM report_template_configs WHERE organization_id = ?")
    .get(organizationId).c;

  return {
    onboardingComplete: !!org.onboarding_complete,
    steps: {
      companyProfile: hasCompanyProfile,
      issuingIdentity: issuingIdentityCount > 0,
      recipient: recipientCount > 0,
      conversionRule: conversionRuleCount > 0,
      filenamePattern: hasFilenamePattern,
      reportTemplate: reportTemplateCount > 0,
    },
  };
}

// POST /api/onboarding/complete
// Refuses until every form is saved, so an account can never be marked
// "fully configured" while missing something later phases depend on.
router.post("/complete", (req, res) => {
  const { steps } = onboardingStatus(req.organizationId);
  const missing = Object.keys(steps).filter((k) => !steps[k]);
  if (missing.length) {
    return res.status(409).json({ error: `Onboarding steps not finished: ${missing.join(", ")}` });
  }
  db.prepare(
    "UPDATE organizations SET onboarding_complete = 1 WHERE id = ?"
  ).run(req.organizationId);
  res.json({ onboardingComplete: true });
});

module.exports = router;
