// Numbering concurrency worker: several of these run at once against one
// PostgreSQL database, like several app servers taking numbers together.
//   node allocate-worker.js setup            -> creates an org + series, prints ids
//   node allocate-worker.js <org> <series> N -> allocates N numbers, prints them
const { randomUUID } = require("crypto");
const db = require("../../src/db");
const { allocateNext } = require("../../src/lib/invoiceNumber");

(async () => {
  const [cmd, series, n] = process.argv.slice(2);
  if (cmd === "setup") {
    const org = randomUUID(), ser = randomUUID();
    await db.run("INSERT INTO organizations (id, name) VALUES (?, 'Concurrency LLC')", org);
    await db.run("INSERT INTO invoice_number_series (id, organization_id, prefix, padding) VALUES (?, ?, 'INV', 4)", ser, org);
    process.stdout.write(JSON.stringify({ org, series: ser }));
  } else {
    const out = [];
    for (let i = 0; i < Number(n); i++) out.push((await allocateNext(cmd, series)).invoiceNo);
    process.stdout.write(JSON.stringify(out));
  }
  await db.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
