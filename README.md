# Rauell OS

Roy Okola Otieno's Personal AI Operating System. One application where projects, tasks,
job and scholarship opportunities, applications, leads, professional network, documents
and email intelligence live together, with deterministic scoring engines and an AI layer
that prepares work but never takes sensitive action without approval.

Part of the [Rauell Systems](https://rauell.systems) ecosystem. Target deployment:
`os.rauell.systems` (Vercel + Neon PostgreSQL).

---

## Status: Foundation (this PR)

This is the first working slice of the system, built to the full specification's
architecture. What is real in this branch:

**Working end to end**
- Authentication: owner account setup (SETUP_TOKEN-gated when configured), scrypt password
  hashing, HTTP-only session cookies, audit logging, rate-limit-ready structure
- Master Profile seed: Roy's full professional context imported as structured, editable,
  `USER_PROVIDED` data (education, employment, 17 evidence-linked skills, certificates,
  projects, goals, memories, knowledge base)
- Daily Command Center (`/home`): deterministic Daily Brief built from live data
  (deadlines, emails needing response, follow-ups due, application gaps, stale projects)
- Transparent opportunity scoring: deterministic, explainable 0-100 job fit (7 weighted
  factors with evidence pointers) and separate scholarship/programme scoring (funding
  quality, eligibility, English requirements, competitiveness, verdicts + next action)
- Requirement-to-evidence mapping: extracts requirements from any job description and maps
  each to Roy's evidence with honest strengths (STRONG / MODERATE / DEVELOPING / MISSING).
  Developing skills are never upgraded
- Task priority engine: attributable score with stated reasons; deadline, source weight,
  goal/application/lead links, blocking relationships, quick wins, staleness, status
- Business lead scoring that separates observed evidence, inference and hypothesis
- Email intelligence: deterministic classification with confidence scores (AI refinement
  optional), needs-response tracking, correction learning hooks
- Follow-up radar: rule-based detection (outreach silence, unanswered email, pending
  referees before deadlines, quiet leads) with anti-harassment policy windows
- Approval Center engine: every sensitive action type modeled; approval, execution,
  honest failure when an integration is not connected; nothing external is sent without Roy
- Automation engine: 6 registered rules (daily brief, weekly review, deadline radar,
  follow-up radar, opportunity re-scoring, GitHub sync) with modes (Manual / Suggest /
  Auto-prepare / Auto-execute-safe), run history and persistence
- AI orchestration: provider abstraction (OpenAI / Anthropic / Google), model roles
  (fast / research / reasoning / writing / doc-extract / embedding), timeouts, retries,
  response caching, token + cost tracking, monthly budget guard. The app is fully
  functional with AI disabled (deterministic fallbacks everywhere)
- Integration adapters: Google OAuth (Gmail read+send, Calendar, Drive) and GitHub, with
  encrypted token storage (AES-256-GCM), refresh handling and honest NOT_CONFIGURED state
- Global search across tasks, projects, opportunities, applications, organizations,
  people, documents, notes, emails, leads
- Duplicate detection (URL canonicalization + fuzzy title matching)
- Knowledge base with embedding + keyword retrieval paths (RAG-ready)
- Local file storage adapter for documents (S3-compatible swap planned)
- Activity timeline, decision log, notifications, preferences, data model for everything
  in the spec's entity list (48 tables)

**Deliberately not in this commit** (next slices): the full module UIs (inbox, tasks,
projects, opportunities, applications, documents, network, leads, approvals, automations
pages), the AI assistant chat surface, onboarding wizard and cron wiring to a scheduler
provider. The engines behind all of them exist and are tested; the PR series continues on
this branch.

---

## Stack

| Layer     | Choice                                                        |
| --------- | ------------------------------------------------------------- |
| Framework | Next.js 15 (App Router, Server Components, Server Actions)     |
| Language  | TypeScript (strict)                                           |
| Database  | PostgreSQL (Neon in production, embedded Postgres for dev)     |
| ORM       | Prisma 7 (query compiler + `@prisma/adapter-pg`, no native engine binaries) |
| Styling   | Tailwind CSS v4, custom calm engineering design tokens         |
| AI        | Provider abstraction: OpenAI / Anthropic / Gemini              |
| Tests     | Vitest (27 passing: scoring, matching, dedupe, email, crypto)  |

## Quick start

```bash
# 1. Install (postinstall generates the Prisma client)
npm install

# 2. Configure
cp .env.example .env
#   - DATABASE_URL: your Neon connection string, or use the local dev DB below
#   - APP_ENCRYPTION_KEY: openssl rand -base64 32
#   - CRON_SECRET: openssl rand -hex 24
#   - optional: AI_API_KEY, GOOGLE_CLIENT_ID/SECRET, GITHUB_TOKEN, SETUP_TOKEN

# 3a. Local development database (no external services needed)
npm run db:up          # embedded PostgreSQL on localhost:5433 (data in .data/postgres)
npm run db:apply       # apply prisma/migrations (mirrors prisma migrate deploy)
npm run db:seed        # import Roy's master profile (SEED_PASSWORD env sets the password)

# 3b. ...or point DATABASE_URL at Neon and run:
#   npx prisma migrate deploy && npm run db:seed

# 4. Run
npm run dev            # http://localhost:3000
```

Default seeded login (local only): `roy@rauell.systems` / `ChangeMe-RauellOS-2025`
(override with `SEED_PASSWORD`; change it after first login).

### Verification

```bash
npm run verify         # lint + typecheck + tests + production build
```

Also verified in development:

```bash
npm run db:up
node scripts/auto-check.mts      # registers and runs the automation rules
node scripts/scoring-smoke.mts   # scores a real job + scholarship against the seeded profile
```

## Scheduler

`GET /api/cron` with `Authorization: Bearer $CRON_SECRET` runs every due automation rule
(idempotent, data-driven `nextRunAt`). Point any uptime pinger or Vercel Cron at it.
Rules and their modes live in the database (`AutomationRule`) and can be paused or
reconfigured without code changes.

## Security notes

- All OAuth tokens encrypted at rest with AES-256-GCM (`APP_ENCRYPTION_KEY`)
- Passwords hashed with scrypt; sessions stored as SHA-256 token hashes
- Row-level user isolation on every query path (single-owner system, enforced anyway)
- No secrets in source; `.env` is gitignored; `.env.example` documents every variable
- AI processing of documents requires `allowAiProcessing` on the document
- Sending email / external events / outreach / publishing / deleting: Approval Center only

See `docs/ARCHITECTURE.md` and `docs/DATABASE.md` for the full map.
