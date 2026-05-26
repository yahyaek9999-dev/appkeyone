# KEYONE — Full Product Overview

## What is KEYONE?

KEYONE is an AI-powered WhatsApp sales assistant for Arabic-speaking businesses. It connects to a merchant's WhatsApp number, automatically replies to customers using AI, extracts orders from conversations, sends broadcasts, and integrates with e-commerce platforms — all in Arabic.

## Architecture

```
[WhatsApp] ←→ [WA Service (Node.js)]
                   ↓ HTTP
[SaaS App (Next.js)] ←→ [PostgreSQL/SQLite]
       ↓
[AI Providers (OpenAI, Gemini, Claude, KEYONE, ...)]
```

- **SaaS App**: Next.js 14+, App Router, TypeScript, TailwindCSS, Prisma ORM
- **WA Service**: Node.js, whatsapp-web.js (Baileys), WebSocket
- **DB**: SQLite (dev) / PostgreSQL (production) via Prisma
- **AI**: Multi-provider router with caching, fallback, and monitoring

## Who is it for?

- **E-commerce merchants** in Egypt, Saudi Arabia, and MENA
- **Small to medium businesses** that receive orders via WhatsApp
- **Arabic-speaking** store owners who want automated customer service
- **Non-technical merchants** who need a simple "connect and forget" experience

## Core User Journey

1. **Sign up** → Create account with email + password
2. **Connect WhatsApp** → Scan QR code or enter pairing code
3. **Configure bot** → Set business name, persona, working hours
4. **Add knowledge** → Upload products, FAQs, policies
5. **Connect store** (optional) → Link Shopify/WooCommerce/Salla/Zid
6. **Go live** → Bot replies to WhatsApp messages automatically
7. **Monitor** → Dashboard shows orders, customers, leads, analytics

## Key Metrics (Production)

- Active WhatsApp sessions handling real traffic
- AI response time: sub-second via cache, 2-5s via LLM
- Auto-extraction of orders from natural Arabic conversation
- Multi-provider AI with automatic fallback
- Safety engine preventing WhatsApp bans

## Module Map

```
Module               Status     Description
──────────────────────────────────────────────────────
WhatsApp Core        ✅ Live    QR/pairing, sessions, messaging
AI Engine            ✅ Live    Multi-provider, caching, context
Orders               ✅ Live    Extraction, management, timeline
Customers            ✅ Live    Capture, scoring, segmentation
Knowledge Base       ✅ Live    Import, search, suggestions
Quick Replies        ✅ Live    Keyword-based fast answers
Broadcasts           ✅ Live    Campaigns, personalization, rate-limited
Follow-ups           ✅ Live    Automated nudges, quiet hours
Safety Engine        ✅ Live    Anti-ban, rate limits, kill-switch
Sales Intelligence   ✅ Live    Scoring, negotiation, persuasion
Memory Engine        ✅ Live    Summaries, facts, preferences
Commerce             ✅ Live    Shopify, WooCommerce, Salla, Zid
Daily Report         ✅ Live    WhatsApp business summary
Escalations          ✅ Live    Human handoff, severity tracking
Working Hours        ✅ Live    Out-of-office auto-reply
Admin Dashboard      ✅ Live    Users, plans, metrics, logs
Subscription         ✅ Live    Plans, usage, limits, billing
Meta Cloud API       ⏳ Beta    Optional Meta Business API
PostgreSQL           ⏳ Beta    Production migration ready
```

## Platform Integrations

| Integration | Method | Status |
|------------|--------|--------|
| Shopify | Webhooks + REST API | ✅ Supported |
| WooCommerce | Webhooks + REST API | ✅ Supported |
| Salla | OAuth2 + Webhooks | ✅ Supported |
| Zid | OAuth2 + Webhooks | ✅ Supported |
| Custom | Generic Webhook + API Key | ✅ Supported |
| Meta Cloud API | Graph API | ⏳ Beta |

## AI Providers

| Provider | Models | Status |
|----------|--------|--------|
| KEYONE (default) | Internal | ✅ Live |
| OpenAI | GPT-4o, GPT-4o-mini | ✅ Live |
| Google Gemini | Gemini 2.0 Flash | ✅ Live |
| Anthropic Claude | Claude 3.5 Sonnet | ✅ Live |
| Groq | Llama 3, Mixtral | ✅ Live |
| OpenRouter | 200+ models | ✅ Live |

## Deployment

- **Hosting**: VPS (Ubuntu 22.04+), Docker-ready
- **DB**: SQLite (dev) → PostgreSQL (prod migration planned)
- **Domain**: appkeyone.com
- **WhatsApp Service**: Node.js process on same VPS
- **Deploy**: PowerShell scripts with backup + health check
- **SSL**: Caddy auto-https

## Pricing Billing

- Manual billing (admin-managed)
- Plans: Starter / Pro / Business / Enterprise
- Monthly or yearly cycles
- Usage-based limits with rollover
- Feature flags per plan tier

## Security

- All passwords hashed (bcrypt)
- API keys hashed at rest
- Webhook secrets AES-256-GCM encrypted
- Rate limiting on all public endpoints
- Session management with expiry
- Admin-only routes for management
- Safety engine for WhatsApp abuse prevention

## Language Support

- Arabic (primary, RTL UI)
- English (secondary)
- Arabic-first in all customer-facing messages
- Currency support: EGP, SAR, USD

## Development

- `saas/` — Next.js SaaS application
- `whatsapp-service/` — WhatsApp WebSocket service
- `deploy/` — Deployment scripts and configs
- `project-knowledge/` — Architecture documentation
- `keyone-research-output/` — Research and planning
