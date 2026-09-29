// Phase 2 — capture, AI extraction, review, duplicates (Design Document §8.1–§8.3).
process.env.EXTRACTION_PROVIDER = "mock";
const test = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, call, newOrg } = require("./helpers");
const extraction = require("../src/lib/extraction");
const { normalizeExtraction, MOCK } = { ...require("../src/lib/extraction/normalize"), MOCK: extraction.MOCK };

const JPEG = Buffer.from("ffd8ffe000104a46494600010100000100010000ffd9", "hex");
const form = (files) => {
  const f = new FormData();
  for (const [buf, type, name] of files) f.append("files", new Blob([buf], { type }), name);
  return f;
};
const upload = (token, files = [[JPEG, "image/jpeg", "bill.jpg"]]) => call("POST", "/api/bills", { token, raw: form(files) });

async function waitReady(token, id) {
  for (let i = 0; i < 50; i++) {
    const r = await call("GET", `/api/bills/${id}`, { token });
    if (r.body.status !== "processing") return r.body;
    await new Promise((res) => setTimeout(res, 20));
  }
  throw new Error("bill never finished processing");
}

let A, B, first;
test.before(async () => {
  await start();
  A = await newOrg("BillA");
  B = await newOrg("BillB");
});
test.after(stop);

test("normaliser flags what the AI could not read", () => {
  const n = normalizeExtraction(MOCK);
  assert.equal(n.vendorName, "Gulf Hardware Trading LLC");
  assert.equal(n.originalDate, "2026-09-14");
  assert.equal(n.items.length, 4);
  assert.deepEqual(n.items.map((i) => i.flagged), [false, false, false, true]);
  assert.equal(n.items[3].reason, "Description unclear");
  assert.equal(n.flags.total, undefined, "items add up to the printed subtotal");

  const bad = normalizeExtraction({
    is_bill: true, vendor_name: null, bill_number: "A-1", bill_number_confidence: "low",
    bill_date_text: "3?/08/2026", bill_date_iso: null,
    subtotal: 50, line_items: [{ description: "Cable", quantity: 2, unit_price: 10, amount: 25, legible: true, confidence: "high" }],
  });
  assert.equal(bad.flags.vendorName, "Couldn't read the vendor name");
  assert.equal(bad.flags.originalBillNo, "Check the bill number");
  assert.match(bad.flags.originalDate, /Couldn't understand the date/);
  assert.match(bad.items[0].reason, /Qty × rate is 20, but the bill shows 25/);
  assert.match(bad.flags.total, /add up to 20.000, but the bill shows 50.000/);
  assert.ok(bad.confidence < 0.5);
});

test("upload a photo: bill is read and ready for review", async () => {
  const r = await upload(A);
  assert.equal(r.status, 202);
  assert.equal(r.body.status, "processing");
  first = await waitReady(A, r.body.id);
  assert.equal(first.status, "needs_review");
  assert.equal(first.vendorName, "Gulf Hardware Trading LLC");
  assert.equal(first.originalBillNo, "4471");
  assert.equal(first.originalDate, "2026-09-14");
  assert.equal(first.items.length, 4);
  assert.equal(first.items.filter((i) => i.flagged).length, 1);
  assert.equal(first.itemsTotal, 86.25);
  assert.equal(first.files.length, 1);
  assert.deepEqual(first.possibleDuplicates, []);
});

test("original image is served only through the authenticated bill route", async () => {
  const ok = await call("GET", first.files[0].url, { token: A });
  assert.equal(ok.status, 200);
  assert.equal(ok.res.headers.get("content-type"), "image/jpeg");
  assert.equal((await call("GET", first.files[0].url)).status, 401);
  assert.equal((await call("GET", first.files[0].url, { token: B })).status, 404);
  const db = require("../src/db");
  const key = (await db.get("SELECT storage_key FROM bill_files WHERE bill_id = ?", first.id)).storage_key;
  assert.equal((await call("GET", `/uploads/${key}`)).status, 404, "not reachable through the public logo path");
});

test("review save validates, recomputes amounts, clears flags and keeps the AI reading", async () => {
  const items = first.items.map((i) => ({ ...i }));
  items[3].description = "Pipe clamp set";
  assert.equal((await call("PUT", `/api/bills/${first.id}`, { token: A, body: { vendorName: "", originalBillNo: "4471", items } })).status, 400);
  assert.equal((await call("PUT", `/api/bills/${first.id}`, { token: A, body: { vendorName: "V", originalBillNo: "4471", originalDate: "31-02-2026", items } })).status, 400);
  const bad = await call("PUT", `/api/bills/${first.id}`, { token: A, body: { vendorName: "V", originalBillNo: "1", items: [{ description: "x", qty: 0, rate: 1 }] } });
  assert.match(bad.body.error, /Line 1: quantity/);

  items[0].qty = "7"; // user corrected the quantity
  const r = await call("PUT", `/api/bills/${first.id}`, {
    token: A, body: { vendorName: "Gulf Hardware Trading LLC", originalBillNo: "4471", originalDate: "14-09-2026", items },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, "draft");
  assert.deepEqual(r.body.flags, {});
  assert.equal(r.body.items.every((i) => !i.flagged), true);
  assert.equal(r.body.items[0].amount, 31.5);
  assert.equal(r.body.itemsTotal, 90.75);
  const db = require("../src/db");
  const row = await db.get("SELECT extraction_json, vendor_id FROM bills WHERE id = ?", first.id);
  assert.equal(JSON.parse(row.extraction_json).line_items[0].quantity, 6, "original AI reading is preserved");
  assert.ok(row.vendor_id);
});

test("duplicate bill (same vendor, bill number and date) is flagged", async () => {
  const r = await upload(A);
  const second = await waitReady(A, r.body.id);
  assert.equal(second.possibleDuplicates.length, 1);
  assert.equal(second.possibleDuplicates[0].id, first.id);
  assert.equal(second.possibleDuplicates[0].originalBillNo, "4471");
  // Different bill number -> no longer a duplicate
  const saved = await call("PUT", `/api/bills/${second.id}`, {
    token: A, body: { vendorName: "Gulf Hardware Trading L.L.C.", originalBillNo: "4472", originalDate: "2026-09-14", items: [{ description: "x", qty: 1, rate: 1 }] },
  });
  assert.deepEqual(saved.body.possibleDuplicates, []);
  // Same number written differently -> duplicate again
  const again = await call("PUT", `/api/bills/${second.id}`, {
    token: A, body: { vendorName: "gulf hardware trading", originalBillNo: " 44-71 ", originalDate: "2026-09-14", items: [{ description: "x", qty: 1, rate: 1 }] },
  });
  assert.equal(again.body.possibleDuplicates.length, 1);
});

test("with AI switched off, the bill still opens for manual entry", async () => {
  process.env.EXTRACTION_PROVIDER = "manual";
  try {
    const r = await upload(A);
    const b = await waitReady(A, r.body.id);
    assert.equal(b.status, "needs_review");
    assert.match(b.flags.ai, /AI reading is switched off/);
    assert.equal(b.items.length, 0);
  } finally {
    process.env.EXTRACTION_PROVIDER = "mock";
  }
});

test("an AI failure marks the bill failed with a readable message, and it can be retried", async () => {
  const original = extraction.extract;
  extraction.extract = async () => { throw Object.assign(new Error("rate"), { status: 429 }); };
  try {
    const r = await upload(A);
    const b = await waitReady(A, r.body.id);
    assert.equal(b.status, "failed");
    assert.match(b.extraction.error, /busy/);
    extraction.extract = original;
    const retry = await call("POST", `/api/bills/${b.id}/extract`, { token: A });
    assert.equal(retry.status, 202);
    assert.equal((await waitReady(A, b.id)).status, "needs_review");
  } finally {
    extraction.extract = original;
  }
});

test("upload rules: types, PDF alone, max 5 files", async () => {
  assert.equal((await upload(A, [[Buffer.from("hi"), "text/plain", "a.txt"]])).status, 400);
  assert.equal((await upload(A, [[JPEG, "image/jpeg", "a.jpg"], [Buffer.from("%PDF-1.4"), "application/pdf", "b.pdf"]])).status, 400);
  const six = Array.from({ length: 6 }, (_, i) => [JPEG, "image/jpeg", `p${i}.jpg`]);
  assert.equal((await upload(A, six)).status, 400);
  const pdf = await upload(A, [[Buffer.from("%PDF-1.4"), "application/pdf", "b.pdf"]]);
  assert.equal(pdf.status, 202);
  await waitReady(A, pdf.body.id);
  const multi = await upload(A, [[JPEG, "image/jpeg", "p1.jpg"], [JPEG, "image/jpeg", "p2.jpg"]]);
  assert.equal(multi.body.files.length, 2);
  await waitReady(A, multi.body.id);
});

test("list, search, summary", async () => {
  const all = await call("GET", "/api/bills", { token: A });
  assert.ok(all.body.length >= 5);
  const drafts = await call("GET", "/api/bills?status=draft", { token: A });
  assert.ok(drafts.body.every((b) => b.status === "draft"));
  const q = await call("GET", "/api/bills?q=4472", { token: A });
  assert.equal(q.body.length, 0, "second bill was changed back to 44-71");
  const s = await call("GET", "/api/bills/summary", { token: A });
  assert.equal(s.body.drafts, 2);
  assert.ok(s.body.needsReview >= 3);
  assert.equal(s.body.recent.length, 5);
});

test("tenant isolation for bills", async () => {
  assert.deepEqual((await call("GET", "/api/bills", { token: B })).body, []);
  assert.equal((await call("GET", "/api/bills/summary", { token: B })).body.total, 0);
  assert.equal((await call("GET", `/api/bills/${first.id}`, { token: B })).status, 404);
  assert.equal((await call("PUT", `/api/bills/${first.id}`, { token: B, body: { vendorName: "x", originalBillNo: "1", items: [{ description: "x", qty: 1, rate: 1 }] } })).status, 404);
  assert.equal((await call("POST", `/api/bills/${first.id}/extract`, { token: B })).status, 404);
  assert.equal((await call("DELETE", `/api/bills/${first.id}`, { token: B })).status, 404);
  // B's identical bill is not a duplicate of A's
  const r = await upload(B);
  const b = await waitReady(B, r.body.id);
  assert.deepEqual(b.possibleDuplicates, []);
});

test("delete removes the bill and its files", async () => {
  const r = await call("DELETE", `/api/bills/${first.id}`, { token: A });
  assert.equal(r.status, 204);
  assert.equal((await call("GET", `/api/bills/${first.id}`, { token: A })).status, 404);
  assert.equal((await call("GET", first.files[0].url, { token: A })).status, 404);
});

test("bills left mid-reading by a restart are released", async () => {
  const db = require("../src/db");
  const { recoverInterrupted } = require("../src/lib/bills");
  const id = (await db.get("SELECT id FROM bills LIMIT 1")).id;
  await db.run("UPDATE bills SET status = 'processing' WHERE id = ?", id);
  await recoverInterrupted();
  assert.equal((await db.get("SELECT status FROM bills WHERE id = ?", id)).status, "failed");
});
