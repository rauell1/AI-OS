import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { SCHEMA_SQL, MIGRATION_NAME } from "./schema";

// ---------------------------------------------------------------------------
// Unified database layer.
//
// Backend selection (env-driven, no code change required):
//   * DATABASE_URL unset, or file: -> embedded sql.js (SQLite/WASM) on disk.
//   * DATABASE_URL postgresql(s):// -> Neon PostgreSQL via node-postgres.
//
// Both backends expose the same async API and accept `?` positional
// placeholders (converted to $1.. for Postgres automatically).
// ---------------------------------------------------------------------------

export interface Database {
  query<T = Record<string, any>>(sql: string, params?: any[]): Promise<T[]>;
  get<T = Record<string, any>>(sql: string, params?: any[]): Promise<T | undefined>;
  run(sql: string, params?: any[]): Promise<{ changes: number }>;
  insert(table: string, row: Record<string, any>): Promise<string>;
  update(table: string, id: string, values: Record<string, any>): Promise<void>;
  del(table: string, id: string): Promise<void>;
  backend: "sqlite" | "postgres";
  close(): Promise<void>;
}

// Resolve a writable location for the embedded SQLite file.
//
// Serverless hosts (Vercel included) mount the deployment read-only and expose
// only os.tmpdir() for writes, so a fixed cwd/data path throws EROFS on the
// first query and takes down every page that touches the database. Preference
// order: explicit override -> cwd/data when it is actually writable -> tmpdir.
function resolveDataDir(): { dir: string; ephemeral: boolean } {
  const override = process.env.RAUELL_DATA_DIR;
  if (override) return { dir: override, ephemeral: false };
  const local = path.join(process.cwd(), "data");
  try {
    fs.mkdirSync(local, { recursive: true });
    fs.accessSync(local, fs.constants.W_OK);
    return { dir: local, ephemeral: false };
  } catch {
    return { dir: path.join(os.tmpdir(), "rauell-os"), ephemeral: true };
  }
}

const { dir: DATA_DIR, ephemeral: DATA_DIR_EPHEMERAL } = resolveDataDir();
const DB_FILE = path.join(DATA_DIR, "rauell.db");

// Data written to tmpdir does not survive a cold start. Warn once, loudly,
// rather than silently pretending the account someone just created is durable.
if (!isPostgres() && DATA_DIR_EPHEMERAL) {
  console.warn(
    "[rauell-os] No DATABASE_URL set and the deployment filesystem is read-only. " +
      "Falling back to ephemeral SQLite in " +
      DATA_DIR +
      " - accounts and data WILL be lost on the next cold start. " +
      "Set DATABASE_URL to a postgresql:// connection string for durable storage."
  );
}

function isPostgres(): boolean {
  const url = process.env.DATABASE_URL || "";
  return url.startsWith("postgresql://") || url.startsWith("postgres://");
}

// Locate sql.js's WASM binary without depending on process.cwd().
//
// The previous cwd-relative lookup silently failed in the serverless bundle,
// fell back to the bare filename, and aborted with ENOENT before any query ran
// - which is what made /register (and every other DB-backed page) return a
// server-side exception. require.resolve follows the real module location.
function resolveWasm(file: string): string {
  const candidates: string[] = [];
  try {
    const req = createRequire(import.meta.url);
    candidates.push(path.join(path.dirname(req.resolve("sql.js")), file));
  } catch {
    // require.resolve is unavailable in some bundling modes; fall through.
  }
  candidates.push(path.join(process.cwd(), "node_modules", "sql.js", "dist", file));
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return file;
}

function splitStatements(sql: string): string[] {
  return sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function toPg(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// --- sql.js (SQLite/WASM) backend ------------------------------------------
class SqlJsDatabase implements Database {
  static persistWarned = false;
  backend = "sqlite" as const;
  private db: any;
  private persistTimer: NodeJS.Timeout | null = null;

  constructor(db: any) {
    this.db = db;
  }

  private bind(stmt: any, params?: any[]) {
    if (params && params.length) stmt.bind(params);
  }

  async query<T = Record<string, any>>(sql: string, params?: any[]): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    this.bind(stmt, params);
    const rows: T[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  async get<T = Record<string, any>>(sql: string, params?: any[]): Promise<T | undefined> {
    const stmt = this.db.prepare(sql);
    this.bind(stmt, params);
    let row: T | undefined;
    if (stmt.step()) row = stmt.getAsObject() as T;
    stmt.free();
    return row;
  }

  async run(sql: string, params?: any[]): Promise<{ changes: number }> {
    this.db.run(sql, params || []);
    const changes = this.db.getRowsModified();
    this.persist();
    return { changes };
  }

  async insert(table: string, row: Record<string, any>): Promise<string> {
    const id = row.id || randomUUID();
    const cols = Object.keys(row);
    const vals = cols.map((c) => row[c]);
    const sql = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols
      .map(() => "?")
      .join(", ")})`;
    await this.run(sql, vals);
    return id;
  }

  async update(table: string, id: string, values: Record<string, any>): Promise<void> {
    const cols = Object.keys(values);
    const vals = cols.map((c) => values[c]);
    const sql = `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`;
    await this.run(sql, [...vals, id]);
  }

  async del(table: string, id: string): Promise<void> {
    await this.run(`DELETE FROM ${table} WHERE id = ?`, [id]);
  }

  persist() {
    // Every run() persists, so a write failure here would surface as a 500 on
    // any page that touches the database. Keep serving from the in-memory
    // instance instead and report the loss of durability once.
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      const data = this.db.export();
      fs.writeFileSync(DB_FILE, Buffer.from(data));
    } catch (err: any) {
      if (!SqlJsDatabase.persistWarned) {
        SqlJsDatabase.persistWarned = true;
        console.error(
          `[rauell-os] Cannot persist the SQLite file to ${DB_FILE} (${err?.code || err?.message}). ` +
            "Running in-memory only; data will not survive this instance. Set DATABASE_URL for durable storage."
        );
      }
    }
  }

  async close() {
    this.persist();
  }
}

// --- node-postgres (Neon) backend ------------------------------------------
class PgDatabase implements Database {
  backend = "postgres" as const;
  private pool: any;

  constructor(pool: any) {
    this.pool = pool;
  }

  async query<T = Record<string, any>>(sql: string, params?: any[]): Promise<T[]> {
    const res = await this.pool.query(toPg(sql), params || []);
    return res.rows as T[];
  }

  async get<T = Record<string, any>>(sql: string, params?: any[]): Promise<T | undefined> {
    const res = await this.pool.query(toPg(sql), params || []);
    return (res.rows[0] as T) || undefined;
  }

  async run(sql: string, params?: any[]): Promise<{ changes: number }> {
    const res = await this.pool.query(toPg(sql), params || []);
    return { changes: res.rowCount ?? 0 };
  }

  async insert(table: string, row: Record<string, any>): Promise<string> {
    const id = row.id || randomUUID();
    const cols = Object.keys(row);
    const vals = cols.map((c) => row[c]);
    const sql = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols
      .map(() => "?")
      .join(", ")})`;
    await this.run(sql, vals);
    return id;
  }

  async update(table: string, id: string, values: Record<string, any>): Promise<void> {
    const cols = Object.keys(values);
    const vals = cols.map((c) => values[c]);
    const sql = `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`;
    await this.run(sql, [...vals, id]);
  }

  async del(table: string, id: string): Promise<void> {
    await this.run(`DELETE FROM ${table} WHERE id = ?`, [id]);
  }

  async close() {
    await this.pool.end();
  }
}

// --- Singleton bootstrap ---------------------------------------------------
declare global {
  // eslint-disable-next-line no-var
  var __RAUELL_DB__: Promise<Database> | undefined;
}

async function bootstrap(): Promise<Database> {
  if (isPostgres()) {
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
    const db = new PgDatabase(pool);
    for (const stmt of splitStatements(SCHEMA_SQL)) await db.run(stmt);
    await db.run(
      `INSERT INTO _migrations (name, applied_at) VALUES (?, ?) ON CONFLICT DO NOTHING`,
      [MIGRATION_NAME, new Date().toISOString()]
    );
    return db;
  }

  const initSqlJs = (await import("sql.js")).default;
  const SQL = await initSqlJs({ locateFile: (file: string) => resolveWasm(file) });
  let instance: any;
  if (fs.existsSync(DB_FILE)) {
    instance = new SQL.Database(fs.readFileSync(DB_FILE));
  } else {
    instance = new SQL.Database();
  }
  const db = new SqlJsDatabase(instance);
  for (const stmt of splitStatements(SCHEMA_SQL)) await db.run(stmt);
  await db.run(`INSERT OR IGNORE INTO _migrations (name, applied_at) VALUES (?, ?)`, [
    MIGRATION_NAME,
    new Date().toISOString(),
  ]);
  db.persist();
  return db;
}

export function getDb(): Promise<Database> {
  if (!globalThis.__RAUELL_DB__) {
    globalThis.__RAUELL_DB__ = bootstrap();
  }
  return globalThis.__RAUELL_DB__;
}

// Force a disk flush for the embedded backend (used after bulk operations).
export async function flushDb() {
  const db = await getDb();
  if (db.backend === "sqlite") (db as SqlJsDatabase).persist();
}
