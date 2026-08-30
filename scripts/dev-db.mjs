/**
 * Local development PostgreSQL using embedded-postgres.
 * Downloads a self-contained Postgres binary via npm (no apt required) and
 * runs it on localhost:5433 with data in .data/postgres (gitignored).
 *
 *   node scripts/dev-db.mjs up     # start (waits until ready)
 *   node scripts/dev-db.mjs down   # stop
 *
 * In production, point DATABASE_URL at Neon instead. This script exists only
 * so migrations, tests and the app run hermetically in development.
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, ".data", "postgres");
const PORT = 5433;

const command = process.argv[2] ?? "up";

async function main() {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: "rauell",
    password: "rauell",
    port: PORT,
    persistent: true,
    onError: (msgOrErr) => console.error("[dev-db]", msgOrErr),
  });

  if (command === "up") {
    const isEmpty = !fs.existsSync(DATA_DIR) || fs.readdirSync(DATA_DIR).length === 0;
    if (isEmpty) {
      await pg.initialise();
    }
    await pg.start();
    try {
      await pg.createDatabase("rauell_os");
    } catch (err) {
      if (!/already exists/i.test(String(err))) throw err;
    }
    console.log(`[dev-db] PostgreSQL ready on localhost:${PORT} (db: rauell_os, user: rauell)`);
    console.log(`[dev-db] DATABASE_URL="postgresql://rauell:rauell@localhost:${PORT}/rauell_os"`);
    // Keep running: the caller is expected to background this process.
    await new Promise(() => {});
  } else if (command === "down") {
    try {
      await pg.stop();
      console.log("[dev-db] stopped");
    } catch {
      console.log("[dev-db] nothing to stop (or already stopped)");
    }
  } else {
    console.error("Usage: node scripts/dev-db.mjs [up|down]");
    process.exit(2);
  }
}

main().catch((err) => {
  console.error("[dev-db] failed:", err);
  process.exit(1);
});
