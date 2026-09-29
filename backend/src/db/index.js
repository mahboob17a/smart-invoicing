// Smart Invoicing — database layer (PostgreSQL).
//
// Production: Supabase Postgres, via DATABASE_URL (use the Supabase "Session
// pooler" connection string). Local development and tests: PGlite, a real
// Postgres running inside Node — no install needed. Its data lives in
// backend/.pgdata (DATABASE_DIR), or in memory with DATABASE_DIR=memory.
//
// Routes use four async helpers; `?` placeholders are converted to $1, $2…
//   await db.get(sql, ...params)   -> first row or undefined
//   await db.all(sql, ...params)   -> rows
//   await db.run(sql, ...params)   -> { changes }
//   await db.tx(async () => {...}) -> runs everything inside one transaction
// Inside db.tx, the helpers automatically use the transaction's connection
// (AsyncLocalStorage), so library code does not need a client passed in.

const fs = require("fs");
const path = require("path");
const { AsyncLocalStorage } = require("async_hooks");

const als = new AsyncLocalStorage();
const toPg = (sql) => {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
};

let driver; // { query(sql, params) -> { rows, rowCount }, exec(sql), transaction(fn), close() }
let kind;

function pgDriver(url) {
  const pg = require("pg");
  // COUNT/SUM come back as bigint/numeric; the app works with plain numbers.
  pg.types.setTypeParser(20, (v) => Number(v));
  pg.types.setTypeParser(1700, (v) => Number(v));
  const ssl = /localhost|127\.0\.0\.1/.test(url) || process.env.DATABASE_SSL === "off" ? false : { rejectUnauthorized: false };
  const pool = new pg.Pool({ connectionString: url, ssl, max: Number(process.env.DATABASE_POOL_SIZE || 5) });
  const wrap = (c) => ({
    query: async (sql, params) => { const r = await c.query(sql, params); return { rows: r.rows, rowCount: r.rowCount }; },
    exec: (sql) => c.query(sql), // no parameters -> simple protocol, several statements allowed
  });
  return {
    ...wrap(pool),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const out = await fn(wrap(client));
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

function pgliteDriver(dir) {
  const { PGlite } = require("@electric-sql/pglite");
  if (dir !== "memory") fs.mkdirSync(dir, { recursive: true });
  const lite = new PGlite(dir === "memory" ? undefined : dir);
  const wrap = (c) => ({
    query: async (sql, params) => { const r = await c.query(sql, params); return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }; },
    exec: (sql) => c.exec(sql),
  });
  return {
    ...wrap(lite),
    transaction: (fn) => lite.transaction((tx) => fn(wrap(tx))),
    close: () => lite.close(),
  };
}

// Schema versions. 1 = everything up to Phase 4 (see schema.sql). Add new
// entries for later changes; each runs once and is recorded.
const migrations = [
  { id: 1, name: "schema up to phase 4", sql: () => fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8") },
];

async function migrate() {
  await driver.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const done = new Set((await driver.query("SELECT id FROM schema_migrations", [])).rows.map((r) => r.id));
  for (const m of migrations) {
    if (done.has(m.id)) continue;
    await driver.transaction(async (t) => {
      await t.exec(m.sql());
      await t.query("INSERT INTO schema_migrations (id, name) VALUES ($1, $2)", [m.id, m.name]);
    });
  }
}

const ready = (async () => {
  if (process.env.DATABASE_URL) {
    kind = "postgres";
    driver = pgDriver(process.env.DATABASE_URL);
  } else {
    kind = "pglite";
    driver = pgliteDriver(process.env.DATABASE_DIR || path.join(__dirname, "../../.pgdata"));
  }
  await migrate();
})();
ready.catch(() => {}); // reported by whoever awaits db.ready

async function query(sql, params) {
  await ready;
  const c = als.getStore() || driver;
  return c.query(toPg(sql), params.map((p) => (p === undefined ? null : p)));
}

const db = {
  ready,
  kind: () => kind,
  async get(sql, ...params) { return (await query(sql, params)).rows[0]; },
  async all(sql, ...params) { return (await query(sql, params)).rows; },
  async run(sql, ...params) { return { changes: (await query(sql, params)).rowCount }; },
  /** Runs fn inside one transaction; nested calls join the outer one. */
  async tx(fn) {
    await ready;
    if (als.getStore()) return fn();
    return driver.transaction((t) => als.run(t, fn));
  },
  async close() { await ready.catch(() => {}); if (driver) await driver.close(); },
  /** True when a Postgres error is a unique-constraint violation. */
  isUniqueViolation: (e) => e && (e.code === "23505" || /duplicate key value/.test(e.message || "")),
};

module.exports = db;
