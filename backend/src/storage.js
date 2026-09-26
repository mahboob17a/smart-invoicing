// File storage for uploaded assets.
//
// Local disk for development. Every key is prefixed with the owning
// organization's id, matching the "namespaced per organization" layout the
// design document specifies for S3-compatible storage — swapping to S3 in
// production means reimplementing these functions only.

const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, "../uploads"));

function resolveKey(key) {
  const full = path.resolve(rootDir, key);
  if (!full.startsWith(rootDir + path.sep)) {
    throw new Error(`Storage key escapes upload root: ${key}`);
  }
  return full;
}

function putObject(key, buffer) {
  const full = resolveKey(key);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, buffer);
}

function getObject(key) {
  return fs.readFileSync(resolveKey(key));
}

function objectPath(key) {
  return resolveKey(key);
}

module.exports = { putObject, getObject, objectPath };
