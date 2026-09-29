// File storage: bill photos/PDFs, logos, Word templates and generated invoices.
// Keys are namespaced per organization: <orgId>/<folder>/<uuid>.<ext>
//
// STORAGE_DRIVER=supabase -> Supabase Storage (private bucket SUPABASE_BUCKET,
//   default "smart-invoicing"), using SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
//   The key stays on the server; the app never talks to Supabase directly.
// Otherwise -> local disk under UPLOAD_DIR (default backend/uploads).
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const ROOT = process.env.UPLOAD_DIR || path.join(__dirname, "../../uploads");
const MIME = {
  jpg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const disk = {
  name: "disk",
  async put(key, buffer) {
    const full = path.join(ROOT, key);
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    await fs.promises.writeFile(full, buffer);
  },
  async get(key) { return fs.promises.readFile(path.join(ROOT, key)); },
  async del(key) { await fs.promises.unlink(path.join(ROOT, key)).catch(() => {}); },
};

function supabaseDriver() {
  const { createClient } = require("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new Error("STORAGE_DRIVER=supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  const bucket = process.env.SUPABASE_BUCKET || "smart-invoicing";
  const client = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  let ready;
  const ensureBucket = () => (ready ??= (async () => {
    const { data } = await client.storage.getBucket(bucket);
    if (!data) {
      const { error } = await client.storage.createBucket(bucket, { public: false });
      if (error && !/already exists/i.test(error.message)) throw new Error(`Supabase Storage: ${error.message}`);
    }
  })().catch((e) => { ready = undefined; throw e; }));
  const files = () => client.storage.from(bucket);
  return {
    name: "supabase",
    ensureBucket,
    async put(key, buffer) {
      await ensureBucket();
      const ext = key.split(".").pop();
      const { error } = await files().upload(key, buffer, { contentType: MIME[ext] || "application/octet-stream", upsert: true });
      if (error) throw new Error(`Supabase Storage upload failed: ${error.message}`);
    },
    async get(key) {
      const { data, error } = await files().download(key);
      if (error) throw Object.assign(new Error(`Supabase Storage download failed: ${error.message}`), { status: 404 });
      return Buffer.from(await data.arrayBuffer());
    },
    async del(key) { await files().remove([key]).catch(() => {}); },
  };
}

const driver = process.env.STORAGE_DRIVER === "supabase" ? supabaseDriver() : disk;

/** Saves a buffer and returns its key. `name` overrides the generated file name. */
async function save(organizationId, buffer, ext, folder = "bills", name) {
  const key = path.posix.join(organizationId, folder, name || `${randomUUID()}.${ext}`);
  await driver.put(key, buffer);
  return key;
}
const read = (key) => driver.get(key);
const remove = (key) => (key ? driver.del(key) : Promise.resolve());
const mimeOf = (key) => MIME[String(key).split(".").pop()] || "application/octet-stream";

module.exports = { save, read, remove, mimeOf, ROOT, driverName: driver.name, ensureReady: () => driver.ensureBucket?.() };
