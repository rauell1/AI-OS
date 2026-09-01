import "./load-env";
import { getDb, runAsSystem } from "../src/lib/db";
import { seedTargetEmail } from "../src/lib/seed-data";
import { USER_SCOPED, CHILD_SCOPED } from "../src/lib/rls";

// Clears the seeded data for the target account, keeping the account itself.
// This used to `DELETE FROM users`, which on a configured deployment deletes
// the only account anyone can sign in as - registration is permanently
// disabled, so there is no way back through the UI.
async function main() {
  const email = seedTargetEmail();
  if (!email) {
    console.error("Refusing to reset: neither SEED_EMAIL nor OWNER_EMAIL is set, so there is no account to target.");
    process.exit(1);
  }
  const db = await getDb();
  const user = await db.get<{ id: string }>(`SELECT id FROM users WHERE email = ?`, [email]);
  if (!user) {
    console.log(`Nothing to reset: no account for ${email}.`);
    process.exit(0);
  }
  for (const { table, fk, parent } of CHILD_SCOPED) {
    await db.run(`DELETE FROM ${table} WHERE ${fk} IN (SELECT id FROM ${parent} WHERE user_id = ?)`, [user.id]);
  }
  for (const table of USER_SCOPED) {
    await db.run(`DELETE FROM ${table} WHERE user_id = ?`, [user.id]);
  }
  console.log(`Cleared data for ${email}; the account itself is untouched. Re-run \`npm run db:seed\` to repopulate.`);
  process.exit(0);
}
runAsSystem(main).catch((e) => { console.error(e); process.exit(1); });
