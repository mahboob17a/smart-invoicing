const express = require("express");
const multer = require("multer");
const { randomUUID } = require("crypto");
const db = require("../db");
const storage = require("../storage");
const { sniffFileType } = require("../fileTypes");

const router = express.Router();

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const LOGO_MIME_TYPES = new Set(["image/png", "image/jpeg"]);

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
    const type = sniffFileType(file.buffer);
    if (!type || !LOGO_MIME_TYPES.has(type.mimeType)) {
      return res.status(400).json({ error: "Logo must be a PNG or JPEG image" });
    }

    const asset = storeAsset(req.organizationId, "logo", file.buffer, type);
    res.status(201).json({
      id: asset.id, url: assetUrl(asset.id), mimeType: type.mimeType, sizeBytes: file.size,
    });
  });
});

// GET /api/assets/:id — only ever serves an asset owned by the caller's
// organization; anything else is indistinguishable from "doesn't exist".
router.get("/:id", (req, res) => {
  const asset = findOwnedAsset(req.organizationId, req.params.id);
  if (!asset) return res.status(404).json({ error: "Not found" });
  res.type(asset.mime_type).sendFile(storage.objectPath(asset.storage_key));
});

// Writes the bytes under an organization-namespaced key and records the
// asset row. `type` comes from sniffFileType().
function storeAsset(organizationId, kind, buffer, type) {
  const id = randomUUID();
  const storageKey = `${organizationId}/${kind}s/${id}.${type.ext}`;
  storage.putObject(storageKey, buffer);
  db.prepare(
    `INSERT INTO assets (id, organization_id, kind, mime_type, size_bytes, storage_key)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, organizationId, kind, type.mimeType, buffer.length, storageKey);
  return { id, storageKey };
}

function findOwnedAsset(organizationId, assetId) {
  return db
    .prepare("SELECT * FROM assets WHERE id = ? AND organization_id = ?")
    .get(assetId, organizationId);
}

function assetUrl(id) {
  return id ? `/api/assets/${id}` : null;
}

module.exports = { router, storeAsset, findOwnedAsset, assetUrl };
