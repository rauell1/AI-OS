import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { SCHEMA_SQL, MIGRATION_NAME } from "./schema";
import { RLS_SQL } from "./rls";
import { SESSION_COOKIE, verifySession } from "./session";

// --- Request-scoped database context ---------------------------------------
//
// Row Level Security needs to know who is asking. The context is carried in
// async local storage so it follows a request through server components and
// actions without threading a user argument through every call site.

export interface DbContext {
  userId?: string;
  system?: boolean;
}

const dbContext = new AsyncLocalStorage<DbContext>();

export function currentDbContext(): DbContext | undefined {
  return dbContext.getStore();
}

/** Run with the signed-in user's scope. RLS restricts rows to that user. */
export function runAsUser<R>(userId: string, fn: () => R): R {
  return dbContext.run({ userId }, fn);
}

/**
 * Run without a user, for the few operations that legitimately need it:
 * login lookup, registration, the cron owner lookup and schema bootstrap.
 * Feature code must never use this - it bypasses row scoping entirely.
 */
export function runAsSystem<R>(fn: () => R): R {
  return dbContext.run({ system: true }, fn);
}

/**
 * Resolve the scope for a query.
 *
 * An explicit runAsUser/runAsSystem wrapper always wins. Otherwise the signed-in
 * user is read from the session cookie at the moment of the query.
 *
 * Deriving it here rather than at each call site is deliberate: AsyncLocalStorage
 * set via enterWith() inside an auth helper does NOT survive the await back into
 * the calling page, so a context established there would be silently lost and
 * every page would fail closed. Resolving at the point of use also means a new
 * call site cannot forget to establish scope - which is the very mistake RLS
 * exists to contain.
 */
async function resolveContext(): Promise<DbContext | undefined> {
  const explicit = dbContext.getStore();
  if (explicit) return explicit;
  try {
    // Imported lazily: this module also runs in plain scripts, where
    // next/headers does not exist and cookies() has no request to read.
    const { cookies } = await import("next/headers");
    const token = cookies().get(SESSION_COOKIE)?.value;
    const user = await verifySession(token);
    if (user) return { userId: user.id };
  } catch {
    // Outside a request scope (scripts, bootstrap). Callers there must wrap
    // explicitly, and the guard below reports it if they have not.
  }
  return undefined;
}

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

  // Row Level Security policies read app.user_id and app.system, so every
  // statement runs inside a transaction that sets them. set_config(..., true)
  // is transaction-local, so nothing leaks onto the next borrower of a pooled
  // connection. The cost is a BEGIN/set/COMMIT round trip per statement.
  private async withContext<R>(fn: (client: any) => Promise<R>): Promise<R> {
    const ctx = await resolveContext();
    if (!ctx) {
      // Fail closed and loudly. Without a context the policies would match
      // nothing and pages would render empty, which is far harder to diagnose.
      throw new Error(
        "[rauell-os] Database access without a user context. Wrap the call in " +
          "runAsUser(userId, ...) or runAsSystem(...) - see src/lib/rls.ts."
      );
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.system', $2, true)", [
        ctx.userId ?? "",
        ctx.system ? "on" : "off",
      ]);
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // The connection is already broken; the original error is what matters.
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async query<T = Record<string, any>>(sql: string, params?: any[]): Promise<T[]> {
    const res: any = await this.withContext((c) => c.query(toPg(sql), params || []));
    return res.rows as T[];
  }

  async get<T = Record<string, any>>(sql: string, params?: any[]): Promise<T | undefined> {
    const res: any = await this.withContext((c) => c.query(toPg(sql), params || []));
    return (res.rows[0] as T) || undefined;
  }

  async run(sql: string, params?: any[]): Promise<{ changes: number }> {
    const res: any = await this.withContext((c) => c.query(toPg(sql), params || []));
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
    // node-postgres returns int8 (bigint) as a string to avoid precision loss,
    // so COUNT(*) arrives as "0" where SQLite gives 0. "0" is truthy, which
    // silently inverts every `count ? ... : ...` check in the app. Counts here
    // are far below Number.MAX_SAFE_INTEGER, so parse them as numbers and keep
    // both backends returning the same types.
    pg.types.setTypeParser(pg.types.builtins.INT8, (value: string) => parseInt(value, 10));
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
    const db = new PgDatabase(pool);
    // Schema and policy DDL predate any user, so it runs in system context.
    await runAsSystem(async () => {
      for (const stmt of splitStatements(SCHEMA_SQL)) await db.run(stmt);
      // Applied after the tables exist, and idempotent: each policy is dropped
      // and recreated, so a changed policy takes effect on the next cold start.
      for (const stmt of splitStatements(RLS_SQL)) await db.run(stmt);
      await db.run(
        `INSERT INTO _migrations (name, applied_at) VALUES (?, ?) ON CONFLICT DO NOTHING`,
        [MIGRATION_NAME, new Date().toISOString()]
      );
    });
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
