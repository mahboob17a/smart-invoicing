const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validatePattern, renderFilename, DEFAULT_PATTERN, sampleValues } = require("../src/filenamePattern");

test("the default pattern is valid and renders with sample data", () => {
  assert.equal(validatePattern(DEFAULT_PATTERN), null);
  assert.equal(
    renderFilename(DEFAULT_PATTERN, sampleValues()),
    "Acme Trading_Invoice_NWP_City Hardware_INV-4471_2026-03-14"
  );
});

test("validation is stable across repeated calls", () => {
  // Guards against the shared /g regex lastIndex bug class.
  for (let i = 0; i < 5; i++) {
    assert.equal(validatePattern("{VendorName}"), null);
    assert.match(validatePattern("{Bogus}"), /Unknown/);
  }
});

test("rendering strips characters that are illegal in filenames", () => {
  const name = renderFilename("{VendorName}_{OriginalBillNo}", {
    VendorName: 'A/B: "Supplies"',
    OriginalBillNo: "12\\34?",
  });
  assert.equal(name, "A-B- -Supplies-_12-34-");
});

test("rendering never produces an empty or hidden filename", () => {
  assert.equal(renderFilename("{VendorName}", {}), "invoice");
  assert.equal(renderFilename("{VendorName}", { VendorName: "..hidden" }), "hidden");
});
