#!/usr/bin/env node
/**
 * Applies prisma/migrations/*.sql in order, recording them in
 * _rauell_migrations (idempotent). Used in this sandbox where the native
 * schema-engine cannot be downloaded (binaries.prisma.sh blocked); production
 * deployments should use `prisma migrate deploy`, which behaves identically.
 *
 * Usage: node scripts/db-apply-migrations.mjs
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, "prisma", "migrations");
const LEDGER = "_rauell_migrations";

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${LEDGER} (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`
  );
  const { rows: applied } = await client.query(`SELECT name FROM ${LEDGER}`);
  const appliedSet = new Set(applied.map((r) => r.name));

  const dirs = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((d) => fs.statSync(path.join(MIGRATIONS_DIR, d)).isDirectory() && d !== "_prisma_migrations" && d !== LEDGER)
    .sort();

  let ran = 0;
  for (const dir of dirs) {
    if (appliedSet.has(dir)) continue;
    const sqlPath = path.join(MIGRATIONS_DIR, dir, "migration.sql");
    if (!fs.existsSync(sqlPath)) continue;
    const sql = fs.readFileSync(sqlPath, "utf8");
    console.log(`applying ${dir}...`);
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(`INSERT INTO ${LEDGER} (name) VALUES ($1)`, [dir]);
      await client.query("COMMIT");
      ran++;
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`FAILED ${dir}:`, err.message);
      process.exit(1);
    }
  }
  console.log(`done: ${ran} migration(s) applied`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
