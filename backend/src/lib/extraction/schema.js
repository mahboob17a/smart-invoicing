// Shared by every AI provider: what to read from a bill, and how.
const CONF = { type: "string", enum: ["high", "medium", "low"] };
const TOOL = {
  name: "record_bill",
  description: "Record everything read from the vendor bill.",
  input_schema: {
    type: "object",
    properties: {
      is_bill: { type: "boolean", description: "False if the image is not a bill, invoice, receipt or delivery note." },
      vendor_name: { type: ["string", "null"], description: "Seller / supplier name as printed on the bill (not the buyer)." },
      vendor_name_confidence: CONF,
      bill_number: { type: ["string", "null"], description: "The vendor's own bill / invoice / receipt number, exactly as printed." },
      bill_number_confidence: CONF,
      bill_date_text: { type: ["string", "null"], description: "The bill date exactly as printed." },
      bill_date_iso: { type: ["string", "null"], description: "The bill date as YYYY-MM-DD. Read numeric dates day-first (DD-MM-YYYY) unless that is impossible." },
      date_confidence: CONF,
      currency: { type: ["string", "null"], description: "ISO currency code if shown or obvious, e.g. OMR, AED, SAR, INR." },
      subtotal: { type: ["number", "null"], description: "Total before tax, if printed." },
      tax_amount: { type: ["number", "null"] },
      total: { type: ["number", "null"], description: "Grand total as printed." },
      line_items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: ["string", "null"] },
            quantity: { type: ["number", "null"] },
            unit: { type: ["string", "null"], description: "e.g. pcs, m, kg, box, set" },
            unit_price: { type: ["number", "null"], description: "Rate per unit before tax." },
            amount: { type: ["number", "null"], description: "Line amount before tax." },
            legible: { type: "boolean", description: "False if the description is hard to read or partly guessed." },
            confidence: CONF,
            note: { type: ["string", "null"], description: "Short note if something on this line is unclear." },
          },
          required: ["description", "quantity", "unit_price", "amount", "legible", "confidence"],
        },
      },
      notes: { type: ["string", "null"], description: "Anything the reviewer should know (stamps, handwriting, missing parts)." },
    },
    required: ["is_bill", "vendor_name", "vendor_name_confidence", "bill_number", "bill_number_confidence",
      "bill_date_text", "bill_date_iso", "date_confidence", "line_items"],
  },
};

const PROMPT = `Read this vendor bill (it may be a photo of a printed or handwritten bill, receipt, cash memo or tax invoice, possibly in English and Arabic).
Record it with the record_bill tool.
Rules:
- Copy text exactly; do not invent values. If something is unreadable, use null and set confidence to "low".
- Numbers: use plain numbers (no currency symbols or thousands separators). Keep all decimal places shown (Omani rial uses 3).
- One entry per printed line item. Do not include tax, discount, delivery or total rows as line items.
- If a line has only an amount, set quantity 1 and unit_price equal to the amount.
- Set legible=false and confidence="low" for any line whose description you are not sure of.`;

module.exports = { TOOL, PROMPT };
