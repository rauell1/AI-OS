> **ARCHIVED — describes the superseded PR #1 implementation, not the current codebase.**
>
> From `arena/01a0512a-ai-os` (commit `17a8edb`), merged as PR #1 then reverted by the PR #2
> merge. It documents a 48-model **Prisma** schema. `main` implements a closely parallel
> 45-table model in raw SQL in `src/lib/schema.ts` — the entity map below is still the best
> written description of the domain, but the Prisma syntax, enum handling and migration
> commands do not apply to `main`. See `docs/SALVAGE.md`.

# Rauell OS - Database Schema

PostgreSQL (Neon). 48 tables, normalized, every user-scoped row cascades on user delete.
Migration: `prisma/migrations/20250830000000_init/migration.sql`.

## Entity map

### Identity & access
- `User` - single owner account (multiuser-ready via userId scoping everywhere)
- `Session` - SHA-256 token hashes, expiry, IP/UA for audit

### Master Profile (source of truth for the CV engine)
- `Profile` - identity, headline, summary, links, career preferences (JSON)
- `Education` - degrees with classification (JKUAT B.Sc., Second Class Upper)
- `Employment` - roles with highlights JSON, FK to `Organization`
- `Skill` + `SkillEvidence` - proficiency 1-5, years, confidence, verification status;
  evidence rows point at PROJECT/EMPLOYMENT/EDUCATION/CERTIFICATE records
- `Certificate` - trainings and programmes (FRED, Ebara, RCMRD GIS, Unicaf MBA, ...)

### Work graph
- `Project` + `ProjectRepository` - first-class projects with milestones, goals, AI
  summaries, linked GitHub repos, activity timestamps
- `Organization` - one record, many roles (employer/university/client/partner/lead) via
  `types` JSON
- `Person` + `Interaction` - normalized people with roles, last interaction, follow-ups
- `Note`, `KnowledgeItem` (with embedding JSON for RAG), `Decision`, `Goal`, `Memory`

### Opportunities & applications
- `Opportunity` - one table for JOB / SCHOLARSHIP / PROGRAMME / FELLOWSHIP / GRANT /
  COMPETITION / TRAINING with type-specific nullable fields (funding, English
  requirements, nationality restrictions, salary, consortium...), source metadata,
  deadline lifecycle and transparent scoring columns (`fitScore`, `fitBreakdown` JSON of
  factors with evidence, `fitLabel`, `fitExplanation`)
- `Application` (1:1 with opportunity) - status pipeline DISCOVERED..ACCEPTED, readiness,
  requirements, questions, events, generated docs
- `ApplicationRequirement` - per-requirement status MISSING/REQUESTED/READY/SUBMITTED/WAIVED
- `ApplicationQuestion` - reusable library answers + application-specific versions
- `ApplicationEvent` - immutable application history
- `GeneratedDoc` - versioned CVs, cover letters, statements with promptVersion, model,
  approvedAt, submittedAt (submitted versions are never overwritten)

### Execution
- `Task` + `TaskDependency` - unified tasks from every source with priorityScore +
  reasons JSON, links to project/application/lead/person/goal
- `Approval` - the Approval Center: type, payload (kind-discriminated JSON), preview,
  status PENDING..EXECUTED, executionError for honest partial execution
- `AutomationRule` + `AutomationRun` - registered rules with mode, schedule, nextRunAt,
  per-run results
- `JobRun` - retryable background job abstraction (idempotency keys) for future queueing
- `Brief` - generated daily/weekly briefs (JSON content + optional AI narrative)
- `Notification` - typed, severity-ranked, read tracking

### Communications
- `EmailThread` + `EmailMessage` - categories with confidence scores, needsResponse,
  AI extract JSON, user correction flag; unique on (userId, externalId) for idempotent sync
- `CalendarEvent` - manual + Google events with meeting briefs
- `FollowUp` - policy-window follow-ups (anti-harassment: policyDays, lastNudgedAt)
- `Lead` + `Outreach` - business development with separated observedEvidence / inferences
  / hypotheses JSON and lead scoring

### Documents & network
- `Document` - vault metadata (category, sensitivity, expiry, hash, storage key,
  allowAiProcessing); binaries live in the storage adapter, not Postgres
- `Referee` - permission and letter status per referee

### Platform
- `Integration` + `SyncRun` - per-provider OAuth state with AES-256-GCM encrypted tokens
- `AuditLog` - auth and security events
- `ActivityEvent` - immutable timeline (actor: USER/AI/AUTOMATION/SYSTEM)
- `AiRun` + `AiCache` - every AI call: role, provider, model, tokens, cost, latency,
  purpose, promptVersion; cache for cost control
- `Preference`, `PromptVersion` - settings and versioned prompts

## Conventions

- cuid() string primary keys, client-generated
- Enums are Postgres enums (29 of them); statuses map 1:1 to the spec's pipelines
- JSON columns are typed in application code via zod-aware helpers where parsed
- Compound uniques enable idempotent upserts (e.g. `Integration_userId_provider_key`)
- Indexes on every hot path: userId+status, userId+dueAt, deadlineAt, receivedAt

## Migration notes

The initial migration SQL is committed. Environments with access to Prisma's engine CDN
use `npx prisma migrate deploy` as usual; the sandboxed dev flow uses
`npm run db:apply` (ledger table `_rauell_migrations`, identical semantics). The emitter
`scripts/schema-to-sql.mjs` regenerates DDL from the schema when the native diff tool is
unavailable; verify with `npx prisma migrate diff` when network allows.
