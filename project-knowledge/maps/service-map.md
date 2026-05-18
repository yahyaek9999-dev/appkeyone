# Service Map

```mermaid
graph TB
  subgraph Internet
    cust[Customer WhatsApp]
    merch[Merchant Browser]
  end

  subgraph VPS[Windows VPS - 217.154.163.16]
    direction TB

    subgraph services[NSSM Services]
      caddy[mse-caddy<br/>:443/:80]
      saas[mse-saas<br/>Next.js<br/>:3000]
      wa[mse-wa<br/>whatsapp-web.js<br/>:3001]
      llm[mse-llm<br/>FastAPI Playwright<br/>:7788]
    end

    subgraph storage[Local Storage]
      db[(prod.db<br/>SQLite)]
      sessDir[sessions/<br/>per-merchant<br/>Chromium auth]
      chrome[chrome-profile/<br/>chatgpt.com session]
      backups[backups/<br/>pre-deploy-*]
    end
  end

  subgraph extLLM[External LLM Providers]
    openai[api.openai.com]
    gemini[generativelanguage.googleapis.com]
    claude[api.anthropic.com]
    groq[api.groq.com]
    openrouter[openrouter.ai]
    chatgpt[chatgpt.com via Chromium]
  end

  cust -- WhatsApp Web --> wa
  wa -- POST /api/whatsapp/incoming<br/>X-Internal-Secret --> saas
  saas -- POST /sessions/:id/send --> wa
  merch -- HTTPS 443 --> caddy --> saas

  saas --> db
  wa --> sessDir
  llm --> chrome

  saas -. provider override .-> openai
  saas -. .-> gemini
  saas -. .-> claude
  saas -. .-> groq
  saas -. .-> openrouter
  saas -- fallback --> llm --> chatgpt

  classDef service fill:#3b82f6,stroke:#1e40af,color:#fff
  classDef storage fill:#fbbf24,stroke:#b45309
  classDef external fill:#10b981,stroke:#065f46,color:#fff
  class caddy,saas,wa,llm service
  class db,sessDir,chrome,backups storage
  class openai,gemini,claude,groq,openrouter,chatgpt external
```

## Service responsibilities

### `mse-caddy`
- TLS termination + cert auto-renewal (Let's Encrypt)
- Reverse proxy: `app.keyone1.com` → `127.0.0.1:3000`
- HTTP → HTTPS redirect
- Config: `C:\app\deploy\Caddyfile`

### `mse-saas` (Next.js 14)
- The SaaS app: UI, REST API, Prisma DB, business logic, cron endpoints
- Port 3000 (loopback only)
- Logs: `C:\app\logs\mse-saas.{out,err}.log`
- Build artifact: `C:\app\saas\.next\`

### `mse-wa` (Node.js Express)
- WhatsApp gateway via `whatsapp-web.js`
- Multi-tenant; one Chromium per merchant in `whatsapp-service/sessions/session-<userId>/`
- Port 3001 (loopback only)
- Calls back to SaaS at `127.0.0.1:3000/api/whatsapp/incoming` for every customer message

### `mse-llm` (Python FastAPI)
- Legacy in-house LLM proxy
- Drives `chatgpt.com` via Playwright + Chrome profile
- Port 7788 (loopback only)
- ⚠️ Fragile: session expiry causes silent death. See `KNOWN_ISSUES.md`.

## Inter-service contracts

| From → To | Endpoint | Auth |
|---|---|---|
| `mse-wa` → `mse-saas` | `POST /api/whatsapp/incoming` | `X-Internal-Secret` |
| `mse-saas` → `mse-wa` | `POST /sessions/:userId/{start,send,pair,...}` | `X-Internal-Secret` |
| Cron task → `mse-saas` | `POST /api/cron/{broadcasts,follow-ups,daily-report,llm-prewarm}` | `X-Internal-Secret` |
| `mse-saas` → `mse-llm` | `POST /v1/chat/completions` | `Authorization: Bearer LLM_API_KEY` |
| `mse-saas` → external providers | various | Bearer / x-api-key (merchant's encrypted key) |

## Resource cost per service (typical, 8GB VPS)

| Service | RAM | CPU | Disk I/O |
|---|---|---|---|
| `mse-caddy` | ~20 MB | <1% | low |
| `mse-saas` (Node + Next) | ~300-500 MB | 5-15% (LLM bursts) | moderate |
| `mse-wa` (Node) | ~80 MB | <2% | low |
| `mse-wa` Chromium × 12 | ~400 MB each = 4.8 GB | per-session 1-5% | moderate (writes session state) |
| `mse-llm` (Python + Playwright Chrome) | ~600-900 MB | 5-20% when active | low |
| OS + buffers | ~1 GB | — | — |
| **Total budget** | **~7 GB / 8 GB** | — | — |

## Failure isolation

- **mse-llm dies** → only `keyone` merchants affected. External-provider merchants unaffected.
- **mse-wa dies** → all WhatsApp traffic stops; SaaS UI still works.
- **mse-saas dies** → everything stops. Caddy returns 502.
- **mse-caddy dies** → HTTPS dies but services keep running internally. Restart caddy to recover.
- **SQLite locked** → SaaS errors per request; auto-retry. Persistent → rebuild.
