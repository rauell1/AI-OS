import "./load-env";
import { getDb, runAsSystem } from "../src/lib/db";
import { SEED } from "../src/lib/seed-data";

async function main() {
  const db = await getDb();
  await db.run(`DELETE FROM users WHERE email = ?`, [SEED.user.email.toLowerCase()]);
  console.log("Removed seeded user. Re-run `npm run db:seed` to recreate.");
  process.exit(0);
}
runAsSystem(main).catch((e) => { console.error(e); process.exit(1); });
