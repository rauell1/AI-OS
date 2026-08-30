import "./load-env";
import { getDb } from "../src/lib/db";

async function main() {
  const db = await getDb();
  const rows = await db.query<{ name: string }>(`SELECT name FROM _migrations`);
  console.log(`Database ready. Applied migrations: ${rows.map((r) => r.name).join(", ") || "none"}`);
  console.log(`Backend: ${db.backend}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
