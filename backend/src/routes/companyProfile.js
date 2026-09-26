const express = require("express");
const { randomUUID } = require("crypto");
const db = require("../db");
const { findOwnedAsset, assetUrl } = require("./assets");

const router = express.Router();

// GET /api/company-profile
router.get("/", (req, res) => {
  const profile = db
    .prepare("SELECT * FROM company_profiles WHERE organization_id = ?")
    .get(req.organizationId);
  if (!profile) return res.json(null);
  res.json(toApi(profile));
});

// POST /api/company-profile  (create on first save, update on every save after)
router.post("/", (req, res) => {
  const { legalName, registrationNo, taxNo, addressBlock, logoAssetId, contactDetails } =
    req.body || {};
  if (!legalName) {
    return res.status(400).json({ error: "legalName is required" });
  }
  if (logoAssetId && !findOwnedAsset(req.organizationId, logoAssetId)) {
    return res.status(400).json({ error: "logoAssetId does not refer to an uploaded logo" });
  }

  const existing = db
    .prepare("SELECT id FROM company_profiles WHERE organization_id = ?")
    .get(req.organizationId);

  if (existing) {
    db.prepare(
      `UPDATE company_profiles
       SET legal_name = ?, registration_no = ?, tax_no = ?, address_block = ?,
           logo_asset_id = ?, contact_details = ?, updated_at = datetime('now')
       WHERE organization_id = ?`
    ).run(legalName, registrationNo, taxNo, addressBlock, logoAssetId ?? null, contactDetails, req.organizationId);
  } else {
    db.prepare(
      `INSERT INTO company_profiles
        (id, organization_id, legal_name, registration_no, tax_no, address_block, logo_asset_id, contact_details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      randomUUID(),
      req.organizationId,
      legalName,
      registrationNo,
      taxNo,
      addressBlock,
      logoAssetId ?? null,
      contactDetails
    );
  }

  const saved = db
    .prepare("SELECT * FROM company_profiles WHERE organization_id = ?")
    .get(req.organizationId);
  res.status(existing ? 200 : 201).json(toApi(saved));
});

function toApi(row) {
  return {
    id: row.id,
    legalName: row.legal_name,
    registrationNo: row.registration_no,
    taxNo: row.tax_no,
    addressBlock: row.address_block,
    logoAssetId: row.logo_asset_id,
    logoUrl: assetUrl(row.logo_asset_id),
    contactDetails: row.contact_details,
    updatedAt: row.updated_at,
  };
}

module.exports = router;
