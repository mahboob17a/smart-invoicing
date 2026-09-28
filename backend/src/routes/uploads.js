const express = require("express");
const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
const multer = require("multer");
const { badRequest, handle } = require("../lib/http");

// POST /api/uploads/logo  (multipart field "file") -> { url }
// Local disk for development, namespaced per organization. Production moves
// this to S3-compatible storage (Design Document Section 9) behind the same
// endpoint.
const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(__dirname, "../../uploads");
const TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      const dir = path.join(UPLOAD_ROOT, req.organizationId);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename(req, file, cb) {
      cb(null, `logo-${randomUUID()}.${TYPES[file.mimetype]}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (!TYPES[file.mimetype]) return cb(badRequest("Logo must be a PNG, JPEG or WebP image"));
    cb(null, true);
  },
});

const router = express.Router();
router.post("/logo", upload.single("file"), handle((req, res) => {
  if (!req.file) throw badRequest('Attach the image as multipart field "file"');
  res.status(201).json({ url: `/uploads/${req.organizationId}/${req.file.filename}` });
}));

router.UPLOAD_ROOT = UPLOAD_ROOT;
module.exports = router;
