// Numbering concurrency worker: several of these run at once against one
// database file, like several app servers / devices converting together.
//   node allocate-worker.js setup            -> creates an org + series, prints ids
//   node allocate-worker.js <org> <series> N -> allocates N numbers, prints them
const db = require("../../src/db");
const { allocateNext } = require("../../src/lib/invoiceNumber");

const [cmd, series, n] = process.argv.slice(2);
if (cmd === "setup") {
  db.prepare("INSERT INTO organizations (id, name) VALUES ('org-c', 'Concurrency LLC')").run();
  db.prepare("INSERT INTO invoice_number_series (id, organization_id, prefix, padding) VALUES ('ser-c', 'org-c', 'INV', 4)").run();
  process.stdout.write(JSON.stringify({ org: "org-c", series: "ser-c" }));
} else {
  const out = [];
  for (let i = 0; i < Number(n); i++) out.push(allocateNext(cmd, series).invoiceNo);
  process.stdout.write(JSON.stringify(out));
}
