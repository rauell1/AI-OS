// Load .env files for scripts run through tsx.
//
// Next.js loads .env.local automatically, but a bare `tsx scripts/foo.ts` does
// not - so DATABASE_URL sitting in .env.local was invisible to db:migrate,
// db:seed and db:reset. That made db:migrate always report the SQLite backend,
// and would have made db:seed write to a local SQLite file while appearing to
// target the configured Postgres database.
//
// Import this for its side effect as the FIRST import of any script, before
// anything that reads process.env at module scope (src/lib/db.ts resolves its
// data directory on load):
//
//   import "./load-env";
//   import { getDb } from "../src/lib/db";
//
// Precedence matches Next.js: real environment variables win over .env.local,
// which wins over .env. Nothing already set is overwritten, so CI secrets and
// inline overrides (SEED_PASSWORD=... npm run db:seed) always take priority.

import fs from "node:fs";
import path from "node:path";

function parse(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const withoutExport = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eq = withoutExport.indexOf("=");
    if (eq === -1) continue;

    const key = withoutExport.slice(0, eq).trim();
    if (!key) continue;

    let value = withoutExport.slice(eq + 1).trim();
    // Strip matching surrounding quotes; only unescape inside double quotes.
    if (value.length >= 2 && value[0] === '"' && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"');
    } else if (value.length >= 2 && value[0] === "'" && value.endsWith("'")) {
      value = value.slice(1, -1);
    } else {
      // Unquoted values end at the first inline comment.
      const hash = value.indexOf(" #");
      if (hash !== -1) value = value.slice(0, hash).trim();
    }
    out[key] = value;
  }
  return out;
}

function loadFile(file: string) {
  const full = path.join(process.cwd(), file);
  if (!fs.existsSync(full)) return;
  const parsed = parse(fs.readFileSync(full, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

// .env.local first so it takes precedence over .env.
loadFile(".env.local");
loadFile(".env");
