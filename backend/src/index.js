require("dotenv").config();

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is not set. Copy .env.example to .env and set a long random value.");
  process.exit(1);
}

const db = require("./db");
const app = require("./app");
const storage = require("./lib/storage");
const { recoverInterrupted } = require("./lib/bills");
const { providerName } = require("./lib/extraction");
const invoices = require("./lib/invoices");
const pdf = require("./lib/documents/pdf");

(async () => {
  try {
    await db.ready;
    await storage.ensureReady();
  } catch (e) {
    console.error("Could not start:", e.message);
    process.exit(1);
  }
  await recoverInterrupted();
  await invoices.recoverInterrupted();

  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`Smart Invoicing backend listening on http://localhost:${PORT}`);
    console.log(`Database: ${db.kind() === "postgres" ? "PostgreSQL (DATABASE_URL)" : "local (PGlite in backend/.pgdata)"} · Files: ${storage.driverName === "supabase" ? "Supabase Storage" : "local disk"}`);
    const p = providerName();
    console.log(p === "manual"
      ? "Bill reading: AI is OFF (add OPENAI_API_KEY or ANTHROPIC_API_KEY to .env to turn it on). Bills can still be entered by hand."
      : `Bill reading: ${p}`);
    const c = pdf.capabilities();
    console.log(c.engine === "libreoffice" ? "Invoice PDFs: LibreOffice (all templates)"
      : c.engine === "builtin" ? "Invoice PDFs: built-in (builder templates). Install LibreOffice for PDFs of uploaded Word templates."
      : `Invoice PDFs: ${c.engine}`);
  });
})();
