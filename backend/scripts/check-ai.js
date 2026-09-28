// npm run check-ai — tells you which AI service will read bills, checks the
// key works, and (for OpenAI) which model the app will use.
require("dotenv").config();
const { providerName } = require("../src/lib/extraction");

(async () => {
  const p = providerName();
  console.log(`Bill reading provider: ${p}`);
  if (p === "manual") {
    console.log("No AI key found. Add OPENAI_API_KEY=... or ANTHROPIC_API_KEY=... to backend/.env, then run this again.");
    return;
  }
  if (p === "mock") return console.log("Mock mode: every bill returns the same sample reading.");
  try {
    if (p === "openai") {
      const model = await require("../src/lib/extraction/openai").pickModel();
      console.log(`OpenAI key works. Model: ${model}${process.env.EXTRACTION_MODEL ? " (from EXTRACTION_MODEL)" : " (chosen automatically)"}`);
    } else if (p === "anthropic") {
      const Anthropic = require("@anthropic-ai/sdk");
      const { MODEL } = require("../src/lib/extraction/anthropic");
      await new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages.create({ model: MODEL, max_tokens: 5, messages: [{ role: "user", content: "Hi" }] });
      console.log(`Anthropic key works. Model: ${MODEL}`);
    }
  } catch (e) {
    console.error(`The key did not work: ${e.status || ""} ${e.message}`);
    process.exitCode = 1;
  }
})();
