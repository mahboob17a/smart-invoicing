const jwt = require("jsonwebtoken");

// A missing secret must never silently fall back in production — tokens
// signed with a well-known default would let anyone forge a session.
if (!process.env.JWT_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("JWT_SECRET must be set in production");
}
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-insecure-secret";

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      organizationId: user.organization_id,
      isAccountOwner: !!user.is_account_owner,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// Every route below the onboarding/auth routes uses this. It puts
// req.organizationId and req.userId on the request so every query in
// every route file is naturally scoped to the caller's own tenant —
// this is the one piece of middleware that keeps Section 12's "strict
// multi-tenant data isolation" requirement true across the whole API.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing bearer token" });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    req.userId = payload.sub;
    req.organizationId = payload.organizationId;
    req.isAccountOwner = payload.isAccountOwner;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = { signToken, requireAuth };
