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
 * return extra column values to store (e.g. a derived field). toApi and validate may be async.
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
    db.get(`SELECT * FROM ${table} WHERE id = ? AND organization_id = ?`, id, orgId);

  router.get("/", handle(async (req, res) => {
    const rows = await db.all(`SELECT * FROM ${table} WHERE organization_id = ? ORDER BY created_at ASC`, req.organizationId);
    res.json(await Promise.all(rows.map((r) => toApi(r, req))));
  }));

  router.get("/:id", handle(async (req, res) => {
    const row = await getOwned(req.params.id, req.organizationId);
    if (!row) throw notFound(`${label} not found`);
    res.json(await toApi(row, req));
  }));

  router.post("/", handle(async (req, res) => {
    const values = readBody(req.body || {}, { partial: false });
    if (opts.validate) Object.assign(values, (await opts.validate(values, { req, id: null })) || {});
    const id = randomUUID();
    const cols = ["id", "organization_id", ...Object.keys(values)];
    await db.run(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, id, req.organizationId, ...Object.values(values)
    );
    res.status(201).json(await toApi(await getOwned(id, req.organizationId), req));
  }));

  router.put("/:id", handle(async (req, res) => {
    const existing = await getOwned(req.params.id, req.organizationId);
    if (!existing) throw notFound(`${label} not found`);
    const values = readBody(req.body || {}, { partial: true });
    if (opts.validate) Object.assign(values, (await opts.validate({ ...existing, ...values }, { req, id: existing.id })) || {});
    const keys = Object.keys(values);
    if (keys.length) {
      await db.run(
        `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = utc_now()
         WHERE id = ? AND organization_id = ?`,
        ...Object.values(values), existing.id, req.organizationId
      );
    }
    res.json(await toApi(await getOwned(existing.id, req.organizationId), req));
  }));

  router.delete("/:id", handle(async (req, res) => {
    const info = await db.run(`DELETE FROM ${table} WHERE id = ? AND organization_id = ?`, req.params.id, req.organizationId);
    if (info.changes === 0) throw notFound(`${label} not found`);
    res.status(204).send();
  }));

  return router;
}

module.exports = makeListResource;
