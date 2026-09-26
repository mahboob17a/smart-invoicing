const express = require("express");
const multer = require("multer");
const { randomUUID } = require("crypto");
const db = require("../db");
const storage = require("../storage");

const router = express.Router();

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

// The declared mime type comes from the client, so the file's leading
// bytes are checked too — a renamed .exe must not be stored as a "logo".
const LOGO_TYPES = {
  "image/png": { ext: "png", magic: [0x89, 0x50, 0x4e, 0x47] },
  "image/jpeg": { ext: "jpg", magic: [0xff, 0xd8, 0xff] },
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LOGO_BYTES, files: 1 },
});

// POST /api/assets/logo  (multipart/form-data, field name "file")
// Returns the new asset's id, which the Company Profile and Issuing
// Identity forms then save as logoAssetId.
router.post("/logo", (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const message =
        err.code === "LIMIT_FILE_SIZE" ? "Logo must be 2 MB or smaller" : err.message;
      return res.status(400).json({ error: message });
    }
    if (err) return next(err);

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "Attach the logo image as the 'file' field" });
    }
    const type = LOGO_TYPES[file.mimetype];
    if (!type || !type.magic.every((byte, i) => file.buffer[i] === byte)) {
      return res.status(400).json({ error: "Logo must be a PNG or JPEG image" });
    }

    const id = randomUUID();
    const storageKey = `${req.organizationId}/logos/${id}.${type.ext}`;
    storage.putObject(storageKey, file.buffer);
    db.prepare(
      `INSERT INTO assets (id, organization_id, kind, mime_type, size_bytes, storage_key)
       VALUES (?, ?, 'logo', ?, ?, ?)`
    ).run(id, req.organizationId, file.mimetype, file.size, storageKey);

    res.status(201).json({ id, url: assetUrl(id), mimeType: file.mimetype, sizeBytes: file.size });
  });
});

// GET /api/assets/:id — only ever serves an asset owned by the caller's
// organization; anything else is indistinguishable from "doesn't exist".
router.get("/:id", (req, res) => {
  const asset = findOwnedAsset(req.organizationId, req.params.id);
  if (!asset) return res.status(404).json({ error: "Not found" });
  res.type(asset.mime_type).sendFile(storage.objectPath(asset.storage_key));
});

function findOwnedAsset(organizationId, assetId) {
  return db
    .prepare("SELECT * FROM assets WHERE id = ? AND organization_id = ?")
    .get(assetId, organizationId);
}

function assetUrl(id) {
  return id ? `/api/assets/${id}` : null;
}

module.exports = { router, findOwnedAsset, assetUrl };
