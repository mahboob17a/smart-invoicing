const express = require("express");
const bcrypt = require("bcryptjs");
const { randomUUID } = require("crypto");
const db = require("../db");
const { signToken } = require("../middleware/auth");
const { handle } = require("../lib/http");

const router = express.Router();

// POST /api/auth/signup
// Creates a brand-new Organization (the tenant) and its first User, who is
// automatically the Account Owner (Section 5 of the design doc — no role
// tiers, but someone has to own billing/invites for the account).
router.post("/signup", handle(async (req, res) => {
  const body = req.body || {};
  const organizationName = String(body.organizationName || "").trim();
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!organizationName || !name || !email || !password) {
    return res.status(400).json({
      error: "organizationName, name, email, and password are all required",
    });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Enter a valid email address" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const existing = await db.get("SELECT id FROM users WHERE email = ?", email);
  if (existing) {
    return res.status(409).json({ error: "An account with that email already exists" });
  }

  const organizationId = randomUUID();
  const userId = randomUUID();
  const passwordHash = bcrypt.hashSync(password, 10);

  await db.tx(async () => {
    await db.run("INSERT INTO organizations (id, name) VALUES (?, ?)", organizationId, organizationName);

    await db.run(`INSERT INTO users (id, organization_id, name, email, password_hash, is_account_owner)
       VALUES (?, ?, ?, ?, ?, 1)`, userId, organizationId, name, email, passwordHash);
  });

  const user = await db.get("SELECT * FROM users WHERE id = ?", userId);
  const token = signToken(user);

  res.status(201).json({
    token,
    organization: { id: organizationId, name: organizationName, onboardingComplete: false },
    user: { id: userId, name, email, isAccountOwner: true },
  });
}));

// POST /api/auth/login
router.post("/login", handle(async (req, res) => {
  const email = String((req.body || {}).email || "").trim().toLowerCase();
  const password = String((req.body || {}).password || "");
  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  const user = await db.get("SELECT * FROM users WHERE email = ?", email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const org = await db.get("SELECT * FROM organizations WHERE id = ?", user.organization_id);

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
}));

module.exports = router;
