const makeListResource = require("./makeListResource");
const { findOwnedAsset, assetUrl } = require("./assets");

module.exports = makeListResource(
  "issuing_identities",
  [
    { apiField: "displayName", dbColumn: "display_name", required: true },
    { apiField: "registrationNo", dbColumn: "registration_no" },
    { apiField: "taxNo", dbColumn: "tax_no" },
    { apiField: "addressBlock", dbColumn: "address_block" },
    { apiField: "logoAssetId", dbColumn: "logo_asset_id" },
  ],
  (row) => ({
    id: row.id,
    displayName: row.display_name,
    registrationNo: row.registration_no,
    taxNo: row.tax_no,
    addressBlock: row.address_block,
    logoAssetId: row.logo_asset_id,
    logoUrl: assetUrl(row.logo_asset_id),
    createdAt: row.created_at,
  }),
  (body, req) =>
    body.logoAssetId && !findOwnedAsset(req.organizationId, body.logoAssetId)
      ? "logoAssetId does not refer to an uploaded logo"
      : null
);
