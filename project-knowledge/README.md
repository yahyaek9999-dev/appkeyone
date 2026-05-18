# KEYONE Engineering Knowledge Base

This folder is the **single source of truth** for the KEYONE production system
(`app.keyone1.com`). It is intended for:

- Future AI agents (Cascade / Claude / similar) loading project context
- New engineers onboarding without re-auditing the whole repo
- On-call engineers responding to production incidents
- Anyone proposing a change to a hot path

Everything here is grounded in the **actual code at `C:\app` on the VPS and
the source tree at `/Users/yahyaemad/Desktop/mse_ai_api-main`** as of
**2026-05-17**. When something is uncertain it is **explicitly marked**.

> Do NOT trust generic AI/SaaS advice that contradicts a file in this folder.
> If you find a contradiction, the **code wins** and this folder is wrong —
> file an issue.

---

## Map of contents

### Foundational (read first)
| File | When to open it |
|---|---|
| `ARCHITECTURE.md` | You don't know what runs where |
| `SYSTEM_FLOWS.md` | You want a high-level picture of a customer message |
| `CRITICAL_FILES.md` | You're about to edit and want to know risk |
| `HOT_PATHS.md` | You're touching latency-sensitive code |
| `AI_AGENT_RULES.md` | You ARE an AI agent. **Read this before any edit.** |
| `KNOWN_ISSUES.md` | The bug you're chasing may already be tracked |

### Subsystems
| File | Owns |
|---|---|
| `DATABASE_SCHEMA.md` | All 18 Prisma models + relations |
| `SAFETY_ENGINE.md` | Anti-ban, warmup, kill switch, trust |
| `AI_PROVIDERS.md` | LLM router, circuit breaker, multi-provider |
| `BROADCAST_SYSTEM.md` | Queue, atomic claim, personalization |
| `ORDER_PIPELINE.md` | Extraction, confidence, dedupe |
| `KNOWLEDGE_BASE_SYSTEM.md` | Chunking, top-K retrieval, cache |
| `SALES_ENGINE.md` | Signals, modes, negotiation, gating |
| `WORKING_HOURS.md` | Timezone-aware scheduling |
| `NOTIFICATION_SYSTEM.md` | Merchant alerts, fallback chain, audit |
| `MEMORY_ENGINE.md` | Rolling summary + facts JSON |
| `PERFORMANCE.md` | Caching layers, concurrency, fast-path |
| `SECURITY.md` | Auth, secrets, encryption, internal-secret |

### Operations
| File | When |
|---|---|
| `DEPLOYMENT.md` | Standard deploy procedure |
| `SAFE_DEPLOYMENT_GUIDE.md` | Detailed safe-deploy with rollback |
| `TROUBLESHOOTING.md` | Service down / common errors |
| `INCIDENT_RESPONSE.md` | A merchant reports something broken in prod |
| `TESTING_CHECKLIST.md` | Pre-launch + post-deploy verification |
| `REGRESSION_RISKS.md` | List of edits that have caused regressions historically |

### Strategic
| File | Topic |
|---|---|
| `SCALING_PLAN.md` | When to leave SQLite, when to add nodes |
| `META_CLOUD_API_PLAN.md` | Moving off whatsapp-web.js |
| `POSTGRES_MIGRATION_PLAN.md` | DB migration steps |

### Subdirectories
- **`flows/`** — Step-by-step diagrams of specific request paths
- **`maps/`** — Dependency / service / API / DB maps
- **`audits/`** — Snapshot audits with findings + remediation
- **`prompts/`** — Reusable prompts for AI agents working on this codebase

---

## Hard rules for AI agents

1. **NEVER write code without first reading `AI_AGENT_RULES.md`.**
2. **NEVER refactor for style.** Only change behavior when explicitly asked.
3. **NEVER delete or weaken safety/anti-ban code.** That code prevents
   real WhatsApp bans on real merchant accounts.
4. **NEVER add migrations without `npx prisma db push` plan in `DEPLOYMENT.md`.**
5. **NEVER touch `lib/safety/` without reading `SAFETY_ENGINE.md` end to end.**
6. **NEVER bypass `notifyMerchant`/`notifyAdmin` audit writes.** Production
   relies on them to surface failures.
7. **Comments in code matter.** Many comments encode tribal knowledge about
   real production incidents. Don't strip them.

---

## How to keep this folder useful

- After a real incident: append a note to `INCIDENT_RESPONSE.md` + update
  `KNOWN_ISSUES.md` if the bug is unresolved.
- After fixing a tricky bug: add a one-paragraph entry to
  `REGRESSION_RISKS.md` (so we don't break it again).
- After a deploy: if anything in the deploy was non-obvious, append to
  `SAFE_DEPLOYMENT_GUIDE.md`.
- This folder is **NOT** auto-generated. If you touch it, write actual,
  specific, file-and-line-grounded content.
