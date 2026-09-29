const express = require("express");
const { randomUUID } = require("crypto");
const db = require("../db");
const { handle } = require("../lib/http");

const router = express.Router();

// GET /api/company-profile
router.get("/", handle(async (req, res) => {
  const profile = await db.get("SELECT * FROM company_profiles WHERE organization_id = ?", req.organizationId);
  if (!profile) return res.json(null);
  res.json(toApi(profile));
}));

// POST /api/company-profile  (create on first save, update on every save after)
router.post("/", handle(async (req, res) => {
  const b = req.body || {};
  const t = (v) => (typeof v === "string" ? v.trim() || null : v ?? null);
  const legalName = t(b.legalName);
  const registrationNo = t(b.registrationNo);
  const taxNo = t(b.taxNo);
  const addressBlock = t(b.addressBlock);
  const logoAssetUrl = t(b.logoAssetUrl);
  const contactDetails = t(b.contactDetails);
  if (!legalName) {
    return res.status(400).json({ error: "legalName is required" });
  }

  const existing = await db.get("SELECT id FROM company_profiles WHERE organization_id = ?", req.organizationId);

  if (existing) {
    await db.run(`UPDATE company_profiles
       SET legal_name = ?, registration_no = ?, tax_no = ?, address_block = ?,
           logo_asset_url = ?, contact_details = ?, updated_at = utc_now()
       WHERE organization_id = ?`, legalName, registrationNo, taxNo, addressBlock, logoAssetUrl, contactDetails, req.organizationId);
  } else {
    await db.run(`INSERT INTO company_profiles
        (id, organization_id, legal_name, registration_no, tax_no, address_block, logo_asset_url, contact_details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, randomUUID(),
      req.organizationId,
      legalName,
      registrationNo,
      taxNo,
      addressBlock,
      logoAssetUrl,
      contactDetails
    );
  }

  const saved = await db.get("SELECT * FROM company_profiles WHERE organization_id = ?", req.organizationId);
  res.status(existing ? 200 : 201).json(toApi(saved));
}));

function toApi(row) {
  return {
    id: row.id,
    legalName: row.legal_name,
    registrationNo: row.registration_no,
    taxNo: row.tax_no,
    addressBlock: row.address_block,
    logoAssetUrl: row.logo_asset_url,
    contactDetails: row.contact_details,
    updatedAt: row.updated_at,
  };
}

module.exports = router;
