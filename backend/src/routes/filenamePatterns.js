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

router.get("/", handle(async (req, res) => {
  const row = await db.get("SELECT * FROM filename_patterns WHERE organization_id = ?", req.organizationId);
  res.json(shape(row ? row.pattern_string : DEFAULT_PATTERN, !!row));
}));

router.post("/preview", handle(async (req, res) => {
  const pattern = String((req.body || {}).pattern || "");
  const errors = validatePattern(pattern);
  res.json({ ...shape(pattern, false), errors });
}));

router.put("/", handle(async (req, res) => {
  const pattern = String((req.body || {}).pattern || "").trim();
  const errors = validatePattern(pattern);
  if (errors.length) throw badRequest(errors[0], errors);
  const existing = await db.get("SELECT id FROM filename_patterns WHERE organization_id = ?", req.organizationId);
  if (existing) {
    await db.run("UPDATE filename_patterns SET pattern_string = ?, updated_at = utc_now() WHERE id = ?", pattern, existing.id);
  } else {
    await db.run("INSERT INTO filename_patterns (id, organization_id, pattern_string) VALUES (?, ?, ?)", randomUUID(), req.organizationId, pattern
    );
  }
  res.json(shape(pattern, true));
}));

module.exports = router;
