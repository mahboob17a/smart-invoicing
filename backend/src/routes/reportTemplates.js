const express = require("express");
const { randomUUID } = require("crypto");
const db = require("../db");

const router = express.Router();

// Batch Report Template (design doc Section 6.7). The column set is fixed
// here so Phase 5 report generation only ever sees columns it knows how
// to fill.
const REPORT_COLUMNS = [
  { key: "date", label: "Date" },
  { key: "originalBillNo", label: "Original bill no." },
  { key: "vendorName", label: "Vendor" },
  { key: "description", label: "Description" },
  { key: "invoiceNo", label: "Invoice no." },
  { key: "preTaxAmount", label: "Pre-tax amount" },
  { key: "taxAmount", label: "Tax amount" },
  { key: "discount", label: "Discount" },
  { key: "grandTotal", label: "Grand total" },
  { key: "remarks", label: "Remarks" },
];
const COLUMN_KEYS = new Set(REPORT_COLUMNS.map((c) => c.key));
// Grouping by a free-text or money column makes no sense; these can.
const GROUPABLE = new Set(["date", "vendorName"]);

const DEFAULTS = {
  name: "Standard summary",
  titleText: "Purchase Summary",
  columns: ["date", "originalBillNo", "vendorName", "preTaxAmount", "taxAmount", "grandTotal"],
  sortField: "date",
  sortDirection: "asc",
  groupField: null,
  showTotalsRow: true,
  undatedBills: "last",
};

function toApi(row) {
  return {
    id: row.id,
    name: row.name,
    titleText: row.title_text,
    columns: JSON.parse(row.columns_json),
    sortField: row.sort_field,
    sortDirection: row.sort_direction,
    groupField: row.group_field,
    showTotalsRow: !!row.show_totals_row,
    undatedBills: row.undated_bills,
    remarksRecipientId: row.remarks_recipient_id,
    createdAt: row.created_at,
  };
}

function validate(body, organizationId) {
  const { name, titleText, columns, sortField, sortDirection, groupField, showTotalsRow,
    undatedBills, remarksRecipientId } = body;

  if (!name || !titleText) return "name and titleText are required";
  if (!Array.isArray(columns) || columns.length === 0) {
    return "columns must be a non-empty list";
  }
  const unknown = columns.filter((c) => !COLUMN_KEYS.has(c));
  if (unknown.length) return `Unknown column(s): ${unknown.join(", ")}`;
  if (new Set(columns).size !== columns.length) return "columns must not repeat";
  if (!columns.includes(sortField)) return "sortField must be one of the selected columns";
  if (!["asc", "desc"].includes(sortDirection)) return "sortDirection must be asc or desc";
  if (groupField != null && !(GROUPABLE.has(groupField) && columns.includes(groupField))) {
    return "groupField must be a selected date or vendor column, or null";
  }
  if (typeof showTotalsRow !== "boolean") return "showTotalsRow must be true or false";
  if (!["last", "exclude"].includes(undatedBills)) return "undatedBills must be last or exclude";
  if (remarksRecipientId != null) {
    // Must be this organization's own recipient — never another tenant's.
    const recipient = db
      .prepare("SELECT id FROM recipients WHERE id = ? AND organization_id = ?")
      .get(remarksRecipientId, organizationId);
    if (!recipient) return "remarksRecipientId does not refer to one of your recipients";
  }
  return null;
}

// GET /api/report-templates/options — columns and defaults for the form.
router.get("/options", (req, res) => {
  res.json({ columns: REPORT_COLUMNS, groupableColumns: [...GROUPABLE], defaults: DEFAULTS });
});

router.get("/", (req, res) => {
  const rows = db
    .prepare(
      "SELECT * FROM report_template_configs WHERE organization_id = ? ORDER BY created_at DESC"
    )
    .all(req.organizationId);
  res.json(rows.map(toApi));
});

router.post("/", (req, res) => {
  const body = { ...DEFAULTS, ...(req.body || {}) };
  const error = validate(body, req.organizationId);
  if (error) return res.status(400).json({ error });

  const id = randomUUID();
  db.prepare(
    `INSERT INTO report_template_configs
      (id, organization_id, name, title_text, columns_json, sort_field, sort_direction,
       group_field, show_totals_row, undated_bills, remarks_recipient_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    req.organizationId,
    body.name,
    body.titleText,
    JSON.stringify(body.columns),
    body.sortField,
    body.sortDirection,
    body.groupField ?? null,
    body.showTotalsRow ? 1 : 0,
    body.undatedBills,
    body.remarksRecipientId ?? null
  );

  const saved = db.prepare("SELECT * FROM report_template_configs WHERE id = ?").get(id);
  res.status(201).json(toApi(saved));
});

router.delete("/:id", (req, res) => {
  const info = db
    .prepare("DELETE FROM report_template_configs WHERE id = ? AND organization_id = ?")
    .run(req.params.id, req.organizationId);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.status(204).send();
});

module.exports = router;
