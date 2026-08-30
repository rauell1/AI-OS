import fs from "node:fs";
import path from "node:path";
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

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "rauell.db");

function isPostgres(): boolean {
  const url = process.env.DATABASE_URL || "";
  return url.startsWith("postgresql://") || url.startsWith("postgres://");
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
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const data = this.db.export();
    fs.writeFileSync(DB_FILE, Buffer.from(data));
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
  const wasmPath = path.join(process.cwd(), "node_modules", "sql.js", "dist", "sql-wasm.wasm");
  const SQL = await initSqlJs({ locateFile: () => (fs.existsSync(wasmPath) ? wasmPath : "sql-wasm.wasm") });
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
