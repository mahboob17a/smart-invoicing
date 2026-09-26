// Smart Invoicing — Phase 1 database layer.
//
// Uses better-sqlite3 for local development (zero external services to
// stand up). The schema below mirrors the data model in the design
// document exactly (Organization, User, CompanyProfile, IssuingIdentity,
// Recipient, ConversionRuleProfile, FilenamePattern, ReportTemplateConfig,
// plus an assets table for uploaded logos). Swapping to PostgreSQL in production
// means changing this file's connection logic only — every route in
// src/routes/ talks to the `db` object below, not to SQLite directly.

const Database = require("better-sqlite3");
const path = require("path");

// DATABASE_FILE=":memory:" gives the test suite a throwaway database.
const dbPath = process.env.DATABASE_FILE || path.join(__dirname, "../../dev.db");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subscription_plan TEXT NOT NULL DEFAULT 'trial',
  onboarding_complete INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_account_owner INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS company_profiles (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL UNIQUE REFERENCES organizations(id),
  legal_name TEXT NOT NULL,
  registration_no TEXT,
  tax_no TEXT,
  address_block TEXT,
  logo_asset_id TEXT REFERENCES assets(id),
  contact_details TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS issuing_identities (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  display_name TEXT NOT NULL,
  registration_no TEXT,
  tax_no TEXT,
  address_block TEXT,
  logo_asset_id TEXT REFERENCES assets(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recipients (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  address TEXT,
  tax_no TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversion_rule_profiles (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  markup_pct REAL NOT NULL,
  tax_pct REAL NOT NULL,
  tax_label TEXT NOT NULL DEFAULT 'VAT',
  currency_code TEXT NOT NULL DEFAULT 'OMR',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Uploaded files (logos today; template files in Phase 3). Bytes live in
-- file storage under an organization-namespaced key; this row is the
-- tenant-scoped handle every other table points at.
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  kind TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  storage_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS filename_patterns (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL UNIQUE REFERENCES organizations(id),
  pattern_string TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS report_template_configs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  title_text TEXT NOT NULL,
  columns_json TEXT NOT NULL,
  sort_field TEXT NOT NULL,
  sort_direction TEXT NOT NULL DEFAULT 'asc',
  group_field TEXT,
  show_totals_row INTEGER NOT NULL DEFAULT 1,
  undated_bills TEXT NOT NULL DEFAULT 'last',
  remarks_recipient_id TEXT REFERENCES recipients(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// CREATE TABLE IF NOT EXISTS never alters a table that already exists, so
// columns added after a table first shipped are added here instead. This
// keeps existing local dev.db files working without a manual reset.
function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn("company_profiles", "logo_asset_id", "TEXT REFERENCES assets(id)");
ensureColumn("issuing_identities", "logo_asset_id", "TEXT REFERENCES assets(id)");
ensureColumn("recipients", "code", "TEXT");
ensureColumn("conversion_rule_profiles", "decimal_places", "INTEGER NOT NULL DEFAULT 2");

module.exports = db;
