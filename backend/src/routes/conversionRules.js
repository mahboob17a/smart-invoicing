const makeListResource = require("./makeListResource");

// Conversion Rule Profile (Section 6.4). Percentages are whole-number style:
// 15 means 15 %. decimalPlaces sets rounding for amounts (OMR uses 3).
module.exports = makeListResource(
  "conversion_rule_profiles",
  [
    { apiField: "name", dbColumn: "name", required: true, maxLength: 100 },
    { apiField: "markupPct", dbColumn: "markup_pct", required: true, type: "number", min: 0, max: 1000 },
    { apiField: "taxPct", dbColumn: "tax_pct", required: true, type: "number", min: 0, max: 100 },
    { apiField: "taxLabel", dbColumn: "tax_label", default: "VAT", maxLength: 20 },
    {
      apiField: "currencyCode", dbColumn: "currency_code", default: "OMR", maxLength: 3,
      transform: (v) => v.toUpperCase(),
    },
    { apiField: "decimalPlaces", dbColumn: "decimal_places", type: "int", min: 0, max: 4, default: 3 },
  ],
  (row) => ({
    id: row.id,
    name: row.name,
    markupPct: row.markup_pct,
    taxPct: row.tax_pct,
    taxLabel: row.tax_label,
    currencyCode: row.currency_code,
    decimalPlaces: row.decimal_places,
    createdAt: row.created_at,
  }),
  {
    label: "Conversion rule",
    validate(values) {
      if (values.currency_code && !/^[A-Z]{3}$/.test(values.currency_code)) {
        const { badRequest } = require("../lib/http");
        throw badRequest("currencyCode must be a 3-letter ISO code such as OMR, AED or USD");
      }
    },
  }
);
