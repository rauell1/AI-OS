> **ARCHIVED — describes the superseded PR #1 implementation, not the current codebase.**
>
> This document came from `arena/01a0512a-ai-os` (commit `17a8edb`), which was merged as
> PR #1 and then entirely reverted by the PR #2 merge. It describes a **Next 15 / React 19 /
> Prisma 7 / Tailwind 4** stack. `main` today is **Next 14 / React 18 / raw `pg` / Tailwind 3**,
> and the file layout below (`prisma/`, `src/lib/ai/`, `src/lib/scoring/`, `src/app/(auth)/`)
> **does not exist on `main`**.
>
> Kept because the product principles, domain model and design rationale remain accurate and
> valuable. Read it for the *thinking*, not for the file paths. See `docs/SALVAGE.md`.

# Rauell OS - Architecture

## Product principle

CAPTURE -> UNDERSTAND -> ORGANIZE -> PRIORITIZE -> PREPARE -> ASK FOR APPROVAL -> ACT ->
TRACK -> LEARN. AI researches, discovers, classifies, summarizes, ranks, extracts, drafts
and recommends. Roy approves anything external: sends, submissions, outreach, deletions,
publishing, sensitive documents.

## Modular monolith

```
src/
  app/                  Next.js App Router
    (auth)/login        sign-in (server action + scrypt + sessions)
    (auth)/setup        owner account bootstrap (SETUP_TOKEN aware)
    home/               Daily Command Center (deterministic Daily Brief)
    api/health          liveness + DB probe
    api/cron            scheduler tick (CRON_SECRET bearer); runs due automations
  lib/
    ai/                 provider abstraction, model roles, cache, budget, usage logs
      providers/        openai | anthropic | google adapters
    approvals/          (lib/approvals.ts) request/execute/decide approval workflows
    auth/               password (scrypt), sessions (hashed tokens, cookies)
    automations/        rule registry + runner (modes, run history, next-run math)
    crypto/             AES-256-GCM secret encryption, hashing, tokens
    engines/            brief, weekly, followups, cv, email, search, rag, dedupe
    integrations/       google (Gmail/GCal/GDrive), github, status overview
    scoring/            job, scholarship, priority, lead engines + profile index
    activity.ts         immutable activity timeline writer
    notifications.ts    in-app notification center
    storage.ts          document file storage adapter (local now, object storage later)
  generated/prisma/     Prisma client (generated, gitignored)
prisma/
  schema.prisma         48-table normalized schema
  migrations/           SQL migrations
  seed.ts               Roy's master profile import (USER_PROVIDED facts)
scripts/                dev DB, migration applier, smoke tests
```

## Key decisions

1. **Deterministic engines first.** Scoring, prioritization, follow-up detection, email
   classification and the daily brief are pure, unit-tested functions over stored data.
   They never require AI. AI (when a key exists) refines, explains and drafts on top, and
   every AI run is logged (model, tokens, cost, purpose, prompt version).
2. **AI degrades gracefully.** `AiDisabledError` is caught at each feature boundary; the
   deterministic path renders instead. No feature pretends to be AI-backed without a key.
3. **Approvals are a first-class state machine**, not a UI afterthought:
   PENDING -> APPROVED/REJECTED -> EXECUTED (or APPROVED with executionError). Execution
   failures are honest: e.g. approving email without Gmail connected records
   "approved but not executed, Gmail not connected" and keeps the draft.
4. **Evidence, not fabrication.** Requirement matching returns STRONG/MODERATE/DEVELOPING/
   MISSING with pointers to the exact profile records. Low-proficiency skills can never
   score STRONG. Every generated document stores prompt version + model + approval state.
5. **Prisma 7 query compiler.** The client runs the bundled WASM engine over
   `@prisma/adapter-pg`: no native binary downloads (hermetic CI, same code path on Neon).
6. **Storage adapter.** Documents live on disk keyed by userId/documentId with SHA-256
   hashes; the interface is three functions, ready for an S3-compatible adapter.
7. **Scheduler is data-driven.** `/api/cron` just executes what is due; any scheduler
   (Vercel Cron, uptime pinger, GitHub Action) can drive it with the bearer secret.

## AI model roles

FAST (classification), RESEARCH, REASONING, WRITING, DOC_EXTRACT, EMBEDDING. Each role
maps to a provider model with env overrides (`AI_MODEL_*`). Caching keys on
(provider, role, model, messages, json, temperature); monthly budget guard stops paid
calls when `AI_MONTHLY_BUDGET_USD` is spent (usage dashboards read `AiRun`).

## Integration boundaries

- Google OAuth: one consent, three provider rows (GMAIL/GCAL/GDRIVE) with per-provider
  privacy configs (Gmail read-only + draft; Drive folder allowlist; Calendar external
  invites behind approval). Tokens encrypted; refresh handled transparently.
- GitHub: `GITHUB_TOKEN` (server) or OAuth; read-only repo/commit/issue stats feeding
  project intelligence. Write actions are out of scope by design in V1.
- Rauell Local Bridge: designed (folder allowlist, hashing, change detection, explicit
  sync visibility) but intentionally not implemented until the desktop companion exists.

## Testing strategy

Vitest units cover every scoring/matching/classification rule (currently 27 tests,
including honesty invariants like "developing skills never score STRONG" and "no evidence
-> MISSING"). Integration smoke scripts run engines against the real database. Critical
UI flows (login, task creation, application workspace, approval execution) get E2E in the
next slice as the module pages land.
