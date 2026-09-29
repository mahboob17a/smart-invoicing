-- Smart Invoicing — PostgreSQL schema (Design Document v5.1, Section 10).
-- Runs on Supabase Postgres in production and on PGlite (Postgres in-process)
-- for local development and tests. Every tenant-owned table carries
-- organization_id. Timestamps are stored as UTC text 'YYYY-MM-DD HH:MM:SS'
-- (same format the app has used since Phase 1).

CREATE OR REPLACE FUNCTION utc_now() RETURNS text LANGUAGE sql VOLATILE AS
  $$ SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') $$;
-- Millisecond precision, used where two changes in the same second must differ.
CREATE OR REPLACE FUNCTION utc_now_ms() RETURNS text LANGUAGE sql VOLATILE AS
  $$ SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.MS') $$;


CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        subscription_plan TEXT NOT NULL DEFAULT 'trial',
        onboarding_complete INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (utc_now())
      );
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id),
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        is_account_owner INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (utc_now())
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
        updated_at TEXT NOT NULL DEFAULT (utc_now())
      );
      CREATE TABLE IF NOT EXISTS issuing_identities (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id),
        display_name TEXT NOT NULL,
        registration_no TEXT,
        tax_no TEXT,
        address_block TEXT,
        logo_asset_url TEXT,
        created_at TEXT NOT NULL DEFAULT (utc_now())
      );
      CREATE TABLE IF NOT EXISTS recipients (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id),
        name TEXT NOT NULL,
        address TEXT,
        tax_no TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (utc_now())
      );
      CREATE TABLE IF NOT EXISTS conversion_rule_profiles (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id),
        name TEXT NOT NULL,
        markup_pct DOUBLE PRECISION NOT NULL,
        tax_pct DOUBLE PRECISION NOT NULL,
        tax_label TEXT NOT NULL DEFAULT 'VAT',
        currency_code TEXT NOT NULL DEFAULT 'OMR',
        created_at TEXT NOT NULL DEFAULT (utc_now())
      );

ALTER TABLE recipients ADD COLUMN IF NOT EXISTS code TEXT;

ALTER TABLE recipients ADD COLUMN IF NOT EXISTS updated_at TEXT;

ALTER TABLE issuing_identities ADD COLUMN IF NOT EXISTS same_as_company INTEGER NOT NULL DEFAULT 0;

ALTER TABLE issuing_identities ADD COLUMN IF NOT EXISTS updated_at TEXT;

ALTER TABLE conversion_rule_profiles ADD COLUMN IF NOT EXISTS decimal_places INTEGER NOT NULL DEFAULT 3;

ALTER TABLE conversion_rule_profiles ADD COLUMN IF NOT EXISTS updated_at TEXT;

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS invoice_numbering_scope TEXT NOT NULL DEFAULT 'per_identity';

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
        created_at TEXT NOT NULL DEFAULT (utc_now()),
        updated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_series_org ON invoice_number_series(organization_id);

      CREATE TABLE IF NOT EXISTS filename_patterns (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL UNIQUE REFERENCES organizations(id),
        pattern_string TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (utc_now())
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
        created_at TEXT NOT NULL DEFAULT (utc_now()),
        updated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_report_org ON report_template_configs(organization_id);

CREATE TABLE IF NOT EXISTS vendors (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id),
        name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        default_category TEXT,
        created_at TEXT NOT NULL DEFAULT (utc_now()),
        UNIQUE (organization_id, normalized_name)
      );
-- status: processing -> needs_review -> draft (reviewed, save-ready).
-- failed = extraction error; the bill can still be completed by hand.
-- original_bill_no is the vendor's own number (identification + filename
-- only, Design Document v5.1 §8.8). It is never the invoice number.
      CREATE TABLE IF NOT EXISTS bills (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id),
        vendor_id TEXT REFERENCES vendors(id),
        vendor_name TEXT,
        recipient_id TEXT REFERENCES recipients(id) ON DELETE SET NULL,
        conversion_rule_id TEXT REFERENCES conversion_rule_profiles(id) ON DELETE SET NULL,
        original_bill_no TEXT,
        original_bill_no_key TEXT,
        original_date TEXT,
        currency_code TEXT,
        printed_total DOUBLE PRECISION,
        status TEXT NOT NULL DEFAULT 'processing'
          CHECK (status IN ('processing','needs_review','draft','failed')),
        flags_json TEXT NOT NULL DEFAULT '{}',
        extraction_json TEXT,
        extraction_confidence DOUBLE PRECISION,
        extraction_provider TEXT,
        extraction_model TEXT,
        extraction_error TEXT,
        extraction_ms INTEGER,
        created_by TEXT REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (utc_now()),
        updated_at TEXT,
        reviewed_at TEXT,
        reviewed_by TEXT REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_bills_org_status ON bills(organization_id, status);
      CREATE INDEX IF NOT EXISTS idx_bills_dup ON bills(organization_id, original_bill_no_key);

      CREATE TABLE IF NOT EXISTS bill_files (
        id TEXT PRIMARY KEY,
        bill_id TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
        organization_id TEXT NOT NULL REFERENCES organizations(id),
        storage_key TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        page_index INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (utc_now())
      );
      CREATE INDEX IF NOT EXISTS idx_bill_files_bill ON bill_files(bill_id);

      CREATE TABLE IF NOT EXISTS bill_line_items (
        id TEXT PRIMARY KEY,
        bill_id TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
        organization_id TEXT NOT NULL REFERENCES organizations(id),
        position INTEGER NOT NULL,
        description TEXT,
        qty DOUBLE PRECISION,
        unit TEXT,
        original_rate DOUBLE PRECISION,
        amount DOUBLE PRECISION,
        flagged_unclear INTEGER NOT NULL DEFAULT 0,
        flag_reason TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_items_bill ON bill_line_items(bill_id);

CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id),
        name TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('builder','uploaded')),
        is_default INTEGER NOT NULL DEFAULT 0,
        config_json TEXT,
        current_version INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','needs_mapping')),
        created_by TEXT REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (utc_now()),
        updated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_templates_org ON templates(organization_id);
-- Every uploaded .docx is kept. Invoices generated in Phase 4 record the
-- version they used, so a later re-upload never changes them (§7.4, §12).
      CREATE TABLE IF NOT EXISTS template_files (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
        organization_id TEXT NOT NULL REFERENCES organizations(id),
        version INTEGER NOT NULL,
        storage_key TEXT NOT NULL,
        original_filename TEXT,
        size_bytes INTEGER NOT NULL,
        tokens_json TEXT NOT NULL,
        loop_name TEXT,
        uploaded_by TEXT REFERENCES users(id),
        uploaded_at TEXT NOT NULL DEFAULT (utc_now()),
        UNIQUE (template_id, version)
      );
-- system_field NULL = "leave as written" (§7.2).
      CREATE TABLE IF NOT EXISTS template_field_mappings (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
        token_name TEXT NOT NULL,
        is_line_item INTEGER NOT NULL DEFAULT 0,
        system_field TEXT,
        UNIQUE (template_id, token_name, is_line_item)
      );

CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id),
        bill_id TEXT NOT NULL REFERENCES bills(id),
        issuing_identity_id TEXT REFERENCES issuing_identities(id) ON DELETE SET NULL,
        series_id TEXT REFERENCES invoice_number_series(id) ON DELETE SET NULL,
        invoice_no TEXT,
        seq INTEGER,
        invoice_date TEXT NOT NULL,
        recipient_id TEXT REFERENCES recipients(id) ON DELETE SET NULL,
        conversion_rule_id TEXT REFERENCES conversion_rule_profiles(id) ON DELETE SET NULL,
        template_id TEXT REFERENCES templates(id) ON DELETE SET NULL,
        template_version INTEGER,
        template_name TEXT,
        values_json TEXT,
        currency_code TEXT,
        subtotal TEXT,
        tax_amount TEXT,
        grand_total TEXT,
        filename_base TEXT,
        docx_storage_key TEXT,
        pdf_storage_key TEXT,
        pdf_error TEXT,
        status TEXT NOT NULL DEFAULT 'generating' CHECK (status IN ('generating','ready','failed')),
        error TEXT,
        generation_count INTEGER NOT NULL DEFAULT 0,
        created_by TEXT REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (utc_now()),
        generated_at TEXT,
        bill_reviewed_at TEXT,
        updated_at TEXT,
        UNIQUE (organization_id, bill_id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_number
        ON invoices(organization_id, series_id, invoice_no) WHERE invoice_no IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(organization_id, created_at);