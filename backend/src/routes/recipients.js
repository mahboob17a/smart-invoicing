const makeListResource = require("./makeListResource");

module.exports = makeListResource(
  "recipients",
  [
    { apiField: "name", dbColumn: "name", required: true },
    { apiField: "address", dbColumn: "address" },
    { apiField: "taxNo", dbColumn: "tax_no" },
    { apiField: "notes", dbColumn: "notes" },
  ],
  (row) => ({
    id: row.id,
    name: row.name,
    address: row.address,
    taxNo: row.tax_no,
    notes: row.notes,
    createdAt: row.created_at,
  })
);
