const db = require("../db");
const makeListResource = require("./makeListResource");
const { badRequest } = require("../lib/http");

// Batch Report Template (Section 6.7) — first cut for Phase 1, used by
// report generation in Phase 5.
const COLUMNS = [
  "date", "original_bill_no", "invoice_no", "vendor", "description",
  "pre_tax_amount", "tax_amount", "discount", "grand_total", "remarks",
];
const SORT_FIELDS = ["date", "original_bill_no", "invoice_no", "vendor", "grand_total"];

const router = makeListResource(
  "report_template_configs",
  [
    { apiField: "name", dbColumn: "name", required: true, maxLength: 100 },
    { apiField: "titleText", dbColumn: "title_text", required: true, maxLength: 120 },
    { apiField: "columns", dbColumn: "columns_json", required: true, type: "json" },
    { apiField: "sortField", dbColumn: "sort_field", default: "date" },
    { apiField: "sortDir", dbColumn: "sort_dir", default: "asc" },
    { apiField: "groupField", dbColumn: "group_field" },
    { apiField: "undatedMode", dbColumn: "undated_mode", default: "last" },
    { apiField: "remarksRecipientId", dbColumn: "remarks_recipient_id" },
  ],
  (row) => ({
    id: row.id,
    name: row.name,
    titleText: row.title_text,
    columns: JSON.parse(row.columns_json),
    sortField: row.sort_field,
    sortDir: row.sort_dir,
    groupField: row.group_field,
    undatedMode: row.undated_mode,
    remarksRecipientId: row.remarks_recipient_id,
    createdAt: row.created_at,
  }),
  {
    label: "Report template",
    async validate(v, { req }) {
      const cols = JSON.parse(v.columns_json);
      if (!Array.isArray(cols) || cols.length === 0) throw badRequest("Pick at least one report column");
      const bad = cols.filter((c) => !COLUMNS.includes(c));
      if (bad.length) throw badRequest(`Unknown report column(s): ${bad.join(", ")}`);
      if (!SORT_FIELDS.includes(v.sort_field)) throw badRequest(`sortField must be one of ${SORT_FIELDS.join(", ")}`);
      if (!["asc", "desc"].includes(v.sort_dir)) throw badRequest("sortDir must be asc or desc");
      if (v.group_field && !SORT_FIELDS.includes(v.group_field)) throw badRequest("groupField is not a valid field");
      if (!["last", "exclude"].includes(v.undated_mode)) throw badRequest("undatedMode must be last or exclude");
      if (v.remarks_recipient_id) {
        const ok = await db.get("SELECT id FROM recipients WHERE id = ? AND organization_id = ?", v.remarks_recipient_id, req.organizationId);
        if (!ok) throw badRequest("That recipient does not exist in your account");
      }
    },
  }
);

router.COLUMNS = COLUMNS;
module.exports = router;
