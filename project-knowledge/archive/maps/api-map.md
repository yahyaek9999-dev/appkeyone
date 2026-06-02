# API Map

All routes under `saas/app/api/*/route.ts`. Auth column legend:
- `🔒 user` — requires merchant session cookie
- `🛡️ admin` — requires merchant session AND `User.role="admin"`
- `🔑 internal` — requires `X-Internal-Secret` header
- `🌐 public` — no auth (e.g. login, register)

| Path | Method | Auth | Purpose |
|---|---|---|---|
| **Auth** | | | |
| `/api/auth/login` | POST | 🌐 | Email/password login → cookie |
| `/api/auth/register` | POST | 🌐 | Create new user |
| **WhatsApp** | | | |
| `/api/whatsapp/incoming` | POST | 🔑 internal | **HOT PATH.** wa-service forwards every customer message here |
| `/api/whatsapp/start` | POST | 🔒 user | Start a WA session for this user |
| `/api/whatsapp/pair` | POST | 🔒 user | Get pairing code (alternative to QR) |
| `/api/whatsapp/status` | GET | 🔒 user | Session status + QR |
| `/api/whatsapp/logout` | POST | 🔒 user | Destroy session |
| **Bot config** | | | |
| `/api/bot/...` | GET/POST | 🔒 user | Bot settings (system prompt, persona, etc.) |
| `/api/working-hours` | GET/POST | 🔒 user | Working hours JSON + timezone |
| `/api/settings/ai-provider` | GET/POST | 🔒 user | Provider + encrypted API key |
| `/api/settings/ai-provider/test` | POST | 🔒 user | Validate provider key (calls `testProviderKey`) |
| **CRM / inbox** | | | |
| `/api/customers` | GET | 🔒 user | List customers with filters |
| `/api/customers/[id]` | GET/PATCH | 🔒 user | Customer detail |
| `/api/inbox/conversations` | GET | 🔒 user | List recent conversations |
| `/api/inbox/conversation/[id]` | GET | 🔒 user | Conversation detail + messages |
| `/api/inbox/conversation/[id]/pause` | POST | 🔒 user | Toggle `botPaused` (manual takeover) |
| `/api/inbox/conversation/[id]/send` | POST | 🔒 user | Send a manual reply (admin types) |
| `/api/inbox/conversation/[id]/suggest-reply` | POST | 🔒 user | AI-suggested reply (uses llm) |
| **Knowledge** | | | |
| `/api/knowledge/upload` | POST | 🔒 user | Upload PDF/DOCX → Document |
| `/api/knowledge/url` | POST | 🔒 user | Crawl a URL → Document |
| `/api/knowledge/text` | POST | 🔒 user | Manual text → Document |
| `/api/knowledge/[id]` | DELETE | 🔒 user | Remove Document |
| `/api/knowledge-gaps` | GET | 🔒 user | List unanswered questions |
| `/api/knowledge-gaps/[id]/resolve` | POST | 🔒 user | Mark gap as resolved |
| **Quick replies** | | | |
| `/api/quick-replies` | GET/POST | 🔒 user | List + create QR |
| `/api/quick-replies/[id]` | PATCH/DELETE | 🔒 user | Update / delete |
| **Broadcasts** | | | |
| `/api/broadcasts` | GET/POST | 🔒 user | List + create broadcast |
| `/api/broadcasts/[id]` | GET/DELETE | 🔒 user | Detail + cancel |
| **Orders** | | | |
| `/api/orders` | GET | 🔒 user | List orders with filters |
| `/api/orders/[id]` | GET/PATCH | 🔒 user | Detail + update status |
| **Safety / Admin** | | | |
| `/api/safety/status` | GET | 🔒 user | Current SafetyState for the bot |
| `/api/safety/clear` | POST | 🛡️ admin | Clear kill switch |
| `/api/admin/users` | GET | 🛡️ admin | List all merchants |
| `/api/admin/metrics` | GET | 🛡️ admin | Daily aggregated metrics |
| `/api/admin/plans` | GET/POST | 🛡️ admin | Plan management |
| **Intel / Analytics** | | | |
| `/api/intel/...` | GET | 🔒 user | Per-merchant intelligence dashboards |
| `/api/analytics` | GET | 🔒 user | Time-series analytics |
| **Chat playground** | | | |
| `/api/chat` | POST | 🔒 user | Test the bot from `/dashboard/playground` |
| **Onboarding** | | | |
| `/api/onboarding` | POST | 🔒 user | Multi-step setup wizard |
| **Cron (scheduled tasks)** | | | |
| `/api/cron/broadcasts` | POST | 🔑 internal | Broadcast worker (every 60s) |
| `/api/cron/follow-ups` | POST | 🔑 internal | Send queued follow-ups |
| `/api/cron/daily-report` | POST | 🔑 internal | Send daily reports per merchant tz |
| `/api/cron/llm-prewarm` | POST | 🔑 internal | Warm up the mse-llm Chromium |

## Notes

- `🔒 user` auth is implemented in `lib/auth.ts` — looks for the session cookie and validates JWT via `jose`. Returns 401 otherwise.
- `🔑 internal` auth is the `X-Internal-Secret` header check inline in each route.
- All API routes are `app/api/**/route.ts` (App Router style). They export `GET`, `POST`, etc. functions.
- Some routes use `export const dynamic = "force-dynamic"` to disable Next caching (especially cron and incoming).

## Bodies and response shapes

For exact shapes, read the route source directly. Most return:
```ts
{ ok: true, ... }      // success
{ error: "...", ... }  // failure with HTTP status code
```

The `incoming/route.ts` POST returns:
```ts
{
  ok: true,
  reply: string | null,
  blocked?: string,         // reason for null reply
  cooldownMs?: number,
  preDelayMs?: number,      // wait before showing "typing..."
  typingDelayMs?: number,   // duration of "typing..." indicator
  risk?: string,
  riskScore?: number,
  warmupStage?: string,
  mode?: string,            // "ooo" | "quick_reply" | "semantic_faq"
}
```
