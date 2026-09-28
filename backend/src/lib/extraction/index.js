// Chooses the extraction provider:
//   anthropic — Claude vision (set ANTHROPIC_API_KEY)
//   manual    — no AI; the reviewer types everything (default without a key)
//   mock      — fixed sample reading, for tests and demos (EXTRACTION_PROVIDER=mock)
const MOCK = {
  is_bill: true,
  vendor_name: "Gulf Hardware Trading LLC", vendor_name_confidence: "high",
  bill_number: "4471", bill_number_confidence: "high",
  bill_date_text: "14-09-2026", bill_date_iso: "2026-09-14", date_confidence: "high",
  currency: "OMR", subtotal: 86.25, tax_amount: 4.313, total: 90.563,
  line_items: [
    { description: "PVC pipe 1\" (3 m)", quantity: 6, unit: "pcs", unit_price: 4.5, amount: 27, legible: true, confidence: "high" },
    { description: "Ball valve 1\" brass", quantity: 4, unit: "pcs", unit_price: 6.25, amount: 25, legible: true, confidence: "high" },
    { description: "PTFE thread tape", quantity: 10, unit: "roll", unit_price: 0.35, amount: 3.5, legible: true, confidence: "medium" },
    { description: "Pipe cl... set", quantity: 2, unit: "set", unit_price: 15.375, amount: 30.75, legible: false, confidence: "low", note: "Handwritten, partly illegible" },
  ],
};

function providerName() {
  const p = (process.env.EXTRACTION_PROVIDER || "").toLowerCase();
  if (p) return p;
  return process.env.ANTHROPIC_API_KEY ? "anthropic" : "manual";
}

async function extract(files) {
  const provider = providerName();
  if (provider === "anthropic") return { provider, ...(await require("./anthropic").extract(files)) };
  if (provider === "mock") {
    const delay = Number(process.env.MOCK_EXTRACTION_DELAY_MS || 0);
    if (delay) await new Promise((r) => setTimeout(r, delay));
    return { provider, model: "mock", raw: JSON.parse(JSON.stringify(MOCK)) };
  }
  return { provider: "manual", model: null, raw: null };
}

module.exports = { extract, providerName, MOCK };
