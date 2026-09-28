// OpenAI provider: model choice and request/response handling, with a fake client.
const test = require("node:test");
const assert = require("node:assert/strict");
const oa = require("../src/lib/extraction/openai");
const { providerName } = require("../src/lib/extraction");
const { MOCK } = require("../src/lib/extraction");

function fakeClient(models, reply) {
  const calls = [];
  return {
    calls,
    models: { list: async function* () { for (const id of models) yield { id }; } },
    chat: { completions: { create: async (req) => { calls.push(req); return reply; } } },
  };
}
const toolReply = (args) => ({ choices: [{ message: { tool_calls: [{ function: { name: "record_bill", arguments: JSON.stringify(args) } }] } }] });

test("provider is chosen from the keys present", () => {
  const saved = { ...process.env };
  try {
    delete process.env.EXTRACTION_PROVIDER; delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY;
    assert.equal(providerName(), "manual");
    process.env.OPENAI_API_KEY = "sk-test";
    assert.equal(providerName(), "openai");
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    assert.equal(providerName(), "anthropic", "Claude is the default when both keys are set");
    process.env.EXTRACTION_PROVIDER = "openai";
    assert.equal(providerName(), "openai");
  } finally {
    process.env = saved;
  }
});

test("without EXTRACTION_MODEL, the best available vision model is picked", async () => {
  delete process.env.EXTRACTION_MODEL;
  oa._setClient(fakeClient(["whisper-1", "gpt-4o-mini", "gpt-4.1", "text-embedding-3-small"], null));
  assert.equal(await oa.pickModel(), "gpt-4.1");
  oa._setClient(fakeClient(["gpt-4o", "gpt-5", "gpt-5.4-mini"], null));
  assert.equal(await oa.pickModel(), "gpt-5");
  oa._setClient(fakeClient(["gpt-7-future", "gpt-7-future-audio", "tts-1"], null));
  assert.equal(await oa.pickModel(), "gpt-7-future", "unknown newer chat models are still usable");
  oa._setClient(fakeClient(["whisper-1", "tts-1"], null));
  await assert.rejects(oa.pickModel(), /No suitable OpenAI model/);
});

test("EXTRACTION_MODEL overrides the automatic choice", async () => {
  process.env.EXTRACTION_MODEL = "gpt-4o";
  try {
    oa._setClient(fakeClient(["gpt-5"], null));
    assert.equal(await oa.pickModel(), "gpt-4o");
  } finally {
    delete process.env.EXTRACTION_MODEL;
  }
});

test("sends photos and PDFs correctly and reads the tool answer", async () => {
  const c = fakeClient(["gpt-4.1"], toolReply(MOCK));
  oa._setClient(c);
  const out = await oa.extract([
    { buffer: Buffer.from("img"), mimeType: "image/jpeg" },
    { buffer: Buffer.from("%PDF"), mimeType: "application/pdf" },
  ]);
  assert.equal(out.model, "gpt-4.1");
  assert.equal(out.raw.bill_number, "4471");
  const req = c.calls[0];
  assert.equal(req.tool_choice.function.name, "record_bill");
  assert.match(req.messages[0].content[0].image_url.url, /^data:image\/jpeg;base64,/);
  assert.equal(req.messages[0].content[1].type, "file");
  assert.match(req.messages[0].content[1].file.file_data, /^data:application\/pdf;base64,/);
  assert.equal(req.messages[0].content[2].type, "text");
});

test("a reply without a reading is an error", async () => {
  oa._setClient(fakeClient(["gpt-4.1"], { choices: [{ message: { content: "sorry" } }] }));
  await assert.rejects(oa.extract([{ buffer: Buffer.from("x"), mimeType: "image/png" }]), /no reading/);
});
