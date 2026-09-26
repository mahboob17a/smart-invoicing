const express = require("express");
const db = require("../db");

const router = express.Router();

// GET /api/onboarding/status
// Tells the mobile app which onboarding steps are already done, so the
// onboarding wizard (Phase 1, Week 3) can resume where the user left off
// instead of always starting from screen one.
router.get("/status", (req, res) => {
  const org = db
    .prepare("SELECT * FROM organizations WHERE id = ?")
    .get(req.organizationId);

  const hasCompanyProfile = !!db
    .prepare("SELECT id FROM company_profiles WHERE organization_id = ?")
    .get(req.organizationId);
  const issuingIdentityCount = db
    .prepare("SELECT COUNT(*) as c FROM issuing_identities WHERE organization_id = ?")
    .get(req.organizationId).c;
  const recipientCount = db
    .prepare("SELECT COUNT(*) as c FROM recipients WHERE organization_id = ?")
    .get(req.organizationId).c;
  const conversionRuleCount = db
    .prepare("SELECT COUNT(*) as c FROM conversion_rule_profiles WHERE organization_id = ?")
    .get(req.organizationId).c;

  res.json({
    onboardingComplete: !!org.onboarding_complete,
    steps: {
      companyProfile: hasCompanyProfile,
      issuingIdentity: issuingIdentityCount > 0,
      recipient: recipientCount > 0,
      conversionRule: conversionRuleCount > 0,
    },
  });
});

// POST /api/onboarding/complete
router.post("/complete", (req, res) => {
  db.prepare(
    "UPDATE organizations SET onboarding_complete = 1 WHERE id = ?"
  ).run(req.organizationId);
  res.json({ onboardingComplete: true });
});

module.exports = router;
