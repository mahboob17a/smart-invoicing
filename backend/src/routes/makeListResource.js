const express = require("express");
const { randomUUID } = require("crypto");
const db = require("../db");
const { badRequest, notFound, handle } = require("../lib/http");

/**
 * REST router (list / get / create / update / delete) for "an organization
 * has many of these" tables: Issuing Identities, Recipients, Conversion Rule
 * Profiles, Report Templates. Every query is scoped by req.organizationId.
 *
 * Field spec: { apiField, dbColumn, required?, type?: 'string'|'number'|'int'|'bool'|'json',
 *               min?, max?, default?, maxLength?, transform?(value) }
 * opts.validate(values, { req, id }) may throw badRequest for cross-field rules, and may
 * return extra column values to store (e.g. a derived field).
 */
function makeListResource(table, fields, toApi, opts = {}) {
  const router = express.Router();
  const label = opts.label || "Item";

  function coerce(f, raw) {
    if (raw === undefined) return undefined;
    if (raw === null || raw === "") {
      if (f.required) throw badRequest(`${f.apiField} is required`);
      return null;
    }
    let v = raw;
    switch (f.type || "string") {
      case "string":
        if (typeof v !== "string") throw badRequest(`${f.apiField} must be text`);
        v = v.trim();
        if (f.maxLength && v.length > f.maxLength)
          throw badRequest(`${f.apiField} must be ${f.maxLength} characters or fewer`);
        break;
      case "number":
      case "int":
        v = typeof v === "string" ? Number(v) : v;
        if (typeof v !== "number" || Number.isNaN(v)) throw badRequest(`${f.apiField} must be a number`);
        if (f.type === "int" && !Number.isInteger(v)) throw badRequest(`${f.apiField} must be a whole number`);
        if (f.min !== undefined && v < f.min) throw badRequest(`${f.apiField} must be at least ${f.min}`);
        if (f.max !== undefined && v > f.max) throw badRequest(`${f.apiField} must be at most ${f.max}`);
        break;
      case "bool":
        v = v ? 1 : 0;
        break;
      case "json":
        v = JSON.stringify(v);
        break;
    }
    return f.transform ? f.transform(v) : v;
  }

  function readBody(body, { partial }) {
    const values = {};
    for (const f of fields) {
      let v = coerce(f, body[f.apiField]);
      if (v === undefined && !partial) {
        if (f.required) throw badRequest(`${f.apiField} is required`);
        v = f.default !== undefined ? f.default : null;
      }
      if (v !== undefined) values[f.dbColumn] = v;
    }
    return values;
  }

  const getOwned = (id, orgId) =>
    db.prepare(`SELECT * FROM ${table} WHERE id = ? AND organization_id = ?`).get(id, orgId);

  router.get("/", handle((req, res) => {
    const rows = db
      .prepare(`SELECT * FROM ${table} WHERE organization_id = ? ORDER BY created_at ASC`)
      .all(req.organizationId);
    res.json(rows.map((r) => toApi(r, req)));
  }));

  router.get("/:id", handle((req, res) => {
    const row = getOwned(req.params.id, req.organizationId);
    if (!row) throw notFound(`${label} not found`);
    res.json(toApi(row, req));
  }));

  router.post("/", handle((req, res) => {
    const values = readBody(req.body || {}, { partial: false });
    if (opts.validate) Object.assign(values, opts.validate(values, { req, id: null }) || {});
    const id = randomUUID();
    const cols = ["id", "organization_id", ...Object.keys(values)];
    db.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).run(
      id, req.organizationId, ...Object.values(values)
    );
    res.status(201).json(toApi(getOwned(id, req.organizationId), req));
  }));

  router.put("/:id", handle((req, res) => {
    const existing = getOwned(req.params.id, req.organizationId);
    if (!existing) throw notFound(`${label} not found`);
    const values = readBody(req.body || {}, { partial: true });
    if (opts.validate) Object.assign(values, opts.validate({ ...existing, ...values }, { req, id: existing.id }) || {});
    const keys = Object.keys(values);
    if (keys.length) {
      db.prepare(
        `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = datetime('now')
         WHERE id = ? AND organization_id = ?`
      ).run(...Object.values(values), existing.id, req.organizationId);
    }
    res.json(toApi(getOwned(existing.id, req.organizationId), req));
  }));

  router.delete("/:id", handle((req, res) => {
    const info = db
      .prepare(`DELETE FROM ${table} WHERE id = ? AND organization_id = ?`)
      .run(req.params.id, req.organizationId);
    if (info.changes === 0) throw notFound(`${label} not found`);
    res.status(204).send();
  }));

  return router;
}

module.exports = makeListResource;
