# Prompt: Feature Addition

> Use when the user asks for a new feature.

---

You are adding a new feature to **KEYONE**.

## Pre-flight

Read in order:
1. `/project-knowledge/README.md`
2. `/project-knowledge/AI_AGENT_RULES.md` final section "When proposing a new feature"
3. `/project-knowledge/ARCHITECTURE.md`
4. `/project-knowledge/CRITICAL_FILES.md`
5. Any subsystem doc related to your feature

## Step 1 — Understand the request

Ask the user (if not specified):
- **Who triggers it?** Merchant, customer, admin, cron?
- **When does it fire?** On message, on schedule, on UI click?
- **What's the success criterion?** What does "done" look like?
- **What's the failure behavior?** What if it can't run (DB error, LLM down)?
- **Is it observability-critical?** Should we add a `bump()` metric?
- **Is it audit-critical?** Should failures write `SafetyAudit`?

## Step 2 — Design

Write a short design doc in chat:

```markdown
## Feature: <name>

### Where it lives
- New file(s): <list>
- Modified file(s): <list> (with their CRITICAL_FILES tier)
- DB changes: <none | additive column X>

### Trigger
<what causes it to run>

### Flow
<3-5 step trace>

### Failure behavior
- DB error → <action>
- LLM timeout → <action>
- External service down → <action>

### Observability
- Metric: bump("<kind>") on success
- Audit: SafetyAudit on failure (category="<x>")

### Hot-path impact
<does this run per message? if yes, what's the latency added?>

### Testing
<how to verify works>
```

**Wait for user approval before implementing.**

## Step 3 — Implement

- New files: use `write_to_file`
- Existing files: use `edit` or `multi_edit` (preserves comments)
- Follow existing patterns (look at similar features for style)
- TypeScript types must compile (`npx tsc --noEmit`)
- Comments: explain **why**, not what

## Step 4 — Update docs

Update `/project-knowledge/`:
- If new file in `lib/` → add to `CRITICAL_FILES.md` with tier
- If new DB column → add to `DATABASE_SCHEMA.md`
- If new API → add to `maps/api-map.md`
- If touches hot path → add to `HOT_PATHS.md`
- If new flow → add a file under `flows/`
- If new cron → add to `maps/cron-jobs.md`
- If introduces ban risk → mention in `audits/anti-ban-audit.md`

## Step 5 — Deploy

Follow `/project-knowledge/prompts/deployment-prompt.md`.

## Hard rules

- **DO NOT** introduce a new external dependency without explicit user approval.
- **DO NOT** modify Tier-1 files (see `CRITICAL_FILES.md`) without stating the diff in chat first.
- **DO NOT** add new schema columns without a `@default(...)`.
- **DO NOT** add awaits on background-job paths in `incoming/route.ts`.
- **DO NOT** create new global state (singletons, top-level Maps) without considering multi-instance scaling.
- **DO** prefer extending existing modules over creating new ones.
- **DO** make new features toggleable via a `Bot.<feature>Enabled` boolean default false.

## Common feature patterns

- **New per-merchant setting** → add to `Bot` model + UI in `/dashboard/settings/...`
- **New cron** → add `/api/cron/<name>/route.ts` + install script in `deploy/`
- **New audit event** → use existing `SafetyAudit` with new category, no new table
- **New metric** → use existing `MetricEvent` with new `kind`, no new table

---

What's the feature?
