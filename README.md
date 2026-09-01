# Rauell OS

A personal AI operating system: one place for projects, tasks, opportunities,
applications, contacts, documents and email triage, with scoring and automation
on top.

Next.js 14 (App Router) · React 18 · TypeScript · Tailwind · SQLite or PostgreSQL

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

With no `DATABASE_URL` set, the app uses an embedded SQLite file at
`./data/rauell.db` — no database server required. The schema creates itself on
first connection, so there is no migration step to run.

Public registration is disabled, and there is exactly one account: sign-in is
gated to the owner address in `src/lib/auth-policy.ts`, and row level security
scopes every row to that one user id. Provision it through the controlled seed
workflow. `npm run db:purge-foreign` reports (and with `--confirm` removes) any
other account a previous seed left behind.

## Environment

Copy the template and fill in what you need:

```bash
cp .env.example .env.local
```

| Variable | Required | Purpose |
| :--- | :--- | :--- |
| `APP_URL` / `NEXT_PUBLIC_APP_URL` | production | Canonical application URL. Production is `https://ai-os.rauell.systems`. |
| `DATABASE_URL` | production | Pooled PostgreSQL connection string. Unset ⇒ embedded SQLite. |
| `AUTH_SECRET` | production | Signs session JWTs. **Unset falls back to a value committed in this repo**, which anyone can use to forge an owner session. |
| `CRON_SECRET` | for automations | `/api/automations/run` authenticates with this and refuses to run without it. |
| `TOKEN_ENCRYPTION_KEY` | for integrations | AES-256-GCM key for integration tokens at rest. Must be base64 of **exactly 32 bytes**, or it silently falls back to a dev key. |
| `RAUELL_DATA_DIR` | no | Override where the SQLite file is written. |
| `SEED_PASSWORD` / `SEED_NAME` | for seeding | See [Seeding](#seeding). |

Generate a secret of the right shape:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

`.env.local` is gitignored. Note that `DATABASE_URL` is **commented out** in
`.env.example`, so copying the file leaves it inactive — remove the leading `#`.

## Database

One interface, two backends, chosen from `DATABASE_URL` at runtime:

- **unset** → embedded SQLite via `sql.js` (WASM), file on disk
- **`postgresql://…`** → PostgreSQL via `node-postgres`

Both accept `?` placeholders; Postgres conversion to `$1…` is automatic. The
schema (45 tables) is dialect-neutral and applied idempotently on connect.

Check which backend you are on — it reports why, not just what:

```bash
npm run db:migrate
```

**Use the pooled endpoint** for serverless Postgres (host contains `-pooler`).
Serverless functions open many short-lived connections and will exhaust a direct
endpoint.

Timestamps are ISO 8601 strings in `TEXT` columns. Date filters are computed in
application code and bound as parameters — never with `datetime()` or other
engine-specific SQL, which does not exist in Postgres.

## One account

There is exactly one account, and its address is a constant — `OWNER_EMAIL` in
`src/lib/auth-policy.ts`, not an environment variable. A variable is one
deploy-time typo away from locking the owner out or admitting someone else, and
a second identity reached the dashboard once already. Setting an `OWNER_EMAIL`
variable has no effect; a value naming anyone else is logged and ignored.

`createUser` refuses any other address, the seed can only target the owner, and
row level security scopes every row to that single user id. A second account
cannot sign in and cannot be reached — it only creates a way for the wrong
identity to surface, which is what earlier versions of the seed did by building
their own user.

`npm run db:purge-foreign` reports any such leftover account and what it owns.
Add `-- --confirm` to delete it. It refuses to run when the owner has no row, so
it can never leave the database with no account at all.

`tests/owner-identity.test.ts` scans every tracked and newly added file and
fails if any address other than the owner's appears, so this cannot regress.

## Two-factor authentication

Set up from **Settings → Security**. TOTP (RFC 6238), verified against the RFC's
own published test vectors, so any authenticator app works.

The shared secret is encrypted with `TOKEN_ENCRYPTION_KEY` before it is stored,
so the database alone does not yield it — which also means **`TOKEN_ENCRYPTION_KEY`
must not change once enrolled**, or the secret becomes undecryptable and the
recovery codes are the only way back.

Ten single-use recovery codes are issued at enrolment and shown once. Keep them:
registration is permanently disabled, so a lost phone without a recovery code is
a lost account. New codes can be issued at any time, which invalidates the old set.

A code is accepted once — the 30-second step it was used for is recorded, so a
code seen over a shoulder cannot be reused inside its own window. The second step
is rate limited separately from the password step.

**Sign out everywhere** bumps a per-account session epoch that every token
carries, invalidating all existing sessions including the current one. It is the
only way to revoke a stolen token short of rotating `AUTH_SECRET`.

## Security

**Row Level Security.** All 45 tables run `ENABLE` + `FORCE ROW LEVEL SECURITY`
on the Postgres backend. `FORCE` is the part that matters: Postgres exempts a
table's owner from RLS by default, and the app connects as the owner, so
`ENABLE` alone would enforce nothing.

Policies read two transaction-local settings applied by `src/lib/db.ts`:

| Setting | Meaning |
| :--- | :--- |
| `app.user_id` | the signed-in user for this query |
| `app.system` | `on` for login, registration, the cron owner lookup and schema bootstrap |

Scope is resolved at the moment of the query — from an explicit `runAsUser` /
`runAsSystem` wrapper, otherwise from the session cookie. A query that forgets
its `WHERE user_id = ?` filter returns **nothing** rather than another user's
rows, and a query with no resolvable scope throws instead of silently returning
an empty result. Feature code must never call `runAsSystem`.

SQLite has no equivalent; local development relies on the application filters
alone. See `src/lib/rls.ts`.

**Sessions** are application-managed JWTs in a secure, host-only, httpOnly
cookie, verified in middleware. User credentials are stored in the app's
`users` table with bcrypt password hashes. Set `AUTH_SECRET` to the same stable
secret on every production deployment. This app currently uses Neon as
PostgreSQL storage only; it does **not** use the separate Neon Auth service.

**Approvals.** Outbound and destructive actions — sending, submitting,
publishing, deleting — route through the Approval Center rather than executing
directly.

## Scripts

| Command | Does |
| :--- | :--- |
| `npm run dev` | Development server on :3000 |
| `npm run build` / `start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | Report backend, connection target and applied migrations |
| `npm run db:seed` | Load the master profile (see below) |
| `npm run db:reset` | Clear the owner's data, keeping the account |
| `npm run db:purge-foreign` | Report any account that is not the owner; `-- --confirm` deletes them and their rows |
| `npm run test` | Run the vitest suite once (scoring, requirement matching, dedupe, email classification, profile importers, auth policy) |
| `npm run test:watch` | vitest in watch mode |

Scripts load `.env.local` then `.env` themselves; real environment variables win.

## Seeding

The seed loads the master profile — education, employment, skills, projects,
goals, sample opportunities and tasks — into **one account**, and row level
security scopes every read by `user_id`, so it matters which one.

It targets the owner account and nothing else, so there is nothing to configure:

```bash
npm run db:seed
```

`SEED_PASSWORD` is required **only** when that account does not exist yet,
because the seed then has to create it. There is deliberately no default: a
committed password is a live credential on any reachable deployment.

```bash
SEED_PASSWORD='<a strong password>' npm run db:seed
```

The seed used to take its address from `SEED_EMAIL`, defaulting to a literal
that was nobody's real login: it built its own user, hung every row off that id,
and left the signed-in owner looking at an empty application with no error to
explain it. That variable is gone.

Re-running against an account that already holds seeded rows is skipped. Set
`SEED_FORCE=1` to clear that account's data and seed it again; `npm run db:reset`
clears it without reseeding. Neither deletes the account itself — registration
is permanently disabled, so there would be no way back in.

It writes to whatever `DATABASE_URL` points at — with a production URL set,
**it seeds production**.

Without a local checkout, run the **Seed database** workflow from the Actions
tab (`workflow_dispatch` only). It needs `DATABASE_URL` and `SEED_PASSWORD` as
repository secrets and refuses to run if `DATABASE_URL` is missing or is not a
`postgresql://` string.

### Why the app might read zero everywhere

Every screen counts rows scoped to the signed-in user, so a new account shows
zeros on every card — correct, and indistinguishable from a broken deployment.
The dashboard shows a setup checklist while anything is still unconfigured:
profile imported, AI provider set, `TOKEN_ENCRYPTION_KEY` set, an integration
connected, first project or opportunity added, an automation scheduled.

## Deployment

Vercel, from `main`. `vercel.json` pins `framework: nextjs` — without it Vercel
resolves the project as a static site and fails looking for a `public/`
directory.

Set `DATABASE_URL`, `AUTH_SECRET` and `CRON_SECRET` in the project's environment
variables, scoped to **Production**, then redeploy — environment changes only
apply to new deployments.

Set both `APP_URL` and `NEXT_PUBLIC_APP_URL` to
`https://ai-os.rauell.systems`, and set `GOOGLE_REDIRECT_URI` to
`https://ai-os.rauell.systems/api/integrations/google/callback`. Register that
same callback in Google Cloud, plus
`https://ai-os.rauell.systems/api/integrations/github/callback` in the GitHub
OAuth app when GitHub integration is enabled.

Without a Postgres `DATABASE_URL`, the serverless filesystem is read-only and
storage falls back to the system temp directory: the app runs, but **accounts
and data are lost on every cold start**. It logs a warning when this happens.

`vercel.json` also registers a daily cron against `/api/automations/run`. Vercel
sends `Authorization: Bearer $CRON_SECRET` automatically when that variable is
set; the route also accepts an `x-cron-secret` header for manual calls.

## Layout

```
src/
  app/
    actions/      server actions, one module per domain
    api/          route handlers (cron, export, documents, OAuth callbacks)
    */page.tsx    22 routes
  components/     UI, including the app shell and per-domain controls
  lib/
    db.ts         unified data layer, RLS context, backend selection
    rls.ts        row level security policies
    schema.ts     dialect-neutral DDL
    session.ts    JWT session verification (no DB dependency)
    auth.ts       accounts, sessions, password hashing
    scoring/      evidence-based, deterministic scoring engines (job, scholarship,
                  lead, task priority, requirement matching, profile index)
    engines/      dedupe, email classification, CV requirement extraction
    brief.ts      daily brief and dashboard metrics
  middleware.ts   session gate
tests/            vitest: scoring, requirement matching, dedupe, email, crypto
docs/
  SALVAGE.md      work removed from main by an early merge, and what was recovered
  archive/        superseded design documents, kept for their reasoning
```

## Scoring engine

`src/lib/scoring/` is deterministic and evidence-based: every job, scholarship
and lead score is a weighted sum of named factors, each with a human-readable
detail and (where applicable) evidence pointers back into the master profile
(a skill, an employer, a project). `matchRequirement()` in `scoring/match.ts`
expands domain synonyms (e.g. "EV" ↔ "electric vehicle" ↔ "charging") and
classifies each requirement as `STRONG` / `MODERATE` / `DEVELOPING` / `MISSING`
— a developing skill is never reported as expert, and an unevidenced
requirement is never claimed. `src/lib/engines/cv.ts` reuses the same matcher
to extract requirements from a pasted job description and map each one to
profile evidence, honestly, for the application workspace.

## Notes

`docs/SALVAGE.md` records what an earlier merge removed from `main` and what
was ported back: the vitest suite (27 tests) and the evidence-based scoring
engines, both adapted from Prisma to this repository's SQL data layer.
