// Bill extraction with OpenAI (vision). Same reading rules and output shape as
// the Claude provider, so everything after this step is identical.
//
// Model: set EXTRACTION_MODEL, or leave it empty and the app picks the best
// vision model your OpenAI key can use (checked once, then remembered).
const OpenAI = require("openai");
const { TOOL, PROMPT } = require("./schema");

// Most capable first. Only models that read images and support tool calls.
const PREFERRED = [
  "gpt-5.5", "gpt-5.4", "gpt-5.2", "gpt-5.1", "gpt-5", "gpt-4.1", "gpt-4o",
  "gpt-5.4-mini", "gpt-5-mini", "gpt-4.1-mini", "gpt-4o-mini",
];
const NOT_CHAT = /(audio|realtime|transcribe|tts|search|image|dall|embedding|moderation|codex|instruct|whisper|davinci|babbage)/;

let client;
let chosenModel = null;

function getClient() {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 60_000, maxRetries: 1 });
  return client;
}

/** Picks the model: EXTRACTION_MODEL if set, otherwise the best one this key can use. */
async function pickModel() {
  if (process.env.EXTRACTION_MODEL) return process.env.EXTRACTION_MODEL;
  if (chosenModel) return chosenModel;
  const ids = new Set();
  for await (const m of getClient().models.list()) ids.add(m.id);
  chosenModel =
    PREFERRED.find((id) => ids.has(id)) ||
    [...ids].filter((id) => /^gpt-\d/.test(id) && !NOT_CHAT.test(id)).sort().reverse()[0] ||
    null;
  if (!chosenModel) throw Object.assign(new Error("No suitable OpenAI model is available to this API key"), { status: 403 });
  console.log(`[extraction] OpenAI model: ${chosenModel}`);
  return chosenModel;
}

/** files: [{ buffer, mimeType }] */
async function extract(files) {
  const model = await pickModel();
  const content = files.map((f, i) =>
    f.mimeType === "application/pdf"
      ? { type: "file", file: { filename: `bill-${i + 1}.pdf`, file_data: `data:application/pdf;base64,${f.buffer.toString("base64")}` } }
      : { type: "image_url", image_url: { url: `data:${f.mimeType};base64,${f.buffer.toString("base64")}`, detail: "high" } }
  );
  content.push({ type: "text", text: PROMPT });

  const res = await getClient().chat.completions.create({
    model,
    max_completion_tokens: 8000,
    tools: [{ type: "function", function: { name: TOOL.name, description: TOOL.description, parameters: TOOL.input_schema } }],
    tool_choice: { type: "function", function: { name: TOOL.name } },
    messages: [{ role: "user", content }],
  });
  const call = res.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error("The AI service returned no reading");
  let raw;
  try {
    raw = JSON.parse(call.function.arguments);
  } catch {
    throw new Error("The AI service returned an unreadable answer");
  }
  return { raw, model };
}

// For tests: swap in a fake client and forget the remembered model.
function _setClient(c) {
  client = c;
  chosenModel = null;
}

module.exports = { extract, pickModel, PREFERRED, _setClient };
