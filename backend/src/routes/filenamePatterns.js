const express = require("express");
const { randomUUID } = require("crypto");
const db = require("../db");
const { badRequest, handle } = require("../lib/http");
const { PLACEHOLDERS, DEFAULT_PATTERN, validatePattern, renderFilename, SAMPLE_VALUES } = require("../lib/filename");

// Filename Convention (Section 6.6). One pattern per organization.
// GET  /api/filename-patterns          -> current pattern (or the default), placeholders, preview
// PUT  /api/filename-patterns          -> save
// POST /api/filename-patterns/preview  -> preview an unsaved pattern
const router = express.Router();

const shape = (pattern, saved) => ({
  pattern,
  isSaved: saved,
  placeholders: PLACEHOLDERS,
  defaultPattern: DEFAULT_PATTERN,
  preview: renderFilename(pattern, SAMPLE_VALUES),
});

router.get("/", handle((req, res) => {
  const row = db.prepare("SELECT * FROM filename_patterns WHERE organization_id = ?").get(req.organizationId);
  res.json(shape(row ? row.pattern_string : DEFAULT_PATTERN, !!row));
}));

router.post("/preview", handle((req, res) => {
  const pattern = String((req.body || {}).pattern || "");
  const errors = validatePattern(pattern);
  res.json({ ...shape(pattern, false), errors });
}));

router.put("/", handle((req, res) => {
  const pattern = String((req.body || {}).pattern || "").trim();
  const errors = validatePattern(pattern);
  if (errors.length) throw badRequest(errors[0], errors);
  const existing = db.prepare("SELECT id FROM filename_patterns WHERE organization_id = ?").get(req.organizationId);
  if (existing) {
    db.prepare("UPDATE filename_patterns SET pattern_string = ?, updated_at = datetime('now') WHERE id = ?").run(pattern, existing.id);
  } else {
    db.prepare("INSERT INTO filename_patterns (id, organization_id, pattern_string) VALUES (?, ?, ?)").run(
      randomUUID(), req.organizationId, pattern
    );
  }
  res.json(shape(pattern, true));
}));

module.exports = router;
