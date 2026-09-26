const makeListResource = require("./makeListResource");

module.exports = makeListResource(
  "issuing_identities",
  [
    { apiField: "displayName", dbColumn: "display_name", required: true },
    { apiField: "registrationNo", dbColumn: "registration_no" },
    { apiField: "taxNo", dbColumn: "tax_no" },
    { apiField: "addressBlock", dbColumn: "address_block" },
    { apiField: "logoAssetUrl", dbColumn: "logo_asset_url" },
  ],
  (row) => ({
    id: row.id,
    displayName: row.display_name,
    registrationNo: row.registration_no,
    taxNo: row.tax_no,
    addressBlock: row.address_block,
    logoAssetUrl: row.logo_asset_url,
    createdAt: row.created_at,
  })
);
