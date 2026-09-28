require("dotenv").config();

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is not set. Copy .env.example to .env and set a long random value.");
  process.exit(1);
}

const app = require("./app");
const { recoverInterrupted } = require("./lib/bills");
const { providerName } = require("./lib/extraction");

recoverInterrupted();
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Smart Invoicing backend listening on http://localhost:${PORT}`);
  const p = providerName();
  console.log(p === "manual"
    ? "Bill reading: AI is OFF (add OPENAI_API_KEY or ANTHROPIC_API_KEY to .env to turn it on). Bills can still be entered by hand."
    : `Bill reading: ${p}`);
});
