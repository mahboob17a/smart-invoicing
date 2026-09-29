// PDF rendering (Roadmap Phase 4, Week 9).
//
// The Word file is the master document. Its PDF is made by LibreOffice when
// it is installed (exact copy of the .docx, for builder and uploaded templates
// alike). Without LibreOffice, builder templates still get a PDF from the
// built-in renderer (builderPdf.js, same layout); uploaded templates then offer
// the Word file only, with a message saying how to turn PDFs on.
//
// PDF_ENGINE = auto (default) | libreoffice | builtin | off
// SOFFICE_PATH = full path to soffice(.exe) if it is not found automatically.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { pathToFileURL } = require("url");
const builderPdf = require("./builderPdf");

const WINDOWS_PATHS = [
  "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
  "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
];
const MAC_PATH = "/Applications/LibreOffice.app/Contents/MacOS/soffice";

let cached;
function findSoffice() {
  if (cached !== undefined) return cached;
  const candidates = [];
  if (process.env.SOFFICE_PATH) candidates.push(process.env.SOFFICE_PATH);
  const exe = process.platform === "win32" ? ["soffice.exe", "soffice.com"] : ["soffice", "libreoffice"];
  for (const dir of (process.env.PATH || "").split(path.delimiter)) for (const e of exe) if (dir) candidates.push(path.join(dir, e));
  if (process.platform === "win32") candidates.push(...WINDOWS_PATHS);
  if (process.platform === "darwin") candidates.push(MAC_PATH);
  cached = candidates.find((c) => { try { return fs.statSync(c).isFile(); } catch { return false; } }) || null;
  return cached;
}

const engine = () => (process.env.PDF_ENGINE || "auto").toLowerCase();

/** What the server can do, for the app and the startup message. */
function capabilities() {
  const e = engine();
  const soffice = e === "auto" || e === "libreoffice" ? findSoffice() : null;
  return {
    engine: e === "off" ? "off" : soffice ? "libreoffice" : e === "libreoffice" ? "missing" : "builtin",
    uploadedTemplates: !!soffice,
    builderTemplates: e !== "off" && (!!soffice || e !== "libreoffice"),
  };
}

// LibreOffice runs one conversion at a time; requests queue behind each other.
let queue = Promise.resolve();
function libreOffice(docx) {
  const run = async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "si-pdf-"));
    try {
      const input = path.join(dir, "invoice.docx");
      fs.writeFileSync(input, docx);
      const profile = pathToFileURL(path.join(os.tmpdir(), "si-lo-profile")).href;
      await new Promise((resolve, reject) => {
        execFile(findSoffice(), [`-env:UserInstallation=${profile}`, "--headless", "--norestore", "--convert-to", "pdf", "--outdir", dir, input],
          { timeout: 90_000, windowsHide: true }, (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve()));
      });
      const out = path.join(dir, "invoice.pdf");
      if (!fs.existsSync(out)) throw new Error("LibreOffice did not produce a PDF");
      return fs.readFileSync(out);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

const NO_PDF_UPLOADED =
  "PDF for uploaded Word templates needs LibreOffice (free) on the server. Install it from libreoffice.org and restart the backend. The Word file is ready now.";

/**
 * Makes the PDF for a generated invoice.
 * Returns { pdf: Buffer|null, error: string|null } — never throws, so a PDF
 * problem cannot undo an invoice whose Word file was made.
 */
async function toPdf({ docx, template, values, logo }) {
  const caps = capabilities();
  try {
    if (caps.engine === "off") return { pdf: null, error: "PDF output is turned off on this server (PDF_ENGINE=off)." };
    if (caps.engine === "libreoffice") return { pdf: await libreOffice(docx), error: null };
    if (template.source === "builder" && caps.builderTemplates) {
      return { pdf: await builderPdf.render(JSON.parse(template.config_json), values, logo), error: null };
    }
    if (caps.engine === "missing") return { pdf: null, error: "LibreOffice was not found. Set SOFFICE_PATH in backend/.env or install LibreOffice." };
    return { pdf: null, error: NO_PDF_UPLOADED };
  } catch (e) {
    console.error("PDF rendering failed:", e.message);
    return { pdf: null, error: "The PDF could not be made. The Word file is ready; try Regenerate later." };
  }
}

module.exports = { toPdf, capabilities, findSoffice, _reset: () => { cached = undefined; } };
