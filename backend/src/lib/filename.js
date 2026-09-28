// Filename convention — Design Document v5.1, Section 6.6.
// {OriginalBillNo} identifies which vendor bill a file came from; it is not
// the invoice number. {InvoiceNo} is the app-assigned number (Section 6.8).

const PLACEHOLDERS = [
  "IssuingName", "RecipientCode", "RecipientName", "VendorName",
  "OriginalBillNo", "OriginalDate", "InvoiceNo", "Seq",
];
const DEFAULT_PATTERN = "{IssuingName}_Invoice_{RecipientCode}_{VendorName}_{OriginalBillNo}_{OriginalDate}";

function validatePattern(pattern) {
  const errors = [];
  if (typeof pattern !== "string" || !pattern.trim()) return ["Filename pattern is required"];
  if (pattern.length > 200) errors.push("Filename pattern is too long (200 characters max)");
  const used = [...pattern.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]);
  const unknown = used.filter((p) => !PLACEHOLDERS.includes(p));
  if (unknown.length) errors.push(`Unknown placeholder(s): ${unknown.map((u) => `{${u}}`).join(", ")}`);
  if (!used.some((p) => ["OriginalBillNo", "InvoiceNo", "Seq"].includes(p)))
    errors.push("Include {OriginalBillNo}, {InvoiceNo} or {Seq} so every file name is different");
  if (/[\\/:*?"<>|]/.test(pattern.replace(/\{[^}]*\}/g, "")))
    errors.push('Filename cannot contain \\ / : * ? " < > |');
  return errors;
}

// Keeps names safe on Windows, Android and iOS: drops illegal characters and
// spaces ("Gulf Hardware Trading" -> "GulfHardwareTrading").
function clean(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function renderFilename(pattern, values, extension = "pdf") {
  const base = pattern
    .replace(/\{([^}]*)\}/g, (_, k) => clean(values[k]))
    .replace(/_{2,}/g, "_")
    .replace(/^[_\-.]+|[_\-.]+$/g, "");
  return `${base || "invoice"}.${extension}`;
}

const SAMPLE_VALUES = {
  IssuingName: "Falaj",
  RecipientCode: "UCN",
  RecipientName: "University Campus North",
  VendorName: "Gulf Hardware",
  OriginalBillNo: "4471",
  OriginalDate: "2026-09-14",
  InvoiceNo: "INV-2026-0192",
  Seq: "0192",
};

module.exports = { PLACEHOLDERS, DEFAULT_PATTERN, validatePattern, renderFilename, SAMPLE_VALUES };
