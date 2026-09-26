// Vision extraction with Claude (design doc 8.2): sends one bill image or
// PDF and gets back vendor, bill number, date, and line items as JSON that
// is guaranteed to match EXTRACTION_SCHEMA (structured outputs).
//
// Credentials come from the environment (ANTHROPIC_API_KEY). The model and
// effort are env-configurable so they can be tuned against real bill photos
// — the design doc's target is under 15 seconds per bill.

const Anthropic = require("@anthropic-ai/sdk");

const MODEL = process.env.EXTRACTION_MODEL || "claude-opus-5";
const EFFORT = process.env.EXTRACTION_EFFORT || "medium";

// A value the model read from the bill, plus whether it's sure. "unclear"
// is how low-confidence fields get flagged instead of silently guessed.
const readField = (valueSchema) => ({
  type: "object",
  properties: {
    value: { anyOf: [valueSchema, { type: "null" }] },
    unclear: { type: "boolean" },
    note: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
  required: ["value", "unclear", "note"],
  additionalProperties: false,
});

const nullable = (schema) => ({ anyOf: [schema, { type: "null" }] });

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    isBill: { type: "boolean" },
    problem: nullable({ type: "string" }),
    vendorName: readField({ type: "string" }),
    billNumber: readField({ type: "string" }),
    billDate: readField({ type: "string", format: "date" }),
    lineItems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: nullable({ type: "string" }),
          quantity: nullable({ type: "number" }),
          unit: nullable({ type: "string" }),
          rate: nullable({ type: "number" }),
          amount: nullable({ type: "number" }),
          unclear: { type: "boolean" },
          note: nullable({ type: "string" }),
        },
        required: ["description", "quantity", "unit", "rate", "amount", "unclear", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["isBill", "problem", "vendorName", "billNumber", "billDate", "lineItems"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You read photos and scans of vendor purchase bills (receipts, invoices, delivery notes) for a business that re-invoices those purchases to its own clients. Your output feeds a review screen where a person checks every value before anything is billed, so a flagged gap costs them a few seconds while a confident wrong value can end up on a client's invoice.

Extract:
- vendorName: the business that issued the bill (the seller), not the buyer.
- billNumber: the bill, invoice, or receipt number exactly as printed.
- billDate: the issue date as YYYY-MM-DD. Bills often use DD/MM/YYYY; use the vendor's address, currency, and language to decide the order, and set unclear with a note when the day and month could be swapped.
- lineItems: one entry per purchased item, in printed order. quantity, rate (unit price) and amount (line total) are plain numbers: no currency symbols or thousands separators, a dot as the decimal point. unit is the unit of measure if printed (pcs, kg, m, box). Leave out subtotal, tax, discount, and grand-total rows.

When a value is handwritten illegibly, cut off, blurred, or ambiguous, give your best reading if you have one, set unclear to true, and put a short reason in note, for example "description unclear" or "last digit smudged". When a value isn't on the bill at all, use null and leave unclear false. Never invent a value that isn't printed.

If the image is not a bill, or is unreadable throughout, set isBill false, explain why in problem, and return empty or null fields.`;

let client;
function getClient() {
  client ??= new Anthropic({ timeout: 90_000, maxRetries: 2 });
  return client;
}

/**
 * @param {{ buffer: Buffer, mimeType: string }} file - PNG, JPEG, or PDF
 * @returns {Promise<{ result: object, model: string }>} result matches EXTRACTION_SCHEMA
 */
async function extractWithClaude({ buffer, mimeType }) {
  const data = buffer.toString("base64");
  const fileBlock =
    mimeType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: mimeType, data } };

  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    // On a safety-classifier decline, the API retries on Anthropic's
    // recommended fallback model instead of failing the extraction.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: {
      effort: EFFORT,
      format: { type: "json_schema", schema: EXTRACTION_SCHEMA },
    },
    system: SYSTEM_PROMPT,
    messages: [
      { role: "user", content: [fileBlock, { type: "text", text: "Extract this bill." }] },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new ExtractionError("The extraction service declined to read this file.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new ExtractionError("The bill has too many line items to read in one pass.");
  }
  const text = response.content.find((block) => block.type === "text");
  if (!text) {
    throw new ExtractionError("The extraction service returned no result.");
  }
  return { result: JSON.parse(text.text), model: response.model };
}

// An error whose message is safe to show the user as-is.
class ExtractionError extends Error {}

/** Maps SDK failures to a message a reviewer can act on. */
function describeFailure(err) {
  if (err instanceof ExtractionError) return err.message;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return "The extraction service isn't configured on the server.";
  }
  if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError) {
    return "The extraction service is busy. Try again in a minute.";
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return "Couldn't reach the extraction service. Try again.";
  }
  if (err instanceof Anthropic.BadRequestError) {
    return "The extraction service couldn't process this file.";
  }
  return "Extraction failed. Try again.";
}

module.exports = { extractWithClaude, describeFailure, ExtractionError, EXTRACTION_SCHEMA };
