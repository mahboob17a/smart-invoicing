require("dotenv").config();

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is not set. Copy .env.example to .env and set a long random value.");
  process.exit(1);
}

const app = require("./app");
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Smart Invoicing backend listening on http://localhost:${PORT}`);
});
