// Smart Invoicing — Phase 1 database layer.
//
// Uses better-sqlite3 for local development (zero external services to
// stand up). The schema below mirrors the data model in the design
// document exactly (Organization, User, CompanyProfile, IssuingIdentity,
// Recipient, ConversionRuleProfile). Swapping to PostgreSQL in production
// means changing this file's connection logic only — every route in
// src/routes/ talks to the `db` object below, not to SQLite directly.

const Database = require("better-sqlite3");
const path = require("path");

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
  logo_asset_url TEXT,
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
  logo_asset_url TEXT,
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
`);

module.exports = db;
