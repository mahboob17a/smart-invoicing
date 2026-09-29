const db = require("../db");
const makeListResource = require("./makeListResource");
const { badRequest } = require("../lib/http");

// Recipient = the customer's own client (Section 6.3). `code` is the short
// reference used by the {RecipientCode} filename placeholder, e.g. "UCN".
module.exports = makeListResource(
  "recipients",
  [
    { apiField: "name", dbColumn: "name", required: true, maxLength: 200 },
    {
      apiField: "code", dbColumn: "code", maxLength: 12,
      transform: (v) => v.toUpperCase(),
    },
    { apiField: "address", dbColumn: "address", maxLength: 500 },
    { apiField: "taxNo", dbColumn: "tax_no", maxLength: 50 },
    { apiField: "notes", dbColumn: "notes", maxLength: 1000 },
  ],
  (row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    address: row.address,
    taxNo: row.tax_no,
    notes: row.notes,
    createdAt: row.created_at,
  }),
  {
    label: "Recipient",
    async validate(values, { req, id }) {
      if (!values.code) return;
      if (!/^[A-Z0-9-]+$/.test(values.code))
        throw badRequest("Client code can only use letters, numbers and hyphens");
      const clash = await db.get(
        "SELECT id FROM recipients WHERE organization_id = ? AND code = ? AND id IS DISTINCT FROM ?",
        req.organizationId, values.code, id
      );
      if (clash) throw badRequest(`Client code ${values.code} is already used by another client`);
    },
  }
);
