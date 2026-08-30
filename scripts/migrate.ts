import "./load-env";
import fs from "node:fs";
import { loadedEnvFiles, describeDatabaseUrl } from "./load-env";
import { getDb, runAsSystem } from "../src/lib/db";

async function main() {
  // Report configuration before connecting. "Backend: sqlite" when Postgres was
  // intended is almost always an unset DATABASE_URL rather than a bad one, and
  // that is invisible unless we say where we looked.
  console.log(`Env files loaded: ${loadedEnvFiles.join(", ") || "none"}`);
  console.log(`DATABASE_URL: ${describeDatabaseUrl()}`);

  const db = await getDb();
  const rows = await runAsSystem(() => db.query<{ name: string }>(`SELECT name FROM _migrations`));
  console.log(`Database ready. Applied migrations: ${rows.map((r) => r.name).join(", ") || "none"}`);
  console.log(`Backend: ${db.backend}`);

  if (db.backend === "sqlite") {
    const hasLocal = fs.existsSync(".env.local");
    console.log("");
    console.log("Using the embedded SQLite file, not Postgres.");
    if (!process.env.DATABASE_URL) {
      console.log(
        hasLocal
          ? "DATABASE_URL is not set in .env.local. Note that the line is commented out in\n" +
            ".env.example, so copying that file leaves it inactive - remove the leading '#'\n" +
            "and put your connection string on it."
          : "No .env.local file found. Create one with:\n" +
            '  DATABASE_URL="postgresql://user:password@host-pooler.region.aws.neon.tech/neondb?sslmode=require"'
      );
    } else {
      console.log(
        "DATABASE_URL is set but does not begin with postgresql:// or postgres://, so the\n" +
          "Postgres backend was not selected. Check the scheme on your connection string."
      );
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
