const express = require("express");
const { randomUUID } = require("crypto");
const db = require("../db");

const router = express.Router();

function toApi(row) {
  return {
    id: row.id,
    name: row.name,
    markupPct: row.markup_pct,
    taxPct: row.tax_pct,
    taxLabel: row.tax_label,
    currencyCode: row.currency_code,
    createdAt: row.created_at,
  };
}

router.get("/", (req, res) => {
  const rows = db
    .prepare(
      "SELECT * FROM conversion_rule_profiles WHERE organization_id = ? ORDER BY created_at DESC"
    )
    .all(req.organizationId);
  res.json(rows.map(toApi));
});

router.post("/", (req, res) => {
  const { name, markupPct, taxPct, taxLabel, currencyCode } = req.body || {};
  if (!name || markupPct === undefined || taxPct === undefined) {
    return res.status(400).json({ error: "name, markupPct, and taxPct are required" });
  }
  if (typeof markupPct !== "number" || typeof taxPct !== "number") {
    return res.status(400).json({ error: "markupPct and taxPct must be numbers (e.g. 30 for 30%)" });
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO conversion_rule_profiles
      (id, organization_id, name, markup_pct, tax_pct, tax_label, currency_code)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, req.organizationId, name, markupPct, taxPct, taxLabel || "VAT", currencyCode || "OMR");

  const saved = db.prepare("SELECT * FROM conversion_rule_profiles WHERE id = ?").get(id);
  res.status(201).json(toApi(saved));
});

router.delete("/:id", (req, res) => {
  const info = db
    .prepare("DELETE FROM conversion_rule_profiles WHERE id = ? AND organization_id = ?")
    .run(req.params.id, req.organizationId);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.status(204).send();
});

module.exports = router;
