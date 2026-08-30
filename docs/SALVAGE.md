# Salvage record: the work PR #2 removed from `main`

> **Update:** items 1 and 2 below (the test suite and the scoring engines) have
> been ported to `main` — see `src/lib/scoring/`, `src/lib/engines/`, and
> `tests/`. They were adapted from Prisma to this repository's SQL data layer
> (`src/lib/db.ts`), not copied verbatim: `profile-index.ts` was rewritten
> against the real schema, `priority.ts`'s Prisma enums became the lowercase
> string unions `tasks.status` / `tasks.source` actually use, and the old
> `src/lib/scoring.ts` was removed so there is exactly one scoring system, not
> two running in parallel. `main`'s scoring call sites (`actions/opportunities.ts`,
> `actions/tasks.ts`, `actions/network.ts`, `scripts/seed.ts`, `src/lib/cv.ts`)
> were rewired to the new engine. Item 4 (AI provider abstraction, integrations,
> approvals, automations) was left alone, per the original recommendation below.


## What happened

Two Arena branches were developed in parallel from the initial commit `3360aa8`:

| Branch | Tip | Merged as |
| :--- | :--- | :--- |
| `arena/01a0512a-ai-os` | `17a8edb` | PR #1 → `c45d4ad` |
| `arena/01a04f2f-ai-os` | `954460f` | PR #2 → `e3b127f` |

PR #1 landed first. PR #2 then merged `main` into its own branch in commit `e1350aa`
("Merge origin/main and resolve conflicts") and **resolved every conflict in favour of its
own side**. The result: after PR #2, `main` was byte-identical to `954460f`, and all 57
files unique to PR #1 (~8,200 lines, excluding `package-lock.json`) were gone from `main`.

This was not a partial regression or a bad conflict hunk. PR #1's entire contribution was
reverted.

## Why `main` was kept anyway

The surviving branch is the better base, and no revert is warranted:

| | `01a0512a` (PR #1, removed) | `01a04f2f` (PR #2, = `main`) |
| :--- | :--- | :--- |
| Stack | Next 15, React 19, Prisma 7, Tailwind 4 | Next 14, React 18, raw `pg`, Tailwind 3 |
| UI surface | 3 pages | 22 routes, complete app |
| Data model | 48 Prisma models | 45 SQL tables (`src/lib/schema.ts`) |
| Persistence | Prisma + Postgres | SQLite **and** Postgres, env-switched |
| Tests | vitest, 27 tests | none |
| Docs | ARCHITECTURE + DATABASE | none |

`main` builds, deploys, and carries the entire product surface. The two data models are
near-identical in coverage, so PR #1's main advantage was never the schema — it was
**depth in the deterministic engines, a real test suite, and documentation**.

## Where the removed work lives

Two refs on the remote point at it. **Do not delete both.**

- `salvage/pr1-arena-01a0512a` — created specifically to preserve this; nothing else moves it
- `arena/01a0512a-ai-os` — the original branch

Both resolve to commit `17a8edb111f0c99767126a9ad439904632b1e97b`.

```bash
# inspect
git show 17a8edb --stat
git show 17a8edb:src/lib/scoring/match.ts

# recover a specific file onto a working branch
git checkout 17a8edb -- src/lib/scoring/match.ts

# browse the whole tree
git checkout salvage/pr1-arena-01a0512a
```

A git tag would be the more durable marker, but tag pushes are blocked in the environment
this record was written from. To add one:

```bash
git tag -a salvage/pr1 -m "Preserved tip of PR #1" 17a8edb && git push origin salvage/pr1
```

## What is worth porting, in priority order

**1. The test suite — the clearest gap.** `main` has no tests and no test runner (only a
`tsx` smoke script). PR #1 had vitest with 27 tests covering scoring, requirement matching,
email classification, dedupe and crypto, including honesty invariants like *"developing
skills never score STRONG"* and *"no evidence → MISSING"*.

**2. The scoring engines.** `main`'s `src/lib/scoring.ts` is 265 lines; PR #1's
`src/lib/scoring/` is 888 across 8 modules (job, scholarship, lead, priority, requirement
matching, profile index, shared weighting/explanation types).

Portability is good — the core is nearly pure:

- `types.ts`, `job-scholarship.ts`, `match.ts` — no external dependencies
- `job.ts`, `scholarship.ts`, `lead.ts` — depend only on sibling modules plus `daysUntil`,
  which **already exists** in `main` at `src/lib/utils.ts:33`
- `priority.ts` — needs two Prisma enum types replaced with local string unions
- `profile-index.ts` — the only DB-bound module; tests import it as a *type* only, so the
  interface decouples cleanly from Prisma

The real work is not translation, it is deciding whether these **replace** `main`'s existing
`scoring.ts` or sit beside it. Running two scoring systems in parallel would be worse than
either alone, so this needs a deliberate decision before any code moves.

**3. Documentation.** Archived in this repo, already recovered:
`docs/archive/pr1-architecture.md`, `docs/archive/pr1-database.md`.

**4. Probably not worth porting.** The AI provider abstraction, Google/GitHub integrations,
approvals and automation registry all have working equivalents on `main`
(`src/lib/ai.ts`, `src/lib/integrations/`, `src/app/actions/approvals.ts`,
`src/app/actions/automations.ts`). Read PR #1's versions for ideas — the AI cost/budget
guard and cache in `src/lib/ai/client.ts` are genuinely more developed — but they are not
drop-in.

> **Note on archiving source into this repo:** `tsconfig.json` includes `**/*.ts`
> repo-wide, so copying PR #1's `.ts` files anywhere in the tree would put them in the
> typecheck and build path and break both. Recover from git refs instead, or add a
> `tsconfig.json` exclude first.

## Full inventory of removed files

57 files unique to PR #1, by path, with line counts.

| File | Lines |
| :--- | ---: |
| `.eslintrc.json` | 3 |
| `.npmrc` | 3 |
| `docs/ARCHITECTURE.md` | 86 |
| `docs/DATABASE.md` | 88 |
| `next.config.ts` | 13 |
| `prisma.config.ts` | 19 |
| `prisma/migrations/20250830000000_init/migration.sql` | 1105 |
| `prisma/schema.prisma` | 1309 |
| `prisma/seed.ts` | 408 |
| `scripts/auto-check.mts` | 19 |
| `scripts/db-apply-migrations.mjs` | 58 |
| `scripts/dev-db.mjs` | 67 |
| `scripts/empty-server-only.ts` | 3 |
| `scripts/schema-to-sql.mjs` | 191 |
| `scripts/scoring-smoke.mts` | 79 |
| `src/app/(auth)/login/page.tsx` | 91 |
| `src/app/(auth)/setup/page.tsx` | 155 |
| `src/app/api/cron/route.ts` | 34 |
| `src/app/api/health/route.ts` | 16 |
| `src/app/home/page.tsx` | 116 |
| `src/lib/ai/client.ts` | 301 |
| `src/lib/ai/prompts.ts` | 109 |
| `src/lib/ai/providers/index.ts` | 197 |
| `src/lib/ai/types.ts` | 76 |
| `src/lib/approvals.ts` | 241 |
| `src/lib/auth/password.ts` | 45 |
| `src/lib/auth/session.ts` | 84 |
| `src/lib/automations/registry.ts` | 244 |
| `src/lib/automations/runner.ts` | 85 |
| `src/lib/crypto/encrypt.ts` | 50 |
| `src/lib/engines/brief.ts` | 200 |
| `src/lib/engines/cv.ts` | 131 |
| `src/lib/engines/dedupe.ts` | 64 |
| `src/lib/engines/email.ts` | 78 |
| `src/lib/engines/followups.ts` | 142 |
| `src/lib/engines/rag.ts` | 126 |
| `src/lib/engines/search.ts` | 47 |
| `src/lib/engines/weekly.ts` | 117 |
| `src/lib/env.ts` | 74 |
| `src/lib/integrations/github.ts` | 144 |
| `src/lib/integrations/google.ts` | 331 |
| `src/lib/integrations/status.ts` | 85 |
| `src/lib/notifications.ts` | 29 |
| `src/lib/scoring/job-scholarship.ts` | 4 |
| `src/lib/scoring/job.ts` | 172 |
| `src/lib/scoring/lead.ts` | 93 |
| `src/lib/scoring/match.ts` | 202 |
| `src/lib/scoring/priority.ts` | 107 |
| `src/lib/scoring/profile-index.ts` | 87 |
| `src/lib/scoring/scholarship.ts` | 188 |
| `src/lib/scoring/types.ts` | 35 |
| `src/lib/storage.ts` | 46 |
| `tests/dedupe-email.test.ts` | 65 |
| `tests/match.test.ts` | 92 |
| `tests/scoring.test.ts` | 202 |
| `tsconfig.scripts.json` | 9 |
| `vitest.config.ts` | 16 |

Total: ~8,181 lines.
