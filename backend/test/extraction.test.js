const { test } = require("node:test");
const assert = require("node:assert/strict");
const { toDraft, isValidIsoDate } = require("../src/extraction");
const { describeFailure, ExtractionError } = require("../src/extraction/claudeExtractor");

const field = (value, unclear = false, note = null) => ({ value, unclear, note });

test("toDraft trims text, keeps only finite numbers, and flags per field", () => {
  const draft = toDraft({
    isBill: true,
    problem: null,
    vendorName: field("  Acme  "),
    billNumber: field("   "),
    billDate: field("2026-13-01"),
    lineItems: [{ description: " Nails ", quantity: 2, unit: " ", rate: 0.5, amount: 1, unclear: false, note: "ignored" }],
  });
  assert.deepEqual(draft.header, { vendorName: "Acme", originalBillNo: null, originalDate: null });
  assert.deepEqual(draft.flags, { originalBillNo: "bill number unreadable", originalDate: "date unreadable" });
  assert.deepEqual(draft.lineItems[0], {
    description: "Nails", quantity: 2, unit: null, rate: 0.5, amount: 1, unclear: false, note: null,
  });
  assert.equal(draft.confidence, "low");
});

test("a missing (null) value is not a flag; an unclear one is", () => {
  const draft = toDraft({
    isBill: true, problem: null,
    vendorName: field("Acme"),
    billNumber: field(null),
    billDate: field("2026-03-04", true, "day and month could be swapped"),
    lineItems: [{ description: null, quantity: null, unit: null, rate: null, amount: null, unclear: true, note: null }],
  });
  assert.deepEqual(draft.flags, { originalDate: "day and month could be swapped" });
  assert.equal(draft.header.originalDate, "2026-03-04");
  assert.equal(draft.lineItems[0].note, "unclear", "an unclear item always carries a reason");
});

test("isValidIsoDate rejects impossible and non-ISO dates", () => {
  assert.equal(isValidIsoDate("2024-02-29"), true);
  assert.equal(isValidIsoDate("2025-02-29"), false);
  assert.equal(isValidIsoDate("14/03/2026"), false);
  assert.equal(isValidIsoDate(null), false);
});

test("describeFailure shows safe messages and never raw internals", () => {
  assert.equal(describeFailure(new ExtractionError("Too many items")), "Too many items");
  assert.equal(describeFailure(new Error("ECONNRESET at 10.0.0.1")), "Extraction failed. Try again.");
});
