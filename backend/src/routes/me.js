const express = require("express");
const db = require("../db");

const router = express.Router();

// GET /api/me
// The mobile app only persists the JWT in AsyncStorage, not the
// organization/user objects, so this is how RootNavigator finds out — on
// cold start — who's signed in and whether onboarding is still pending.
router.get("/", (req, res) => {
  const org = db
    .prepare("SELECT * FROM organizations WHERE id = ?")
    .get(req.organizationId);
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.userId);

  if (!org || !user) {
    return res.status(404).json({ error: "Account no longer exists" });
  }

  res.json({
    organization: {
      id: org.id,
      name: org.name,
      onboardingComplete: !!org.onboarding_complete,
    },
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      isAccountOwner: !!user.is_account_owner,
    },
  });
});

module.exports = router;
