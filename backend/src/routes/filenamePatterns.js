const express = require("express");
const { randomUUID } = require("crypto");
const db = require("../db");
const {
  PLACEHOLDERS,
  DEFAULT_PATTERN,
  validatePattern,
  renderFilename,
  sampleValues,
} = require("../filenamePattern");

const router = express.Router();

function toApi(row) {
  return {
    id: row.id,
    patternString: row.pattern_string,
    preview: renderFilename(row.pattern_string, sampleValues()),
    updatedAt: row.updated_at,
  };
}

// GET /api/filename-patterns/placeholders
// Everything the form needs to offer placeholder chips and a live preview.
router.get("/placeholders", (req, res) => {
  res.json({ placeholders: PLACEHOLDERS, defaultPattern: DEFAULT_PATTERN });
});

// GET /api/filename-patterns — the organization's saved pattern, or null.
router.get("/", (req, res) => {
  const row = db
    .prepare("SELECT * FROM filename_patterns WHERE organization_id = ?")
    .get(req.organizationId);
  res.json(row ? toApi(row) : null);
});

// POST /api/filename-patterns  (create on first save, update after)
// One pattern per organization, like Company Profile.
router.post("/", (req, res) => {
  const { patternString } = req.body || {};
  const error = validatePattern(patternString);
  if (error) return res.status(400).json({ error });

  const pattern = patternString.trim();
  const existing = db
    .prepare("SELECT id FROM filename_patterns WHERE organization_id = ?")
    .get(req.organizationId);

  if (existing) {
    db.prepare(
      `UPDATE filename_patterns SET pattern_string = ?, updated_at = datetime('now')
       WHERE organization_id = ?`
    ).run(pattern, req.organizationId);
  } else {
    db.prepare(
      "INSERT INTO filename_patterns (id, organization_id, pattern_string) VALUES (?, ?, ?)"
    ).run(randomUUID(), req.organizationId, pattern);
  }

  const saved = db
    .prepare("SELECT * FROM filename_patterns WHERE organization_id = ?")
    .get(req.organizationId);
  res.status(existing ? 200 : 201).json(toApi(saved));
});

module.exports = router;
