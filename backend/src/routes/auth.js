const express = require("express");
const bcrypt = require("bcryptjs");
const { randomUUID } = require("crypto");
const db = require("../db");
const { signToken } = require("../middleware/auth");

const router = express.Router();

// POST /api/auth/signup
// Creates a brand-new Organization (the tenant) and its first User, who is
// automatically the Account Owner (Section 5 of the design doc — no role
// tiers, but someone has to own billing/invites for the account).
router.post("/signup", (req, res) => {
  const { organizationName, name, password } = req.body || {};
  const email = normalizeEmail(req.body?.email);
  if (!organizationName || !name || !email || !password) {
    return res.status(400).json({
      error: "organizationName, name, email, and password are all required",
    });
  }
  if (typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const existing = db.prepare("SELECT id FROM users WHERE lower(email) = ?").get(email);
  if (existing) {
    return res.status(409).json({ error: "An account with that email already exists" });
  }

  const organizationId = randomUUID();
  const userId = randomUUID();
  const passwordHash = bcrypt.hashSync(password, 10);

  const tx = db.transaction(() => {
    db.prepare(
      "INSERT INTO organizations (id, name) VALUES (?, ?)"
    ).run(organizationId, organizationName);

    db.prepare(
      `INSERT INTO users (id, organization_id, name, email, password_hash, is_account_owner)
       VALUES (?, ?, ?, ?, ?, 1)`
    ).run(userId, organizationId, name, email, passwordHash);
  });
  tx();

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  const token = signToken(user);

  res.status(201).json({
    token,
    organization: { id: organizationId, name: organizationName, onboardingComplete: false },
    user: { id: userId, name, email, isAccountOwner: true },
  });
});

// POST /api/auth/login
router.post("/login", (req, res) => {
  const { password } = req.body || {};
  const email = normalizeEmail(req.body?.email);
  if (!email || typeof password !== "string") {
    return res.status(400).json({ error: "email and password are required" });
  }

  // lower(): accounts created before emails were normalized on signup.
  const user = db.prepare("SELECT * FROM users WHERE lower(email) = ?").get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const org = db
    .prepare("SELECT * FROM organizations WHERE id = ?")
    .get(user.organization_id);

  const token = signToken(user);
  res.json({
    token,
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

// "Jordan@Acme.test" and "jordan@acme.test" are the same person.
function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

module.exports = router;
