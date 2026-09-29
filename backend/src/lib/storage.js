// File storage for bill images/PDFs. Local disk for development, namespaced
// per organization (UPLOAD_DIR/<orgId>/bills/...). Production swaps this for
// S3-compatible storage (Design Document §9) behind the same three functions.
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const ROOT = process.env.UPLOAD_DIR || path.join(__dirname, "../../uploads");

function save(organizationId, buffer, ext, folder = "bills") {
  const key = path.posix.join(organizationId, folder, `${randomUUID()}.${ext}`);
  const full = path.join(ROOT, key);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, buffer);
  return key;
}

function read(key) {
  return fs.readFileSync(path.join(ROOT, key));
}

function absolutePath(key) {
  return path.join(ROOT, key);
}

function remove(key) {
  try { fs.unlinkSync(path.join(ROOT, key)); } catch { /* already gone */ }
}

module.exports = { save, read, remove, absolutePath, ROOT };
