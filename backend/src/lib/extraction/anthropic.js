// Bill extraction with Claude (vision). Returns the raw structured reading;
// normalize.js turns it into fields and review flags.
const Anthropic = require("@anthropic-ai/sdk");

const MODEL = process.env.EXTRACTION_MODEL || "claude-sonnet-5-5";

const { TOOL, PROMPT } = require("./schema");

let client;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 1 });
  return client;
}

/** files: [{ buffer, mimeType }] */
async function extract(files) {
  const content = files.map((f) =>
    f.mimeType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: f.buffer.toString("base64") } }
      : { type: "image", source: { type: "base64", media_type: f.mimeType, data: f.buffer.toString("base64") } }
  );
  content.push({ type: "text", text: PROMPT });
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: 4096,
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [{ role: "user", content }],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block) throw new Error("The AI service returned no reading");
  return { raw: block.input, model: MODEL };
}

module.exports = { extract, MODEL };
