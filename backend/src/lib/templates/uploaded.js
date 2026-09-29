// Customer-uploaded Word templates (Design Document v5.1 §7).
// Placeholders use {{Token}}; the item table row is wrapped in
// {{#items}} … {{/items}} (any loop name works). Unmapped tokens are left
// exactly as written, so the customer's own text is never disturbed.
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const InspectModule = require("docxtemplater/js/inspect-module");

const OPTIONS = { delimiters: { start: "{{", end: "}}" }, paragraphLoop: true, linebreaks: true };
const MAX_BYTES = 5 * 1024 * 1024;

class TemplateError extends Error {
  constructor(message) {
    super(message);
    this.name = "TemplateError";
  }
}

function explain(e) {
  const errs = e?.properties?.errors || [e];
  const msgs = errs.slice(0, 5).map((x) => {
    const p = x.properties || {};
    const tag = p.xtag || p.context || "";
    switch (p.id) {
      case "unopened_tag": return `A "}}" has no matching "{{" near "${tag}".`;
      case "unclosed_tag": return `"{{${tag}" is missing its closing "}}".`;
      case "unclosed_loop": return `The block {{#${tag}}} has no matching {{/${tag}}}.`;
      case "unopened_loop": return `{{/${tag}}} has no matching {{#${tag}}} before it.`;
      case "closing_tag_does_not_match_opening_tag": return `{{#${p.openingtag}}} is closed with {{/${p.closingtag}}}; the names must match.`;
      case "duplicate_open_tag": return `"{{{{" appears near "${tag}" — use exactly two braces.`;
      case "duplicate_close_tag": return `"}}}}" appears near "${tag}" — use exactly two braces.`;
      default: return x.message || "The file's placeholders could not be read.";
    }
  });
  return msgs.join(" ");
}

function open(buffer) {
  if (!buffer || buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw new TemplateError("This isn't a Word (.docx) file. Save it as .docx in Word and upload again.");
  if (buffer.length > MAX_BYTES) throw new TemplateError("Template files must be 5 MB or smaller.");
  try {
    const zip = new PizZip(buffer);
    if (!zip.file("word/document.xml")) throw new Error("no document");
    return zip;
  } catch {
    throw new TemplateError("This Word file couldn't be opened. It may be damaged or password-protected.");
  }
}

/** Lists the {{tokens}} in a .docx. Returns { tokens: [{ name, isItem }], loopName }. */
function scan(buffer) {
  const zip = open(buffer);
  const inspect = new InspectModule();
  try {
    new Docxtemplater(zip, { ...OPTIONS, modules: [inspect] });
  } catch (e) {
    throw new TemplateError(explain(e));
  }
  const parts = inspect.getAllStructuredTags();
  const tokens = [];
  const seen = new Set();
  let loopName = null;
  const add = (name, isItem) => {
    const k = `${isItem ? 1 : 0}:${name}`;
    if (!seen.has(k)) { seen.add(k); tokens.push({ name, isItem }); }
  };
  const walk = (list, inLoop) => {
    for (const p of list) {
      if (p.type !== "placeholder") continue;
      if (p.module === "loop") {
        if (inLoop) throw new TemplateError(`The block {{#${p.value}}} is inside another block. Use a single {{#items}} … {{/items}} row for line items.`);
        if (loopName && loopName !== p.value) throw new TemplateError(`Found two item blocks ({{#${loopName}}} and {{#${p.value}}}). Use one block for the line-item row.`);
        loopName = p.value;
        walk(p.subparsed || [], true);
      } else if (!p.module) {
        add(p.value.trim(), inLoop);
      }
    }
  };
  walk(parts, false);
  if (!tokens.length) throw new TemplateError("No {{placeholders}} were found. Add tokens such as {{InvoiceNo}} and {{GrandTotal}} where values should go, then upload again.");
  return { tokens, loopName };
}

/**
 * Fills an uploaded template.
 * mappings: [{ token, isItem, field }]  (field null = leave as written)
 * values: output of computeValues()
 */
function render(buffer, { mappings, loopName, values }) {
  const zip = open(buffer);
  const header = {};
  const itemMap = {};
  for (const m of mappings) {
    if (!m.field) continue;
    if (m.isItem) itemMap[m.token] = m.field;
    else header[m.token] = values[m.field] ?? "";
  }
  if (loopName) {
    header[loopName] = (values.items || []).map((it) => Object.fromEntries(Object.entries(itemMap).map(([tok, f]) => [tok, it[f] ?? ""])));
  }
  let doc;
  try {
    doc = new Docxtemplater(zip, {
      ...OPTIONS,
      // Unmapped tokens stay exactly as the customer wrote them (§7.2).
      nullGetter(part) {
        return part.module ? "" : `{{${part.value}}}`;
      },
    });
    doc.render(header);
  } catch (e) {
    throw new TemplateError(explain(e));
  }
  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
}

module.exports = { scan, render, TemplateError, MAX_BYTES };
