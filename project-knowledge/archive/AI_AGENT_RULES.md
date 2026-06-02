# Rules for AI agents working on KEYONE

> If you are Cascade / Claude / any LLM agent editing this codebase, **read this
> file end-to-end before any edit.** It encodes hard-won lessons from real
> production incidents.

---

## The four absolutes

1. **Do not refactor for style.** This codebase has working comments and
   working code. "Cleaning up" a hot path file has caused regressions.
2. **Do not delete comments.** Many comments encode the *reason* behind a
   non-obvious choice (e.g. atomic claim in broadcasts, self-send guard in
   notify). Strip them and the next agent will reintroduce the bug.
3. **Do not weaken safety or anti-ban code.** Real merchants will lose
   real WhatsApp accounts. See `SAFETY_ENGINE.md`.
4. **Do not bypass audit logging.** Every failure path on the hot path must
   write a `SafetyAudit` row. Production debugging depends on it.

---

## Files that are DANGEROUS to edit

See `CRITICAL_FILES.md` Tier 1. Specifically:

- `saas/app/api/whatsapp/incoming/route.ts`
- `saas/app/api/cron/broadcasts/route.ts`
- `saas/lib/safety/**`
- `saas/lib/llm.ts`
- `saas/lib/providers/provider-router.ts`
- `saas/lib/crypto-util.ts`
- `saas/lib/notify.ts`
- `saas/lib/wa.ts`
- `whatsapp-service/src/sessions.js`
- `saas/prisma/schema.prisma`

For any of these:
1. Read the file end-to-end first.
2. Read the matching doc in `project-knowledge/`.
3. State your plan explicitly to the user before editing.
4. Make the SMALLEST possible change.
5. Tell the user how to test it.

---

## Refactoring rules

- **Never** rename a function/type used across files unless the user asks.
- **Never** "modernize" comments (e.g. removing Arabic, paraphrasing).
- **Never** swap a library for a "cleaner" alternative (e.g. axios for fetch) without explicit ask.
- **Never** convert callbacks to async/await on background fire-and-forget paths — they're written that way intentionally.

---

## Hot-path warnings

Anything inside `app/api/whatsapp/incoming/route.ts` runs on every customer
message. **Do not** add:
- New synchronous external HTTP calls
- New blocking DB transactions across merchant boundaries
- LLM calls inside the safety engine
- LLM calls inside the order extractor
- `console.log` inside loops
- New `await` on background jobs (they use `.catch(() => {})` for a reason)

See `HOT_PATHS.md` for the full list.

---

## Database changes

- **Always additive.** New nullable column OR new column with `@default(...)`.
- **Never rename or drop** without manual SQL + DB backup + test on a copy.
- `prisma db push` is run by `deploy.ps1` stage 5. It refuses destructive
  changes by default. Don't override that refusal.
- Backup before any schema change: `.\deploy\backup-all.ps1`.

---

## Deployment precautions

- **Never** push to prod without first reading `SAFE_DEPLOYMENT_GUIDE.md`.
- **Never** skip the backup stage (`-SkipBackup` is for retries only).
- **Always** test the build locally (`npm run build` in `saas/`) before deploying.
- **Always** run `npx tsc --noEmit -p saas/` to catch type errors before SSH.
- The build takes 2-5 minutes on the VPS. **Do not** close SSH halfway.

---

## When the user asks for "a quick fix"

Often "quick fixes" are downstream workarounds that mask the real bug.
Before adding a workaround:
1. Identify the root cause.
2. Tell the user the root cause and your proposed minimal fix.
3. If the user STILL wants a workaround, document it in `KNOWN_ISSUES.md`
   so it can be revisited.

---

## When you're confused about whether something works

Don't guess. Use these tools:
- `grep_search` / `code_search` to find references
- `read_file` to check actual implementation
- `npx tsc --noEmit` to type-check after a change
- A test send via the dashboard playground

---

## Production-safe modification recipe

1. **Plan** — write 3-5 bullets describing what you'll change and why.
2. **Read** — relevant code + relevant doc.
3. **Edit** — minimum delta. Preserve comments.
4. **Type-check** — `npx tsc --noEmit -p .` from `saas/`.
5. **Self-review** — re-read your diff. Hunt for: removed comments, broadened conditions, new awaits, missing try/catch.
6. **Plan deploy** — verify which files need to be `scp`'d, whether a `prisma db push` is needed.
7. **Inform user** — give them a copy-paste deploy command.
8. **Update docs** — if the change is non-trivial, append to `REGRESSION_RISKS.md`.

---

## Things that look like bugs but are NOT

- The `lib/safety/broadcast.ts` file exists but seems unused — **uncertain**, see `KNOWN_ISSUES.md`. Don't delete it.
- The `lib/anti-ban.ts` legacy file is partially imported — by design, see `CRITICAL_FILES.md`.
- The dev fallback secret `dev-internal-secret-change-me` — only used when env is missing. Don't remove the fallback, just ensure prod has the env.
- `Bot.aiProvider="keyone"` default — intentional, see `AI_PROVIDERS.md`.
- The chunked KB approach with no embeddings — by design, see `KNOWLEDGE_BASE_SYSTEM.md`.

---

## When proposing a new feature

1. **Where does it live?** Add the new file to `CRITICAL_FILES.md` with a tier rating.
2. **Does it touch a hot path?** If yes, justify it in writing.
3. **Does it need a migration?** If yes, write the migration plan first.
4. **Is there observability?** Use `bump("...")` for counters; use `SafetyAudit` for high-signal events.
5. **Is there a kill switch?** Critical features should have an admin toggle.

---

## Final reminder

The codebase is in production. Real merchants pay real money. Real customers
chat with real bots. A 30-minute outage means a 30-minute hole in someone's
revenue. **Caution beats cleverness.**
