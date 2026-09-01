import "./load-env";
import { getDb, runAsSystem } from "../src/lib/db";
import { ownerEmail, maskEmail } from "../src/lib/auth-policy";
import { USER_SCOPED, CHILD_SCOPED } from "../src/lib/rls";

// Removes every account that is not the owner, and everything it owns.
//
// This application has exactly one account by design: sign-in is gated to
// OWNER_EMAIL and row level security scopes every row to one user id. Earlier
// versions of the seed built their own user, so a database can still hold an
// account nobody can sign in as, carrying a name and an address that show up
// wherever its rows are read.
//
// Destructive, so it reports first and deletes only when asked:
//   npm run db:purge-foreign            # report what would be deleted
//   npm run db:purge-foreign -- --confirm

const confirmed = process.argv.includes("--confirm") || process.env.PURGE_CONFIRM === "1";

async function main() {
  const owner = ownerEmail();
  if (!owner) {
    console.error(
      "Refusing to purge: OWNER_EMAIL is not set.\n\n" +
        "Without it there is no way to tell which account to keep, and every\n" +
        "account would look foreign. Set OWNER_EMAIL to the address you sign in with."
    );
    process.exit(1);
  }

  const db = await getDb();
  const ownerRow = await db.get<{ id: string }>(`SELECT id FROM users WHERE email = ?`, [owner]);
  if (!ownerRow) {
    console.error(
      `Refusing to purge: no account matches OWNER_EMAIL (${maskEmail(owner)}).\n\n` +
        "Deleting every other account would leave the database with no account at\n" +
        "all, and registration is disabled. Make OWNER_EMAIL and the users table agree first."
    );
    process.exit(1);
  }

  const foreign = await db.query<{ id: string; email: string; name: string; role: string; created_at: string }>(
    `SELECT id, email, name, role, created_at FROM users WHERE id <> ? ORDER BY created_at`,
    [ownerRow.id]
  );

  console.log(`Owner: ${owner} (id=${ownerRow.id}) - kept.`);
  if (!foreign.length) {
    console.log("No other accounts. Nothing to purge.");
    process.exit(0);
  }

  console.log(`\n${foreign.length} account(s) to remove:\n`);
  let grandTotal = 0;
  const perUser = new Map<string, number>();
  for (const u of foreign) {
    let rows = 0;
    for (const table of USER_SCOPED) {
      const r = await db.get<{ c: number }>(`SELECT COUNT(*) c FROM ${table} WHERE user_id = ?`, [u.id]);
      rows += Number(r?.c) || 0;
    }
    perUser.set(u.id, rows);
    grandTotal += rows;
    console.log(`  ${u.email}  (id=${u.id}, role=${u.role}, name=${u.name || "-"}) - ${rows} row(s)`);
  }

  if (!confirmed) {
    console.log(
      `\nDry run. ${grandTotal} row(s) plus ${foreign.length} account(s) would be deleted.\n` +
        "Nothing has been changed. Re-run with --confirm to delete."
    );
    process.exit(0);
  }

  for (const u of foreign) {
    // Children first: they are reached through a parent that carries user_id.
    for (const { table, fk, parent } of CHILD_SCOPED) {
      await db.run(`DELETE FROM ${table} WHERE ${fk} IN (SELECT id FROM ${parent} WHERE user_id = ?)`, [u.id]);
    }
    for (const table of USER_SCOPED) {
      await db.run(`DELETE FROM ${table} WHERE user_id = ?`, [u.id]);
    }
    await db.run(`DELETE FROM users WHERE id = ?`, [u.id]);
    console.log(`Removed ${u.email} and ${perUser.get(u.id) ?? 0} row(s).`);
  }

  const remaining = await db.query<{ email: string }>(`SELECT email FROM users ORDER BY created_at`);
  console.log(`\nDone. Accounts remaining: ${remaining.map((r) => r.email).join(", ")}`);
  process.exit(0);
}

runAsSystem(main).catch((e) => {
  console.error(e);
  process.exit(1);
});
