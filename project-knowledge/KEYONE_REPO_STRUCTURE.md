# KEYONE — Repository Structure Guide

**Date:** 2026-06-02  
**Purpose:** Help future developers and AI agents understand the repository layout quickly.

---

## Root Directory

```
keyone/                        # Monorepo root
├── README.md                  # Project README
├── README_INDEX.md            # Documentation index (← start here)
├── LICENSE                    # MIT License
├── deploy.sh                  # macOS → VPS deploy (push + SSH + build)
├── docker-compose.yml         # LLM service container config
├── Dockerfile                 # LLM container build
├── PRICING_PLANS.md           # Plan tiers and pricing
├── keyone-growth-suite-report.md  # Most recent delivery report
│
├── saas/                      # 🔴 MAIN APPLICATION (Next.js 14)
├── whatsapp-service/          # WhatsApp microservice (Express + whatsapp-web.js)
├── deploy/                    # VPS deployment scripts
└── project-knowledge/         # Documentation & state exports
```

---

## `/saas/` — Next.js Application (the core)

```
saas/
├── app/                       # Next.js 14 App Router
│   ├── globals.css            # Design system (card, kpi, btn, surface, etc.)
│   ├── layout.tsx             # Root layout (RTL, dark theme, fonts)
│   ├── page.tsx               # Marketing homepage
│   ├── (auth)/login/          # Login page
│   ├── pricing/               # Pricing page
│   ├── dashboard/             # 🔴 MAIN DASHBOARD (28 page directories)
│   │   ├── layout.tsx         # Dashboard shell (sidebar + auth gate)
│   │   ├── nav-items.tsx      # Sidebar navigation definition
│   │   ├── page.tsx           # Overview dashboard (KPIs + sparklines)
│   │   ├── inbox/             # Inbox (conversations, messages, Customer 360)
│   │   ├── broadcasts/        # Broadcast campaigns + A/B + AI optimize
│   │   ├── orders/            # Order list + detail + status + shipping
│   │   ├── funnel/            # Sales funnel dashboard
│   │   ├── segments/          # Customer segmentation
│   │   ├── revenue-forecast/  # Revenue forecast + daily insights
│   │   ├── products/          # Product catalog (Phase 1)
│   │   ├── coupons/           # Coupon engine (Phase 1)
│   │   ├── customers/         # Customer list + chat view
│   │   ├── analytics/         # Analytics dashboard
│   │   ├── sales-brain/       # Sales Brain command center
│   │   ├── intel/             # Smart Intel detectors
│   │   ├── recovery/          # Lost-customer recovery
│   │   ├── bot/               # Bot configuration
│   │   ├── escalations/       # Escalation tickets
│   │   ├── integrations/      # Commerce integrations (Shopify, WooCommerce, etc.)
│   │   ├── settings/          # Account settings
│   │   ├── compliance/        # Compliance status
│   │   ├── safety/            # Safety audit logs
│   │   ├── usage/             # Plan usage
│   │   ├── leads/             # High-intent leads
│   │   ├── quick-replies/     # Quick reply templates
│   │   ├── working-hours/     # Business hours config
│   │   ├── knowledge/         # Knowledge base
│   │   ├── suggestions/       # Knowledge gap suggestions
│   │   ├── playground/        # AI playground
│   │   └── whatsapp/          # WhatsApp connection management
│   │
│   └── api/                   # 🔴 ALL API ROUTES (~90 route files)
│       ├── health/route.ts    # Public health endpoint
│       ├── auth/              # Login, logout
│       ├── inbox/             # Conversations, messages, send, pause, notes
│       ├── whatsapp/          # Session status, start, pair, logout, webhook
│       ├── customers/         # Customer 360 (profile, timeline, CRM)
│       ├── orders/            # Order CRUD + status + shipping
│       ├── broadcasts/        # Broadcast CRUD + generate + optimize + A/B
│       ├── funnel/            # Sales funnel computation
│       ├── segments/          # Customer segments
│       ├── revenue-forecast/  # Revenue forecast
│       ├── products/          # Product catalog
│       ├── coupons/           # Coupon engine + redemption
│       ├── cron/              # 🔴 Scheduled jobs (8 routes)
│       ├── admin/             # Platform admin operations
│       ├── commerce/          # Commerce integration webhooks
│       ├── intel/             # Smart Intel detectors
│       ├── sales-brain/       # Sales Brain API
│       ├── realtime/          # SSE realtime stream
│       └── ...                # And more
│
├── components/ui/             # 🔴 UI COMPONENTS (22 files)
│   ├── avatar.tsx             # Deterministic-color initials avatar
│   ├── status-dot.tsx         # Presence dot (online/offline/ai/warning)
│   ├── live-badge.tsx         # Connection state badge
│   ├── sparkline.tsx          # SVG line sparkline
│   ├── stat-grid.tsx          # Responsive KPI grid
│   ├── trend-badge.tsx        # Trend indicator (up/down %)
│   ├── skeleton.tsx           # Loading skeletons
│   ├── empty-state.tsx        # Empty state placeholder
│   ├── order-status-pill.tsx  # Order status badge
│   └── ...                    # 13 more
│
├── lib/                       # 🔴 SHARED BUSINESS LOGIC
│   ├── auth.ts                # JWT sessions, getUserId, getCurrentUser, requireUser
│   ├── db.ts                  # PrismaClient singleton
│   ├── wa.ts                  # WhatsApp service client (send, enqueue, start, status)
│   ├── llm.ts                 # Multi-provider LLM router (751 lines)
│   ├── utils.ts               # cn(), re-exports from lib/format.ts
│   ├── format.ts              # fmtNumber, fmtMoney, fmtDate, timeAgo (NEW)
│   ├── phone.ts               # formatCustomerPhone, extractPhone
│   ├── sales-engine.ts        # Sales signals, persuasion modes, CTA
│   ├── conversion-engine.ts   # Conversion score, hesitation score
│   ├── escalation.ts          # Escalation tickets
│   ├── notify.ts              # Admin/merchant notifications
│   │
│   ├── analytics/             # Funnel, segments, forecast, order-rollup
│   ├── broadcasts/            # Audience builder, analytics, AI optimize, extras
│   ├── catalog/               # Product cards + auto-coupon (Phase 1)
│   ├── shipping/              # Shipping notifications (Phase 1)
│   ├── commerce/              # Commerce integrations (orders, notifications, emails)
│   ├── daily-report/          # Aggregation, insights, formatting, delivery, extras
│   ├── intel/                 # Hot leads, lost customers, upsell, follow-ups
│   ├── messaging/             # Outgoing queue, compliance, providers (QR, Meta)
│   ├── safety/                # Trust engine, anti-ban, protection, queue pacing
│   ├── membership/            # Subscription plans, limits, default seeding
│   ├── providers/             # AI provider implementations (OpenAI, Gemini, etc.)
│   └── sales-brain/           # Revenue intelligence
│
├── hooks/                     # React hooks
│   └── use-realtime.ts        # SSE + fallback polling hook
│
├── workers/                   # Background workers
│   ├── index.ts               # Worker entry point (health :3010)
│   ├── broadcast.worker.ts    # BullMQ broadcast send worker
│   └── baileys.worker.js      # Experimental Baileys WebSocket worker
│
├── scripts/                   # Utility scripts
│   └── verify/                # Smoke-test verification suite
│
├── prisma/                    # Database
│   └── schema.prisma          # 🔴 DATA MODEL (1283 lines, 49 models)
│
├── next.config.js             # Next.js configuration
├── tailwind.config.ts         # Tailwind theme
├── tsconfig.json              # TypeScript config
├── package.json               # Dependencies + scripts
└── instrumentation.ts         # Sentry initialization
```

---

## `/deploy/` — Deployment & Operations

```
deploy/
├── deploy.sh                  # Mac → VPS (git push + SSH + npm ci + build + restart)
├── deploy.ps1                 # On-VPS PowerShell deploy (safety checks)
├── deploy-safe.ps1            # Safe remote deploy with pre-flight + backup + health
├── Caddyfile                  # Caddy v2 reverse proxy (HTTPS, security headers)
├── health-check.ps1           # VPS health diagnostic
├── backup-all.ps1             # Full VPS backup (db, .env, sessions, logs)
├── backup-db.ps1              # SQLite backup
├── install-backup-task.ps1    # Scheduled backup via Windows Task Scheduler
├── install-broadcasts-task.ps1 # Scheduled broadcast drain
├── install-followup-task.ps1  # Scheduled follow-up drain
├── env.saas.example           # SaaS environment template
├── env.whatsapp.example       # WhatsApp service environment template
├── env.llm.example            # LLM service environment template
├── RUNBOOK.md                 # Production runbook
└── README.md                  # Deploy docs overview
```

---

## WhatsApp Service

```
whatsapp-service/
├── src/
│   ├── index.js               # Express server (session management, send, health)
│   └── sessions.js            # WhatsApp Web client (QR, pairing, reconnect, cache)
├── .env.example               # Environment template
└── .wwebjs_cache/             # Session persistence directory
```

**Key endpoints** (Next.js → WA service):
- `POST /sessions/{userId}/send` — Send a WhatsApp message
- `GET /sessions/{userId}/status` — Session status
- `POST /sessions/{userId}/start` — Start session

---

## Documentation

```
project-knowledge/
├── KEYONE_MASTER_STATE_EXPORT.md      # 🔴 START HERE — comprehensive state
├── KEYONE_FEATURES.md                 # Feature documentation
├── KEYONE_FULL_PRODUCT_OVERVIEW.md    # Product overview
├── README.md                          # Index
├── KEYONE_REPO_CLEANUP_REPORT.md      # Cleanup report
└── archive/                           # Superseded docs (reference only)
    ├── maps/                          # API, DB, queue, service maps
    ├── flows/                         # AI, broadcast, memory flows
    ├── audits/                        # Security, performance audits
    ├── prompts/                       # AI agent prompts
    └── (27 .md files)                 # Architecture, deployment, safety
```

---

## Critical Files — Handle With Care

| File | Why |
|------|-----|
| `app/api/whatsapp/incoming/route.ts` | WhatsApp hot path — AI replies, order extraction, escalation (~1400 lines) |
| `lib/messaging/outgoing-queue.ts` | Outbound message safety — pacing, rate-limiting, idempotency |
| `lib/wa.ts` | WhatsApp service communication boundary |
| `app/api/cron/broadcasts/route.ts` | Broadcast send pipeline — personalization, drift guard |
| `prisma/schema.prisma` | Additive-only migrations |
| `lib/auth.ts` | Session management — breaking auth breaks everything |
| `deploy.sh` + `deploy/deploy.ps1` | Production deployment |

---

## Naming Conventions

| Context | Convention | Example |
|---------|-----------|---------|
| API routes | `route.ts` | `inbox/conversations/route.ts` |
| Dashboard pages | `page.tsx` + `*-ui.tsx` | `funnel/page.tsx` + `funnel-ui.tsx` |
| Components | kebab-case | `status-dot.tsx`, `empty-state.tsx` |
| Lib files | concise | `sales-engine.ts`, `phone.ts` |
| Hooks | `use-` prefix | `use-realtime.ts` |
| Imports | `@/` prefix only | `@/lib/auth` |

---

## Quick Facts for AI Agents

- **1 user = 1 account model** — no team/role system yet (Phase 2)
- **Auth:** JWT in httpOnly cookie, 30d expiry
- **WhatsApp:** Always use `wa.send()` (queued), never `wa.sendNow()`
- **Schema:** Additive only, `npx prisma db push --skip-generate`
- **CSS:** Custom classes in globals.css + Tailwind utility classes + lucide icons
- **Charts:** Custom SVG (no Recharts/Chart.js)
- **Ship:** `./deploy.sh` from root → auto-commit + push + VPS build + restart
