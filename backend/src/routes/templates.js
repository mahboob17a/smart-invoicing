const express = require("express");
const { randomUUID } = require("crypto");
const multer = require("multer");
const db = require("../db");
const storage = require("../lib/storage");
const { badRequest, notFound, handle } = require("../lib/http");
const fields = require("../lib/templates/fields");
const builder = require("../lib/templates/builder");
const uploaded = require("../lib/templates/uploaded");
const { sampleValues } = require("../lib/templates/values");
const { exampleDocx } = require("../lib/templates/example");
const { renderDocx, currentFile, mappingsOf } = require("../lib/templates/render");

// Invoice templates (Design Document v5.1 §6.5, §7; Roadmap Phase 3)
// GET    /api/templates                    list
// GET    /api/templates/fields             system fields for the mapping form
// GET    /api/templates/sample-values      values for the builder's live preview
// GET    /api/templates/example.docx       a Word template with placeholders to start from
// POST   /api/templates                    create a builder template { name, config }
// POST   /api/templates/upload             upload a .docx (multipart "file", optional "name")
// GET    /api/templates/:id                details, tokens, mapping, warnings, versions
// PUT    /api/templates/:id                rename / update builder config
// POST   /api/templates/:id/upload         upload a new version; mappings carried forward by token name
// PUT    /api/templates/:id/mapping        save the field mapping { mappings: [{ token, isItem, field|null }] }
// POST   /api/templates/:id/default        make this the default template
// GET    /api/templates/:id/sample.docx    the template filled with sample data
// DELETE /api/templates/:id

const router = express.Router();
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: uploaded.MAX_BYTES, files: 1 },
  fileFilter(req, file, cb) {
    const ok = file.mimetype === DOCX || /\.docx$/i.test(file.originalname || "") || file.mimetype === "application/octet-stream";
    if (!ok) return cb(badRequest("Templates must be Word files (.docx). Excel templates are planned for a later release."));
    cb(null, true);
  },
});

async function get(id, orgId) {
  const t = await db.get("SELECT * FROM templates WHERE id = ? AND organization_id = ?", id, orgId);
  if (!t) throw notFound("Template not found");
  return t;
}

async function summary(t) {
  const file = t.source === "uploaded" ? await currentFile(t) : null;
  return {
    id: t.id,
    name: t.name,
    source: t.source,
    isDefault: !!t.is_default,
    status: t.status,
    version: t.current_version,
    fileName: file?.original_filename || null,
    tokenCount: file ? JSON.parse(file.tokens_json).length : null,
    config: t.source === "builder" ? JSON.parse(t.config_json) : null,
    updatedAt: t.updated_at || t.created_at,
  };
}

async function detail(t) {
  const s = await summary(t);
  if (t.source === "builder") return s;
  const file = await currentFile(t);
  const tokens = JSON.parse(file.tokens_json);
  const saved = await mappingsOf(t);
  const byKey = new Map(saved.map((m) => [`${m.isItem ? 1 : 0}:${m.token}`, m]));
  const mappings = tokens.map((tk) => {
    const m = byKey.get(`${tk.isItem ? 1 : 0}:${tk.name}`);
    return { token: tk.name, isItem: tk.isItem, field: m ? m.field : fields.suggest(tk.name, tk.isItem), saved: !!m, suggested: !m };
  });
  const versions = (await db.all("SELECT version, original_filename, uploaded_at FROM template_files WHERE template_id = ? ORDER BY version DESC", t.id))
    .map((v) => ({ version: v.version, fileName: v.original_filename, uploadedAt: v.uploaded_at }));
  return { ...s, loopName: file.loop_name, mappings, warnings: fields.mappingWarnings(mappings), versions };
}

async function ensureDefault(orgId) {
  const has = await db.get("SELECT id FROM templates WHERE organization_id = ? AND is_default = 1", orgId);
  if (has) return;
  const first = await db.get("SELECT id FROM templates WHERE organization_id = ? AND status = 'ready' ORDER BY created_at LIMIT 1", orgId);
  if (first) await db.run("UPDATE templates SET is_default = 1 WHERE id = ?", first.id);
}

const insertMapping = (templateId, token, isItem, field) =>
  db.run("INSERT INTO template_field_mappings (id, template_id, token_name, is_line_item, system_field) VALUES (?, ?, ?, ?, ?)",
    randomUUID(), templateId, token, isItem ? 1 : 0, field);

function cleanName(name, fallback) {
  const n = typeof name === "string" ? name.trim() : "";
  if (n.length > 80) throw badRequest("Template name must be 80 characters or fewer");
  return n || fallback;
}

router.get("/", handle(async (req, res) => {
  const rows = await db.all("SELECT * FROM templates WHERE organization_id = ? ORDER BY is_default DESC, created_at ASC", req.organizationId);
  res.json(await Promise.all(rows.map(summary)));
}));

router.get("/fields", handle(async (req, res) => {
  res.json({ header: fields.HEADER_FIELDS, items: fields.ITEM_FIELDS, builderDefaults: builder.DEFAULT_CONFIG, builderColumns: builder.COLUMN_ORDER });
}));

// Values used by the app's live builder preview (the organization's own letterhead, client, rule and next number).
router.get("/sample-values", handle(async (req, res) => {
  const { values, logo } = await sampleValues(req.organizationId);
  res.json({ values, logoUrl: logo });
}));

router.get("/example.docx", handle(async (req, res) => {
  const buf = await exampleDocx();
  res.set("Content-Disposition", 'attachment; filename="Smart_Invoicing_Example_Template.docx"');
  res.type(DOCX).send(buf);
}));

router.post("/", handle(async (req, res) => {
  const { config, errors } = builder.validateConfig((req.body || {}).config);
  if (errors.length) throw badRequest(errors[0], errors);
  const id = randomUUID();
  await db.run("INSERT INTO templates (id, organization_id, name, source, config_json, status, created_by) VALUES (?, ?, ?, 'builder', ?, 'ready', ?)", id, req.organizationId, cleanName(req.body?.name, "My invoice template"), JSON.stringify(config), req.userId);
  await ensureDefault(req.organizationId);
  res.status(201).json(await detail(await get(id, req.organizationId)));
}));

async function storeVersion(t, file, orgId, userId) {
  const scanned = uploaded.scan(file.buffer); // throws TemplateError with a readable message
  const key = await storage.save(orgId, file.buffer, "docx", "templates");
  await db.run(`INSERT INTO template_files (id, template_id, organization_id, version, storage_key, original_filename, size_bytes, tokens_json, loop_name, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, randomUUID(), t.id, orgId, t.current_version, key, file.originalname || "template.docx", file.size, JSON.stringify(scanned.tokens), scanned.loopName, userId);
  return scanned;
}

const asBadRequest = (fn) => async (req, res, next) => {
  try {
    return await fn(req, res, next);
  } catch (e) {
    if (e instanceof uploaded.TemplateError) return next(badRequest(e.message));
    return next(e);
  }
};

router.post("/upload", upload.single("file"), handle(asBadRequest(async (req, res) => {
  if (!req.file) throw badRequest('Attach the Word file as multipart field "file"');
  const id = randomUUID();
  const fallback = (req.file.originalname || "Uploaded template").replace(/\.docx$/i, "");
  let result;
  await db.tx(async () => {
    await db.run("INSERT INTO templates (id, organization_id, name, source, status, created_by) VALUES (?, ?, ?, 'uploaded', 'needs_mapping', ?)", id, req.organizationId, cleanName(req.body?.name, fallback), req.userId);
    result = await storeVersion(await get(id, req.organizationId), req.file, req.organizationId, req.userId);
  });
  res.status(201).json({ ...(await detail(await get(id, req.organizationId))), found: { tokens: result.tokens.length, itemBlock: !!result.loopName } });
})));

router.get("/:id", handle(async (req, res) => res.json(await detail(await get(req.params.id, req.organizationId)))));

router.put("/:id", handle(async (req, res) => {
  const t = await get(req.params.id, req.organizationId);
  const b = req.body || {};
  const name = b.name !== undefined ? cleanName(b.name, t.name) : t.name;
  let configJson = t.config_json;
  if (b.config !== undefined) {
    if (t.source !== "builder") throw badRequest("Only builder templates have layout settings. Upload a new version to change an uploaded template.");
    const { config, errors } = builder.validateConfig(b.config);
    if (errors.length) throw badRequest(errors[0], errors);
    configJson = JSON.stringify(config);
  }
  await db.run("UPDATE templates SET name = ?, config_json = ?, updated_at = utc_now() WHERE id = ?", name, configJson, t.id);
  res.json(await detail(await get(t.id, req.organizationId)));
}));

router.post("/:id/upload", upload.single("file"), handle(asBadRequest(async (req, res) => {
  const t = await get(req.params.id, req.organizationId);
  if (t.source !== "uploaded") throw badRequest("This is a builder template; there is no file to replace.");
  if (!req.file) throw badRequest('Attach the Word file as multipart field "file"');
  const previous = await mappingsOf(t);
  let carried = 0;
  let fresh = 0;
  await db.tx(async () => {
    const next = { ...t, current_version: t.current_version + 1 };
    const scanned = await storeVersion(next, req.file, req.organizationId, req.userId);
    // §7.4: keep mappings wherever the token name still exists; new tokens need mapping.
    const keep = new Map(previous.map((m) => [`${m.isItem ? 1 : 0}:${m.token}`, m]));
    await db.run("DELETE FROM template_field_mappings WHERE template_id = ?", t.id);
    for (const tk of scanned.tokens) {
      const m = keep.get(`${tk.isItem ? 1 : 0}:${tk.name}`);
      if (m) { await insertMapping(t.id, tk.name, tk.isItem, m.field); carried++; } else fresh++;
    }
    await db.run("UPDATE templates SET current_version = ?, status = ?, updated_at = utc_now() WHERE id = ?", next.current_version, fresh ? "needs_mapping" : "ready", t.id);
  });
  res.status(201).json({ ...(await detail(await get(t.id, req.organizationId))), carriedOver: carried, newTokens: fresh });
})));

router.put("/:id/mapping", handle(async (req, res) => {
  const t = await get(req.params.id, req.organizationId);
  if (t.source !== "uploaded") throw badRequest("Only uploaded templates have a field mapping");
  const tokens = JSON.parse((await currentFile(t)).tokens_json);
  const list = Array.isArray(req.body?.mappings) ? req.body.mappings : null;
  if (!list) throw badRequest("mappings must be a list of { token, isItem, field }");
  const known = new Map(tokens.map((tk) => [`${tk.isItem ? 1 : 0}:${tk.name}`, tk]));
  const clean = [];
  for (const m of list) {
    const tk = known.get(`${m.isItem ? 1 : 0}:${m.token}`);
    if (!tk) throw badRequest(`{{${m.token}}} is not in this template`);
    const field = m.field || null;
    if (field && !fields.validFields(tk.isItem).has(field)) {
      throw badRequest(tk.isItem ? `{{${m.token}}} is inside the item row, so it must be a line-item field` : `"${field}" is not a field that can go outside the item row`);
    }
    clean.push({ token: tk.name, isItem: tk.isItem, field });
  }
  const missing = tokens.filter((tk) => !clean.some((m) => m.token === tk.name && m.isItem === tk.isItem));
  if (missing.length) throw badRequest(`Choose a field (or "Leave as written") for {{${missing[0].name}}}`);
  await db.tx(async () => {
    await db.run("DELETE FROM template_field_mappings WHERE template_id = ?", t.id);
    for (const m of clean) await insertMapping(t.id, m.token, m.isItem, m.field);
    await db.run("UPDATE templates SET status = 'ready', updated_at = utc_now() WHERE id = ?", t.id);
  });
  await ensureDefault(req.organizationId);
  res.json(await detail(await get(t.id, req.organizationId)));
}));

router.post("/:id/default", handle(async (req, res) => {
  const t = await get(req.params.id, req.organizationId);
  if (t.status !== "ready") throw badRequest("Finish mapping this template before making it the default");
  await db.tx(async () => {
    await db.run("UPDATE templates SET is_default = 0 WHERE organization_id = ?", req.organizationId);
    await db.run("UPDATE templates SET is_default = 1 WHERE id = ?", t.id);
  });
  res.json(await detail(await get(t.id, req.organizationId)));
}));

router.get("/:id/sample.docx", handle(asBadRequest(async (req, res) => {
  const t = await get(req.params.id, req.organizationId);
  const { values, logo } = await sampleValues(req.organizationId);
  const { docx } = await renderDocx(t, values, logo);
  const safe = t.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "template";
  res.set("Content-Disposition", `attachment; filename="${safe}_sample.docx"`);
  res.type(DOCX).send(docx);
})));

router.delete("/:id", handle(async (req, res) => {
  const t = await get(req.params.id, req.organizationId);
  const files = await db.all("SELECT storage_key FROM template_files WHERE template_id = ?", t.id);
  await db.run("DELETE FROM templates WHERE id = ?", t.id);
  await Promise.all(files.map((f) => storage.remove(f.storage_key)));
  await ensureDefault(req.organizationId);
  res.status(204).send();
}));

module.exports = router;
