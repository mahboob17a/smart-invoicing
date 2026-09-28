// Smart Invoicing — database layer.
//
// better-sqlite3 for local development (no external services to stand up).
// Tables mirror the data model in Design Document v5.1, Section 10. Every
// tenant-owned table carries organization_id. Swapping to PostgreSQL later
// means changing this file's connection logic and the SQL dialect of the
// migrations below; routes talk to the `db` object only.
//
// Migrations are applied in order and recorded in schema_migrations, so an
// existing dev.db from Weeks 1–2 is upgraded in place instead of recreated.

const Database = require("better-sqlite3");
const path = require("path");

const dbPath = process.env.DATABASE_FILE || path.join(__dirname, "../../dev.db");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function hasColumn(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}
function addColumn(table, column, definition) {
  if (!hasColumn(table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

const migrations = [
  {
    id: 1,
    name: "weeks 1-2 base schema",
    up() {
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
      );`);
    },
  },
  {
    id: 2,
    name: "week 3: numbering, filename pattern, report layout, recipient code, decimals",
    up() {
      addColumn("recipients", "code", "TEXT");
      addColumn("recipients", "updated_at", "TEXT");
      addColumn("issuing_identities", "same_as_company", "INTEGER NOT NULL DEFAULT 0");
      addColumn("issuing_identities", "updated_at", "TEXT");
      addColumn("conversion_rule_profiles", "decimal_places", "INTEGER NOT NULL DEFAULT 3");
      addColumn("conversion_rule_profiles", "updated_at", "TEXT");
      addColumn("organizations", "invoice_numbering_scope", "TEXT NOT NULL DEFAULT 'per_identity'");

      db.exec(`
      CREATE TABLE IF NOT EXISTS invoice_number_series (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id),
        issuing_identity_id TEXT REFERENCES issuing_identities(id) ON DELETE CASCADE,
        mode TEXT NOT NULL DEFAULT 'auto' CHECK (mode IN ('auto','blank')),
        format_pattern TEXT NOT NULL DEFAULT '{Prefix}-{YYYY}-{Seq}',
        prefix TEXT NOT NULL DEFAULT 'INV',
        padding INTEGER NOT NULL DEFAULT 4,
        start_number INTEGER NOT NULL DEFAULT 1,
        next_number INTEGER NOT NULL DEFAULT 1,
        reset_rule TEXT NOT NULL DEFAULT 'never' CHECK (reset_rule IN ('never','yearly','monthly')),
        period_key TEXT,
        last_issued_number INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_series_org ON invoice_number_series(organization_id);

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
        sort_field TEXT NOT NULL DEFAULT 'date',
        sort_dir TEXT NOT NULL DEFAULT 'asc' CHECK (sort_dir IN ('asc','desc')),
        group_field TEXT,
        undated_mode TEXT NOT NULL DEFAULT 'last' CHECK (undated_mode IN ('last','exclude')),
        remarks_recipient_id TEXT REFERENCES recipients(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_report_org ON report_template_configs(organization_id);`);
    },
  },
];

db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`);
const applied = new Set(db.prepare("SELECT id FROM schema_migrations").all().map((r) => r.id));
for (const m of migrations) {
  if (applied.has(m.id)) continue;
  db.transaction(() => {
    m.up();
    db.prepare("INSERT INTO schema_migrations (id, name) VALUES (?, ?)").run(m.id, m.name);
  })();
}

module.exports = db;
