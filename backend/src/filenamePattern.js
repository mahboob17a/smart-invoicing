// Filename Convention (design doc Section 6.6).
//
// This is the single definition of which placeholders a filename pattern
// may use. The mobile form fetches this list (with sample values) to build
// its placeholder chips and live preview, and Phase 4 invoice generation
// will call renderFilename() with real bill data — so the preview a
// customer sees during onboarding is produced by the same code that will
// name their files.

const PLACEHOLDERS = [
  { token: "IssuingName", label: "Issuing identity", sample: "Acme Trading" },
  { token: "RecipientName", label: "Recipient name", sample: "Northwind Projects" },
  { token: "RecipientCode", label: "Recipient code", sample: "NWP" },
  { token: "VendorName", label: "Vendor name", sample: "City Hardware" },
  { token: "OriginalBillNo", label: "Original bill number", sample: "INV-4471" },
  { token: "OriginalDate", label: "Original bill date", sample: "2026-03-14" },
  { token: "InvoiceNo", label: "Generated invoice number", sample: "0042" },
  { token: "Seq", label: "Sequence number", sample: "7" },
];

const DEFAULT_PATTERN = "{IssuingName}_Invoice_{RecipientCode}_{VendorName}_{OriginalBillNo}_{OriginalDate}";

const KNOWN = new Set(PLACEHOLDERS.map((p) => p.token));
const TOKEN_RE = /\{([^{}]*)\}/g;
const MAX_PATTERN_LENGTH = 200;

/** Returns an error message, or null if the pattern is usable. */
function validatePattern(pattern) {
  if (typeof pattern !== "string" || !pattern.trim()) {
    return "patternString is required";
  }
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return `patternString must be ${MAX_PATTERN_LENGTH} characters or fewer`;
  }
  const unknown = [...pattern.matchAll(TOKEN_RE)]
    .map((m) => m[1])
    .filter((token) => !KNOWN.has(token));
  if (unknown.length) {
    return `Unknown placeholder(s): ${unknown.map((t) => `{${t}}`).join(", ")}`;
  }
  // Braces left over once every {Token} is removed mean a typo like
  // "{VendorName" that would otherwise leak into real filenames.
  if (/[{}]/.test(pattern.replace(TOKEN_RE, ""))) {
    return "patternString has an unmatched { or }";
  }
  // (Not TOKEN_RE.test: .test on a /g regex mutates its shared lastIndex.)
  if (!/\{[^{}]*\}/.test(pattern)) {
    return "patternString must include at least one placeholder, or every file gets the same name";
  }
  return null;
}

// Characters that are invalid in filenames on Windows, macOS, Android or iOS.
function sanitizeSegment(value) {
  return String(value ?? "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fills a validated pattern's placeholders. Missing values become empty. */
function renderFilename(pattern, values) {
  const filled = pattern.replace(TOKEN_RE, (_, token) => sanitizeSegment(values[token]));
  return sanitizeSegment(filled).replace(/^\.+/, "") || "invoice";
}

function sampleValues() {
  return Object.fromEntries(PLACEHOLDERS.map((p) => [p.token, p.sample]));
}

module.exports = { PLACEHOLDERS, DEFAULT_PATTERN, validatePattern, renderFilename, sampleValues };
