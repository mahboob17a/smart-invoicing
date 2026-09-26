const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, PNG_BYTES, extraction, cleanExtraction } = require("./helpers");

let t;
let token;
let nextResult;
let calls;

before(async () => {
  t = await startServer();
  ({ token } = await t.signup());
});
beforeEach(() => {
  calls = [];
  nextResult = () => cleanExtraction();
  extraction.setExtractor(async (file) => {
    calls.push(file);
    return { result: nextResult(), model: "test-model" };
  });
});
after(() => {
  extraction.setExtractor();
  return t.close();
});

const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

// What the review screen sends back when saving the bill unchanged.
function editBody(bill, overrides = {}) {
  return {
    vendorName: bill.vendorName,
    originalBillNo: bill.originalBillNo,
    originalDate: bill.originalDate,
    fieldFlags: bill.fieldFlags,
    lineItems: bill.lineItems.map(({ id, ...item }) => item),
    ...overrides,
  };
}

test("uploading a bill creates a pending draft, then extraction fills it in", async () => {
  const res = await t.uploadBill(token);
  assert.equal(res.status, 201);
  assert.equal(res.data.status, "draft");
  assert.equal(res.data.extractionStatus, "pending");

  await extraction.waitForExtraction(res.data.id);
  const bill = (await t.request("GET", `/api/bills/${res.data.id}`, { token })).data;
  assert.equal(bill.extractionStatus, "completed");
  assert.equal(bill.extractionConfidence, "high");
  assert.equal(bill.vendorName, "City Hardware");
  assert.equal(bill.originalBillNo, "INV-4471");
  assert.equal(bill.originalDate, "2026-03-14");
  assert.deepEqual(bill.fieldFlags, {});
  assert.equal(bill.lineItems.length, 2);
  assert.deepEqual(
    { ...bill.lineItems[0], id: undefined },
    { id: undefined, description: "Cement 50kg", quantity: 10, unit: "bag", rate: 2.5, amount: 25, unclear: false, note: null }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].mimeType, "image/png");
  assert.ok(calls[0].buffer.equals(PNG_BYTES), "the stored original is what gets extracted");

  const image = await t.request("GET", bill.imageUrl, { token });
  assert.equal(image.status, 200);
  assert.ok(image.data.equals(PNG_BYTES));
});

test("PDF bills are accepted and sent to extraction as PDFs", async () => {
  const bill = await t.uploadAndExtract(token, PDF_BYTES, "application/pdf", "bill.pdf");
  assert.equal(bill.imageMimeType, "application/pdf");
  assert.equal(calls[0].mimeType, "application/pdf");
});

test("uploads are validated by content, not by declared type", async () => {
  const exe = await t.uploadBill(token, Buffer.from("MZ not a bill"), "image/jpeg");
  assert.equal(exe.status, 400);
  const none = await t.request("POST", "/api/bills", { token, form: new FormData() });
  assert.equal(none.status, 400);
  const bigPhoto = Buffer.concat([PNG_BYTES, Buffer.alloc(6 * 1024 * 1024)]);
  assert.equal((await t.uploadBill(token, bigPhoto)).status, 400);
});

test("unclear and invalid values are flagged, not silently accepted", async () => {
  nextResult = () =>
    cleanExtraction({
      vendorName: { value: "City Hardwre", unclear: true, note: "name partly smudged" },
      billDate: { value: "2026-02-31", unclear: false, note: null },
      lineItems: [
        { description: "Cem??t", quantity: 10, unit: "bag", rate: 2.5, amount: 25, unclear: true, note: "description unclear" },
        { description: "Sand", quantity: 1, unit: null, rate: 3, amount: 3, unclear: false, note: null },
      ],
    });
  const bill = await t.uploadAndExtract(token);
  assert.equal(bill.extractionConfidence, "low");
  assert.equal(bill.vendorName, "City Hardwre", "best reading is kept for the reviewer");
  assert.deepEqual(bill.fieldFlags, {
    vendorName: "name partly smudged",
    originalDate: "date unreadable",
  });
  assert.equal(bill.originalDate, null, "an impossible date is never stored");
  assert.equal(bill.lineItems[0].unclear, true);
  assert.equal(bill.lineItems[0].note, "description unclear");
  assert.equal(bill.lineItems[1].unclear, false);
});

test("a non-bill image is flagged so the reviewer can't miss it", async () => {
  nextResult = () =>
    cleanExtraction({
      isBill: false,
      problem: "Photo shows a street sign",
      vendorName: { value: null, unclear: false, note: null },
      billNumber: { value: null, unclear: false, note: null },
      billDate: { value: null, unclear: false, note: null },
      lineItems: [],
    });
  const bill = await t.uploadAndExtract(token);
  assert.equal(bill.fieldFlags.bill, "Photo shows a street sign");
});

test("a failed extraction is reported and can be retried", async () => {
  nextResult = () => {
    throw new Error("socket hang up");
  };
  const failed = await t.uploadAndExtract(token);
  assert.equal(failed.extractionStatus, "failed");
  assert.equal(failed.extractionError, "Extraction failed. Try again.", "internal errors aren't leaked");

  const early = await t.request("PUT", `/api/bills/${failed.id}`, { token, body: editBody(failed) });
  assert.equal(early.status, 200, "a failed bill can still be filled in by hand");

  nextResult = () => cleanExtraction();
  const retry = await t.request("POST", `/api/bills/${failed.id}/extract`, { token });
  assert.equal(retry.status, 202);
  assert.equal(retry.data.extractionStatus, "pending");
  await extraction.waitForExtraction(failed.id);
  const done = (await t.request("GET", `/api/bills/${failed.id}`, { token })).data;
  assert.equal(done.extractionStatus, "completed");
  assert.equal(done.vendorName, "City Hardware");

  const again = await t.request("POST", `/api/bills/${failed.id}/extract`, { token });
  assert.equal(again.status, 409, "a completed extraction is never re-run over the reviewer's edits");
});

test("a bill can't be edited while extraction is still running", async () => {
  let release;
  nextResult = () => cleanExtraction();
  extraction.setExtractor(
    () => new Promise((resolve) => { release = () => resolve({ result: nextResult(), model: "m" }); })
  );
  const res = await t.uploadBill(token);
  const edit = await t.request("PUT", `/api/bills/${res.data.id}`, { token, body: { vendorName: "X" } });
  assert.equal(edit.status, 409);
  release();
  await extraction.waitForExtraction(res.data.id);
});

test("review edits are saved and the original AI read is kept", async () => {
  nextResult = () =>
    cleanExtraction({ vendorName: { value: "City Hardwre", unclear: true, note: "smudged" } });
  const bill = await t.uploadAndExtract(token);

  const body = editBody(bill, {
    vendorName: "City Hardware LLC",
    fieldFlags: {},
    lineItems: [
      { description: "Cement 50kg", quantity: 12, unit: "bag", rate: 2.5, amount: 30, unclear: false },
    ],
  });
  const saved = await t.request("PUT", `/api/bills/${bill.id}`, { token, body });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.status, "draft");
  assert.equal(saved.data.vendorName, "City Hardware LLC");
  assert.deepEqual(saved.data.fieldFlags, {});
  assert.equal(saved.data.lineItems.length, 1);
  assert.equal(saved.data.lineItems[0].quantity, 12);

  const db = require("../src/db");
  const raw = JSON.parse(db.prepare("SELECT extraction_json FROM bills WHERE id = ?").get(bill.id).extraction_json);
  assert.equal(raw.result.vendorName.value, "City Hardwre");
  assert.equal(raw.model, "test-model");
});

test("edit validation", async () => {
  const bill = await t.uploadAndExtract(token);
  const put = (overrides) => t.request("PUT", `/api/bills/${bill.id}`, { token, body: editBody(bill, overrides) });
  assert.equal((await put({ originalDate: "14/03/2026" })).status, 400);
  assert.equal((await put({ originalDate: "2026-02-30" })).status, 400);
  assert.equal((await put({ fieldFlags: { hacked: "x" } })).status, 400);
  assert.equal((await put({ lineItems: [{ description: "x", quantity: "3" }] })).status, 400);
  assert.equal((await put({ lineItems: "nope" })).status, 400);
  assert.equal((await put({ vendorName: 42 })).status, 400);
});

test("marking ready requires every flag resolved and complete line items", async () => {
  nextResult = () =>
    cleanExtraction({ billNumber: { value: "INV-44?1", unclear: true, note: "digit unclear" } });
  const bill = await t.uploadAndExtract(token);
  const put = (overrides) =>
    t.request("PUT", `/api/bills/${bill.id}`, { token, body: editBody(bill, { markReady: true, ...overrides }) });

  assert.match((await put({})).data.error, /flagged/);
  assert.match((await put({ fieldFlags: {}, vendorName: "" })).data.error, /Vendor/);
  assert.match((await put({ fieldFlags: {}, lineItems: [] })).data.error, /at least one/);
  assert.match(
    (await put({ fieldFlags: {}, lineItems: [{ description: "x", quantity: null, rate: 1 }] })).data.error,
    /Line 1/
  );
  assert.match(
    (await put({ fieldFlags: {}, lineItems: [{ description: "x", quantity: 1, rate: 1, unclear: true }] })).data.error,
    /Line 1/
  );

  const ready = await put({ fieldFlags: {}, originalBillNo: "INV-4471" });
  assert.equal(ready.status, 200);
  assert.equal(ready.data.status, "ready");

  const reopened = await t.request("PUT", `/api/bills/${bill.id}`, { token, body: editBody(ready.data) });
  assert.equal(reopened.data.status, "draft", "editing without markReady returns it to draft");
});

test("duplicate bills (same vendor + number + date) are reported", async () => {
  const { token: fresh } = await t.signup();
  nextResult = () => cleanExtraction({ billNumber: { value: "DUP-1", unclear: false, note: null } });
  const first = await t.uploadAndExtract(fresh);
  assert.deepEqual(first.duplicates, []);

  nextResult = () =>
    cleanExtraction({
      vendorName: { value: "  city HARDWARE ", unclear: false, note: null },
      billNumber: { value: "dup-1", unclear: false, note: null },
    });
  const second = await t.uploadAndExtract(fresh);
  assert.equal(second.duplicates.length, 1);
  assert.equal(second.duplicates[0].id, first.id);

  const firstNow = (await t.request("GET", `/api/bills/${first.id}`, { token: fresh })).data;
  assert.equal(firstNow.duplicates[0].id, second.id, "both copies are warned");

  // Changing the date during review clears the match.
  const edited = await t.request("PUT", `/api/bills/${second.id}`, {
    token: fresh,
    body: editBody(second, { originalDate: "2026-03-15" }),
  });
  assert.deepEqual(edited.data.duplicates, []);
});

test("bills are listed newest first and can be deleted", async () => {
  const { token: fresh } = await t.signup();
  const a = await t.uploadAndExtract(fresh);
  const b = await t.uploadAndExtract(fresh);
  const list = await t.request("GET", "/api/bills", { token: fresh });
  assert.deepEqual(list.data.map((x) => x.id), [b.id, a.id]);

  assert.equal((await t.request("DELETE", `/api/bills/${a.id}`, { token: fresh })).status, 204);
  assert.equal((await t.request("GET", `/api/bills/${a.id}`, { token: fresh })).status, 404);
  assert.equal((await t.request("GET", "/api/bills", { token: fresh })).data.length, 1);
});
