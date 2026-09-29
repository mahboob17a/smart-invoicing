// Fills any saved template — builder or uploaded + mapped — with invoice
// values (Design Document §7.3). Used for the sample download (Phase 3) and
// for real invoices (Phase 4), so both paths produce identical documents.
const db = require("../../db");
const storage = require("../storage");
const fields = require("./fields");
const builder = require("./builder");
const uploaded = require("./uploaded");

const currentFile = (t) =>
  db.get("SELECT * FROM template_files WHERE template_id = ? AND version = ?", t.id, t.current_version);

const mappingsOf = async (t) =>
  (await db.all("SELECT token_name, is_line_item, system_field FROM template_field_mappings WHERE template_id = ?", t.id))
    .map((m) => ({ token: m.token_name, isItem: !!m.is_line_item, field: m.system_field }));

/** Mapping to use: the saved one, or suggestions while the template is still being mapped (sample only). */
async function effectiveMappings(t, file) {
  const saved = await mappingsOf(t);
  if (saved.length) return saved;
  return JSON.parse(file.tokens_json).map((tk) => ({ token: tk.name, isItem: tk.isItem, field: fields.suggest(tk.name, tk.isItem) }));
}

/** Returns { docx: Buffer, version } for a template row filled with `values`. */
async function renderDocx(t, values, logoUrl) {
  if (t.source === "builder") {
    const logo = await builder.loadLogo(logoUrl);
    return { docx: await builder.render(JSON.parse(t.config_json), values, logo), version: t.current_version, logo };
  }
  const file = await currentFile(t);
  if (!file) throw Object.assign(new Error("This template has no uploaded file"), { name: "TemplateError" });
  const docx = uploaded.render(await storage.read(file.storage_key), { mappings: await effectiveMappings(t, file), loopName: file.loop_name, values });
  return { docx, version: file.version, logo: null };
}

module.exports = { renderDocx, currentFile, mappingsOf };
