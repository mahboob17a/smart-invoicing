const express = require("express");
const { randomUUID } = require("crypto");
const db = require("../db");

/**
 * Builds a small REST router (list / create / delete) for a table that
 * holds "one organization has many of these" records — Issuing Identities,
 * Recipients, and Conversion Rule Profiles all fit this shape, so this one
 * factory backs all three routers instead of hand-writing the same
 * create/list/delete logic three times.
 *
 * @param {string} table - underlying table name
 * @param {{apiField: string, dbColumn: string, required?: boolean}[]} fields
 * @param {(row: object) => object} toApi - maps a DB row to the API shape
 */
function makeListResource(table, fields, toApi) {
  const router = express.Router();

  router.get("/", (req, res) => {
    const rows = db
      .prepare(`SELECT * FROM ${table} WHERE organization_id = ? ORDER BY created_at DESC`)
      .all(req.organizationId);
    res.json(rows.map(toApi));
  });

  router.post("/", (req, res) => {
    const body = req.body || {};
    for (const f of fields) {
      if (f.required && !body[f.apiField]) {
        return res.status(400).json({ error: `${f.apiField} is required` });
      }
    }

    const id = randomUUID();
    const columns = ["id", "organization_id", ...fields.map((f) => f.dbColumn)];
    const placeholders = columns.map(() => "?").join(", ");
    const values = [id, req.organizationId, ...fields.map((f) => body[f.apiField] ?? null)];

    db.prepare(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`
    ).run(...values);

    const saved = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    res.status(201).json(toApi(saved));
  });

  router.delete("/:id", (req, res) => {
    const info = db
      .prepare(`DELETE FROM ${table} WHERE id = ? AND organization_id = ?`)
      .run(req.params.id, req.organizationId);
    if (info.changes === 0) {
      return res.status(404).json({ error: "Not found" });
    }
    res.status(204).send();
  });

  return router;
}

module.exports = makeListResource;
