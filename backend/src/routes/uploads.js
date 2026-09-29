const express = require("express");
const { randomUUID } = require("crypto");
const multer = require("multer");
const storage = require("../lib/storage");
const { badRequest, handle } = require("../lib/http");

// POST /api/uploads/logo  (multipart field "file") -> { url }
// Stored per organization as <orgId>/logo-<uuid>.<ext> in the file store
// (local disk or Supabase Storage) and served publicly at /uploads/<key>.
const TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (!TYPES[file.mimetype]) return cb(badRequest("Logo must be a PNG, JPEG or WebP image"));
    cb(null, true);
  },
});

const router = express.Router();
router.post("/logo", upload.single("file"), handle(async (req, res) => {
  if (!req.file) throw badRequest('Attach the image as multipart field "file"');
  const ext = TYPES[req.file.mimetype];
  const key = await storage.save(req.organizationId, req.file.buffer, ext, "", `logo-${randomUUID()}.${ext}`);
  res.status(201).json({ url: `/uploads/${key}` });
}));

/** Public logo URLs only: /uploads/<orgId>/logo-<uuid>.<ext>. Everything else in storage stays private. */
const LOGO_PATH = /^\/([0-9a-f-]{36}\/logo-[0-9a-f-]{36}\.(png|jpg|webp))$/;
const serveLogo = handle(async (req, res) => {
  const m = req.path.match(LOGO_PATH);
  if (!m) return res.status(404).json({ error: "Not found" });
  const buf = await storage.read(m[1]).catch(() => null);
  if (!buf) return res.status(404).json({ error: "Not found" });
  res.set("Cache-Control", "public, max-age=604800");
  res.type(storage.mimeOf(m[1])).send(buf);
});

module.exports = router;
module.exports.serveLogo = serveLogo;
