# Prompt: AI Agent Context Bootstrap

> Paste this at the start of a fresh AI agent session to bootstrap project
> understanding without re-reading the whole codebase.

---

You are working on **KEYONE**, a production WhatsApp AI SaaS at `app.keyone1.com`.

## Read these files BEFORE doing anything else:

1. `/project-knowledge/README.md` — orientation
2. `/project-knowledge/AI_AGENT_RULES.md` — **hard rules you must follow**
3. `/project-knowledge/ARCHITECTURE.md` — what runs where
4. `/project-knowledge/CRITICAL_FILES.md` — risk-tiered file list
5. `/project-knowledge/HOT_PATHS.md` — concurrency-sensitive code

## Then, depending on the task:

- **Bug fix on the hot path** → read `/project-knowledge/flows/whatsapp-incoming-flow.md` + `/project-knowledge/KNOWN_ISSUES.md` + `/project-knowledge/REGRESSION_RISKS.md`
- **New feature** → read the relevant subsystem doc (e.g. `SALES_ENGINE.md`) + `AI_AGENT_RULES.md` final section "When proposing a new feature"
- **Deployment** → `/project-knowledge/DEPLOYMENT.md` + `/project-knowledge/SAFE_DEPLOYMENT_GUIDE.md`
- **Production incident** → `/project-knowledge/INCIDENT_RESPONSE.md` + `/project-knowledge/TROUBLESHOOTING.md`
- **Performance question** → `/project-knowledge/PERFORMANCE.md` + `/project-knowledge/audits/performance-audit.md`
- **Schema change** → `/project-knowledge/DATABASE_SCHEMA.md` + `/project-knowledge/POSTGRES_MIGRATION_PLAN.md`

## Non-negotiable rules:

1. **Don't refactor for style.** Working code stays.
2. **Don't strip comments.** Many encode tribal knowledge.
3. **Don't weaken safety/anti-ban code.** Real bans, real money.
4. **Don't bypass `SafetyAudit` writes.** Production debugging depends on them.
5. **Don't add migrations that drop/rename columns.**
6. **Don't await background jobs in `app/api/whatsapp/incoming/route.ts`.**
7. **Don't add LLM calls inside `lib/safety/`.**
8. **Don't commit secrets.** `AUTH_SECRET`, `SAAS_INTERNAL_SECRET`, etc. live in env files only.

## Production environment:

- **Host:** `administrator@217.154.163.16` (Windows Server, NSSM-managed services)
- **Install dir:** `C:\app`
- **Services:** `mse-saas` (Next 3000), `mse-wa` (3001), `mse-llm` (7788), `mse-caddy` (443)
- **DB:** SQLite at `C:\app\saas\prisma\prod.db`
- **Deploy:** `ssh administrator@217.154.163.16 'powershell -File C:\app\deploy\deploy.ps1'`

## Tech stack:

- **Frontend/Backend:** Next.js 14 (App Router), TypeScript 5.6, Tailwind 3.4
- **ORM:** Prisma 5.22 (provider: sqlite)
- **Auth:** Jose (JWT) + bcryptjs
- **WhatsApp:** whatsapp-web.js 1.26 (unofficial)
- **LLM:** in-house mse-llm (Playwright→chatgpt.com) OR external (OpenAI/Gemini/Claude/Groq/OpenRouter)
- **HTTPS:** Caddy 2 with Let's Encrypt

## When unsure:

- Read `/project-knowledge/KNOWN_ISSUES.md` for active bugs
- Read `/project-knowledge/REGRESSION_RISKS.md` for "don't reintroduce" list
- If still unsure, **ask the user** before editing

## After making a change:

1. Run `npx tsc --noEmit -p .` from `saas/`
2. List the modified files for the user
3. Provide a copy-paste deploy command
4. Suggest a manual test from `/project-knowledge/TESTING_CHECKLIST.md`
5. If non-trivial: append to `/project-knowledge/REGRESSION_RISKS.md`

---

Acknowledge that you've read the above before proceeding with any task.
