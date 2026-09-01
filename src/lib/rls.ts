// Row Level Security for the PostgreSQL backend.
//
// Every table gets ENABLE + FORCE ROW LEVEL SECURITY. FORCE matters: Postgres
// exempts a table's owner from RLS by default, and the app connects as
// neondb_owner, which owns all 45 tables. Without FORCE, enabling RLS would
// satisfy a checklist while enforcing nothing.
//
// Policies read two transaction-local settings, applied by src/lib/db.ts:
//
//   app.user_id  the signed-in user for this query
//   app.system   'on' for the few operations that legitimately run without a
//                user: login lookup, registration, the cron owner lookup and
//                schema bootstrap
//
// Feature code never sets app.system, so a query that forgets its
// `WHERE user_id = ?` filter returns nothing instead of leaking another user's
// rows. Settings are applied with set_config(..., true), which scopes them to
// the transaction, so they cannot leak across pooled connections.
//
// SQLite has no equivalent; this applies to the Postgres backend only. Local
// development on sql.js relies on the application filters alone.

/** Tables owning a direct user_id column. */
export const USER_SCOPED = [
  "profiles", "education", "employment", "skills", "projects", "organizations",
  "people", "links", "opportunities", "applications", "tasks", "emails",
  "email_threads", "calendar_events", "documents", "references_", "leads",
  "outreach", "followups", "notes", "knowledge_items", "chat_threads",
  "chat_messages", "chat_attachments", "ai_runs",
  "automation_rules", "notifications", "approvals", "activity_events",
  "decisions", "integrations", "audit_logs", "user_preferences", "goals",
  "opportunity_sources", "user_mfa", "mfa_recovery_codes",
];

/** Child tables reached through a parent that carries user_id. */
export const CHILD_SCOPED: Array<{ table: string; fk: string; parent: string }> = [
  { table: "skill_evidence", fk: "skill_id", parent: "skills" },
  { table: "opportunity_scores", fk: "opportunity_id", parent: "opportunities" },
  { table: "application_requirements", fk: "application_id", parent: "applications" },
  { table: "application_questions", fk: "application_id", parent: "applications" },
  { table: "application_documents", fk: "application_id", parent: "applications" },
  { table: "application_events", fk: "application_id", parent: "applications" },
  { table: "application_versions", fk: "application_id", parent: "applications" },
  { table: "task_dependencies", fk: "task_id", parent: "tasks" },
  { table: "automation_runs", fk: "rule_id", parent: "automation_rules" },
  { table: "integration_tokens", fk: "integration_id", parent: "integrations" },
  { table: "sync_runs", fk: "integration_id", parent: "integrations" },
];

/** Tables holding no user-owned rows; reachable only in system context. */
const SYSTEM_ONLY = ["prompt_versions", "_migrations", "auth_attempts"];

const IS_SYSTEM = `current_setting('app.system', true) = 'on'`;
const CURRENT_USER = `current_setting('app.user_id', true)`;

function enable(table: string): string {
  return `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_${table} ON ${table};`;
}

function policy(table: string, predicate: string): string {
  // USING gates reads, updates and deletes; WITH CHECK gates inserts and the
  // post-image of updates, so a row cannot be written into another user's scope.
  return `${enable(table)}
CREATE POLICY rls_${table} ON ${table} USING (${predicate}) WITH CHECK (${predicate});`;
}

export const RLS_SQL: string = [
  // The users table is scoped by its own primary key.
  policy("users", `id = ${CURRENT_USER} OR ${IS_SYSTEM}`),

  ...USER_SCOPED.map((t) => policy(t, `user_id = ${CURRENT_USER} OR ${IS_SYSTEM}`)),

  ...CHILD_SCOPED.map(({ table, fk, parent }) =>
    policy(
      table,
      `${IS_SYSTEM} OR EXISTS (SELECT 1 FROM ${parent} p WHERE p.id = ${table}.${fk} AND p.user_id = ${CURRENT_USER})`
    )
  ),

  ...SYSTEM_ONLY.map((t) => policy(t, IS_SYSTEM)),
].join("\n");

/** Every table covered, for tests and audit. */
export const RLS_TABLES: string[] = [
  "users",
  ...USER_SCOPED,
  ...CHILD_SCOPED.map((c) => c.table),
  ...SYSTEM_ONLY,
];
