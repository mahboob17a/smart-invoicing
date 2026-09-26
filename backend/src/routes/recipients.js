const makeListResource = require("./makeListResource");

module.exports = makeListResource(
  "recipients",
  [
    { apiField: "name", dbColumn: "name", required: true },
    // Short code for filenames, e.g. {RecipientCode} -> "ACME".
    { apiField: "code", dbColumn: "code" },
    { apiField: "address", dbColumn: "address" },
    { apiField: "taxNo", dbColumn: "tax_no" },
    { apiField: "notes", dbColumn: "notes" },
  ],
  (row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    address: row.address,
    taxNo: row.tax_no,
    notes: row.notes,
    createdAt: row.created_at,
  })
);
