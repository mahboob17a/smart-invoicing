const db = require("../db");
const makeListResource = require("./makeListResource");

// Issuing Identity = the letterhead invoices go out under (Section 6.2).
// With sameAsCompany on, name/registration/tax/address/logo always come from
// the current Company Profile, so editing the profile updates the letterhead.
module.exports = makeListResource(
  "issuing_identities",
  [
    { apiField: "displayName", dbColumn: "display_name", maxLength: 200 },
    { apiField: "sameAsCompany", dbColumn: "same_as_company", type: "bool", default: 0 },
    { apiField: "registrationNo", dbColumn: "registration_no", maxLength: 50 },
    { apiField: "taxNo", dbColumn: "tax_no", maxLength: 50 },
    { apiField: "addressBlock", dbColumn: "address_block", maxLength: 500 },
    { apiField: "logoAssetUrl", dbColumn: "logo_asset_url", maxLength: 500 },
  ],
  (row, req) => {
    const base = {
      id: row.id,
      sameAsCompany: !!row.same_as_company,
      displayName: row.display_name,
      registrationNo: row.registration_no,
      taxNo: row.tax_no,
      addressBlock: row.address_block,
      logoAssetUrl: row.logo_asset_url,
      createdAt: row.created_at,
    };
    if (!row.same_as_company) return base;
    const cp = db.prepare("SELECT * FROM company_profiles WHERE organization_id = ?").get(req.organizationId);
    if (!cp) return base;
    return {
      ...base,
      displayName: cp.legal_name,
      registrationNo: cp.registration_no,
      taxNo: cp.tax_no,
      addressBlock: cp.address_block,
      logoAssetUrl: cp.logo_asset_url,
    };
  },
  {
    label: "Issuing identity",
    validate(values, { req }) {
      const { badRequest } = require("../lib/http");
      if (!values.same_as_company) {
        if (!values.display_name) throw badRequest("displayName is required unless sameAsCompany is on");
        return;
      }
      // Keep a stored name as a fallback; reads always use the live profile.
      const cp = db.prepare("SELECT legal_name FROM company_profiles WHERE organization_id = ?").get(req.organizationId);
      if (!cp) throw badRequest("Save the company profile first, then link this identity to it");
      return { display_name: cp.legal_name };
    },
  }
);
