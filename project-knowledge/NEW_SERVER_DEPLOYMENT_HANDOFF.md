# New Server Deployment Handoff

**Generated:** 2026-08-19 14:34 UTC  
**Status:** Code complete, build passing — blocked on new server

---

## 1. Exact Git Commit Ready for Deployment

```
Commit SHA:  fdc66fd9c7471277671052920d7ca266b360b621
Short:       fdc66fd
Branch:      main
```

### Commits included in this work (admin discovery fix):

```
fdc66fd  chore: remove debug logging
09366a0  fix(admin): add /dashboard route to ADMIN_WORKSPACE to ensure correct workspace detection
37363a6  debug(admin): add console logging for sidebar item count (removed in fdc66fd)
91de3d7  fix(admin): render all 66 items in ADMIN_WORKSPACE sidebar
a9d17d0  docs: admin discovery summary
13f1dc1  docs: final production verification
95b7c33  docs: platform admin discovery — root cause analysis
7b65596  fix(admin): bypass plan-capability gates for platform admin navigation (THE KEY FIX)
```

---

## 2. What Was Fixed

### Root cause
Platform Admin sidebar was showing only 7–8 items instead of all 65 dashboard routes.

Three compounding bugs:

**Bug 1 — Capability gates locked admin items** (`layout.tsx:84`)  
The `enforce` flag was not bypassed for admin users. With `enforce=true`, `navItemLocked()` applied plan-based capability gates to ADMIN_WORKSPACE items, locking them or hiding them.

**Fix:**
```typescript
// BEFORE
const enforce = !!ent?.enforce;

// AFTER
const enforce = isAdmin ? false : !!ent?.enforce;
```

**Bug 2 — Wrong workspace selected at /dashboard root** (`nav-items.tsx:287`)  
`workspaceForPath()` searches workspace items for a path match. ADMIN_WORKSPACE had no `/dashboard` root item, so the function fell back to the first customer workspace when the admin was on `/dashboard`. This made the admin see customer workspace items (7–8 items) instead of ADMIN_WORKSPACE items.

**Fix:** Added `/dashboard` as a hidden marker item in ADMIN_WORKSPACE. This item is filtered from rendering but allows `workspaceForPath()` to correctly select ADMIN_WORKSPACE.

**Bug 3 — Rendered `viewed.items` instead of `ADMIN_WORKSPACE.items`** (`nav-items.tsx:742`)  
Even when the viewed workspace was ADMIN_WORKSPACE, the render used `viewed.items` which could be affected by the `accessibleWorkspaces()` filter. Explicitly reading from `ADMIN_WORKSPACE.items` bypasses all customer-side filtering.

**Fix:**
```typescript
const itemsToRender = viewed.id === "platform_admin" ? ADMIN_WORKSPACE.items : viewed.items;
```

---

## 3. Build Status

```
TypeScript:    ✅ EXIT 0 (no errors)
Next.js build: ✅ 187 pages compiled
Tests:         ✅ (no test suite failures on these changes)
```

---

## 4. Route Inventory

### Filesystem counts (as of commit fdc66fd)

| Type | Count |
|------|-------|
| `/dashboard/**` pages (all, including nested) | 94 |
| `/dashboard/**` pages (non-nested, non-dynamic) | 90 |
| `/admin/**` pages (non-dynamic, excl. /login) | 53 |
| **ADMIN_WORKSPACE configured items** | **67** (1 hidden marker + 64 dashboard + 2 admin) |

### Parity check: Filesystem vs ADMIN_WORKSPACE (dashboard routes only)

```
Filesystem non-nested /dashboard routes (excl. root):  64
ADMIN_WORKSPACE /dashboard routes:                     64
Gap:                                                    0  ✅
```

### ADMIN_WORKSPACE configured items (65 visible after filtering /dashboard marker)

**Platform Control (4):**
- /dashboard/feature-center — Feature Center
- /admin/feature-control — Feature Control
- /admin/memberships — Memberships
- /dashboard/memberships — Memberships Matrix

**Messaging & Inbox (7):**
- /dashboard/inbox
- /dashboard/quick-replies
- /dashboard/escalations
- /dashboard/whatsapp-health
- /dashboard/meta-health
- /dashboard/whatsapp
- /dashboard/meta

**Customers & Segmentation (4):**
- /dashboard/customers
- /dashboard/leads
- /dashboard/segments
- /dashboard/import

**Sales & Commerce (3):**
- /dashboard/orders
- /dashboard/products
- /dashboard/coupons

**Marketing & Growth (5):**
- /dashboard/broadcasts-pro
- /dashboard/broadcasts
- /dashboard/recovery
- /dashboard/qr-queue
- /dashboard/sms

**Automation & AI (10):**
- /dashboard/bot
- /dashboard/bot-builder
- /dashboard/automations
- /dashboard/flow-builder
- /dashboard/agents
- /dashboard/ai-operations
- /dashboard/knowledge
- /dashboard/knowledge-brain
- /dashboard/brain
- /dashboard/working-hours

**Analytics & Revenue (11):**
- /dashboard/analytics
- /dashboard/business-intelligence
- /dashboard/funnel
- /dashboard/revenue-copilot
- /dashboard/revenue-forecast
- /dashboard/revenue-pro
- /dashboard/sales-brain
- /dashboard/business
- /dashboard/suggestions
- /dashboard/monitoring
- /dashboard/plan

**Account & Settings (9):**
- /dashboard/settings
- /dashboard/billing
- /dashboard/usage
- /dashboard/wallet
- /dashboard/integrations
- /dashboard/developer
- /dashboard/branches
- /dashboard/approvals
- /dashboard/export

**Monitoring & Internal (8):**
- /dashboard/audit-log
- /dashboard/system-health
- /dashboard/command-center
- /dashboard/intel
- /dashboard/safety
- /dashboard/compliance
- /dashboard/white-label
- /dashboard/my-work

**QA & Debugging (5):**
- /dashboard/testing-arena
- /dashboard/playground
- /dashboard/ai-audit
- /dashboard/demo
- /dashboard/arena

### Nested dashboard routes NOT in ADMIN_WORKSPACE sidebar (accessible through parent pages)

These pages exist in the filesystem but are sub-sections of parent pages — they are accessible by navigating to their parent and using internal page navigation:

- /dashboard/arena/benchmark, /arena/competitors, /arena/fixes, /arena/hallucinations, /arena/optimize, /arena/prompt-benchmark, /arena/quality, /arena/simulate
- /dashboard/customers/import (same functionality as /dashboard/import which IS in the nav)
- /dashboard/developer/docs, /developer/sdk
- /dashboard/settings/ai-provider, /settings/bridge, /settings/bridge/download, /settings/bridge/link, /settings/business-profile, /settings/meta-cloud, /settings/numbers, /settings/orders, /settings/providers, /settings/team
- /dashboard/sms/credits, /sms/messages, /sms/providers, /sms/templates

### /admin/* pages (53 pages — covered by separate admin panel navigation)

The `/admin/*` pages have their own full navigation system at `/admin` (see `app/admin/nav-links.tsx` → `ADMIN_GROUPS`). Platform Admin can access them via the "لوحة الإدارة" link in the dashboard sidebar rail. All 53 admin pages are organized in that separate admin panel.

---

## 5. Admin Access Bypass — Code Locations

| Layer | File | Line | What |
|-------|------|------|------|
| Capability gate bypass | `saas/app/dashboard/layout.tsx` | 84 | `enforce = isAdmin ? false : !!ent?.enforce` |
| Pre-activation bypass | `saas/app/dashboard/layout.tsx` | 76 | `activated = !ctx.isOwner \|\| isAdmin \|\| ...` |
| Customer visibility bypass | `saas/app/dashboard/layout.tsx` | 95–97 | `disabledFeatures = isAdmin ? undefined : ...` |
| Workspace detection fix | `saas/app/dashboard/nav-items.tsx` | 287 | `/dashboard` marker item in ADMIN_WORKSPACE |
| Sidebar render fix | `saas/app/dashboard/nav-items.tsx` | 742 | Direct ADMIN_WORKSPACE.items render |
| Page authorization | `saas/lib/membership/entitlements.ts` | 89–99 | Admin gets all caps + enforce=false |
| hasCapability | `saas/lib/membership/entitlements.ts` | 343 | Returns `true` when enforce=false |
| pageGate | `saas/lib/membership/entitlements.ts` | 358 | Returns `null` (no gate) when enforce=false |

**Customer behavior:** All gating paths check `isAdmin` only before changing behavior. Non-admin users are completely unaffected.

---

## 6. Required Environment Variables (New Server)

### Critical (app will not start without these)

```env
# Database (PostgreSQL on new server)
POSTGRES_URL="postgresql://user:password@localhost:5432/keyone"
POSTGRES_DIRECT_URL="postgresql://user:password@localhost:5432/keyone"

# Auth
AUTH_SECRET="<random 64-char hex string>"

# Public URL
NEXT_PUBLIC_SITE_URL="https://w.keyone1.com"
NEXT_PUBLIC_APP_URL="https://w.keyone1.com"
NEXT_PUBLIC_BASE_URL="https://w.keyone1.com"
PUBLIC_BASE_URL="https://w.keyone1.com"

# Node
NODE_ENV="production"
PORT="3000"
```

### Required for core features

```env
# WhatsApp Bridge
BRIDGE_ENABLED="true"
BRIDGE_GATEWAY_INTERNAL_URL="http://localhost:3002"
BRIDGE_GATEWAY_PORT="3002"
BRIDGE_WS_URL="wss://w.keyone1.com/bridge"
WHATSAPP_SERVICE_URL="http://localhost:3001"

# LLM (OpenRouter or OpenAI-compatible)
LLM_API_URL="https://openrouter.ai/api/v1"
LLM_API_KEY="sk-..."
LLM_MODEL="openai/gpt-4o-mini"

# Email (AWS SES)
PLATFORM_EMAIL_FROM="noreply@keyone1.com"
PLATFORM_EMAIL_FROM_NAME="KEYONE"
PLATFORM_SES_ACCESS_KEY_ID="AKIA..."
PLATFORM_SES_SECRET_ACCESS_KEY="..."
PLATFORM_SES_REGION="us-east-1"
```

### Optional / feature-specific

```env
# Gemini (AI operations)
GEMINI_API_KEY="..."
KEYONE_GEMINI_KEY="..."

# OpenAI (embeddings, vision)
OPENAI_API_KEY="sk-..."
KEYONE_OPENAI_KEY="sk-..."

# Redis (BullMQ queues)
UPSTASH_REDIS_REST_URL="..."
UPSTASH_REDIS_REST_TOKEN="..."
UPSTASH_REDIS_URL="redis://..."
ENABLE_BULLMQ="true"

# Meta Cloud API
META_CLOUD_ENABLED="true"
META_GRAPH_VERSION="v19.0"

# Admin
ADMIN_INIT_SECRET="<random string for first admin creation>"
SAAS_INTERNAL_SECRET="<random string for internal API calls>"

# Feature flags
FREE_TIER_ENFORCEMENT="false"
CUSTOMER_CAP_ENFORCEMENT="false"
SIGNUP_AUTO_APPROVE="true"
```

---

## 7. Database Setup on New Server

```bash
# 1. Install PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib

# 2. Create database and user
sudo -u postgres psql <<SQL
CREATE USER keyone WITH PASSWORD 'strongpassword';
CREATE DATABASE keyone OWNER keyone;
GRANT ALL PRIVILEGES ON DATABASE keyone TO keyone;
SQL

# 3. Set env var
echo 'POSTGRES_URL="postgresql://keyone:strongpassword@localhost:5432/keyone"' >> ~/keyone/.env

# 4. Generate Prisma client
cd ~/keyone
./node_modules/.bin/prisma generate --schema prisma/schema.postgres.prisma

# 5. Apply schema (additive — aborts on any destructive change)
./node_modules/.bin/prisma db push --schema prisma/schema.postgres.prisma

# 6. Seed essential data (site config, feature flags, tiers)
# This runs automatically on first request; or run manually:
# node -e "require('./scripts/seed-site-config.js')"
```

---

## 8. Full Deployment Commands (New Server)

### One-time server setup

```bash
# On the new server (Ubuntu 22.04+)
# 1. Install Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Install Caddy
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install caddy

# 3. Create app directory
sudo mkdir -p /home/ubuntu/keyone /home/ubuntu/bridge-gateway
sudo chown ubuntu:ubuntu /home/ubuntu/keyone /home/ubuntu/bridge-gateway

# 4. Copy Caddyfile
sudo cp deploy/Caddyfile.production /etc/caddy/Caddyfile
sudo systemctl reload caddy

# 5. Create systemd service
sudo tee /etc/systemd/system/keyone.service <<EOF
[Unit]
Description=KEYONE Next.js App
After=network.target postgresql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/keyone
ExecStart=/usr/bin/node node_modules/.bin/next start -p 3000
Restart=always
RestartSec=5
EnvironmentFile=/home/ubuntu/keyone/.env

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable keyone
```

### Each deployment (from your Mac)

```bash
# Deploy HEAD to new server
cd /Users/yahyaemad/Desktop/appkeyone
KEYONE_HOST="ubuntu@<NEW_SERVER_IP>" deploy/release-aws.sh
```

The script does everything: rsync source, npm install, prisma generate, prisma db push, next build, restart keyone.service.

### Manual deployment if script can't run

```bash
# On new server
cd ~/keyone
npm install --no-audit --no-fund
./node_modules/.bin/prisma generate --schema prisma/schema.postgres.prisma
./node_modules/.bin/prisma db push --schema prisma/schema.postgres.prisma
npm run build
sudo systemctl restart keyone.service keyone-bridge-gateway.service
```

---

## 9. Service Configuration

### systemd services needed

| Service | Port | Purpose |
|---------|------|---------|
| `keyone.service` | 3000 | Next.js SaaS app |
| `keyone-bridge-gateway.service` | 3002 | WhatsApp WebSocket ingress |
| `keyone-wa.service` | 3001 | Legacy QR transport |
| `postgresql.service` | 5432 | Database |
| `caddy.service` | 80/443 | Reverse proxy + TLS |

### Caddy routes (already in deploy/Caddyfile.production)

```
w.keyone1.com {
  /downloads/* → /var/www/keyone-downloads (static)
  /bridge/*    → localhost:3002
  /            → localhost:3000
}
```

---

## 10. Health Check URLs

```bash
# App health
curl https://w.keyone1.com/api/health
# Expected: {"status":"ok","db":"ok"}

# Deployed commit matches
ssh ubuntu@<NEW_SERVER_IP> 'cat ~/keyone/DEPLOYED_COMMIT'
# Expected: fdc66fd9c7471277671052920d7ca266b360b621

# Auth redirect (unauthenticated should redirect to login)
curl -I https://w.keyone1.com/dashboard
# Expected: 307 → /login

# Static pages
curl -I https://w.keyone1.com/
curl -I https://w.keyone1.com/login
# Expected: 200 OK

# Service status
ssh ubuntu@<NEW_SERVER_IP> 'systemctl is-active keyone.service'
# Expected: active
```

---

## 11. Rollback

```bash
# Deploy a specific previous commit
cd /Users/yahyaemad/Desktop/appkeyone
KEYONE_HOST="ubuntu@<NEW_SERVER_IP>" deploy/release-aws.sh <previous-good-sha>
```

The deploy script auto-backs-up `.next` before build. If the build fails during deploy, the previous `.next` is restored automatically and the service is never restarted onto broken code.

---

## 12. First-Run Admin Setup

After deployment, to create the Platform Admin user:

```bash
# Via the admin init endpoint (requires ADMIN_INIT_SECRET env var)
curl -X POST https://w.keyone1.com/api/admin/init \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_INIT_SECRET>" \
  -d '{"email":"admin@yourdomain.com","password":"StrongPassword123!"}'

# OR directly in database
psql $POSTGRES_URL -c "UPDATE \"User\" SET role='admin' WHERE email='admin@yourdomain.com';"
```

---

## 13. What Is Blocked Until New Server

| Item | Status | Blocker |
|------|--------|---------|
| Platform Admin sidebar shows 65 routes | Code complete ✅ | Needs deployment to new server |
| Browser verification of admin nav | Blocked ❌ | Old server offline, new server not provisioned |
| Production health check | Blocked ❌ | Old server offline |
| End-to-end admin page access verification | Blocked ❌ | No running production |

---

## 14. What Is NOT Blocked

| Item | Status |
|------|--------|
| All 64 dashboard routes in ADMIN_WORKSPACE | ✅ Complete |
| Admin bypass: enforce=false | ✅ Complete in layout.tsx:84 |
| Admin bypass: activated=true | ✅ Complete in layout.tsx:76 |
| Admin bypass: disabledFeatures=undefined | ✅ Complete in layout.tsx:95 |
| Admin bypass: pageGate returns true | ✅ Pre-existing, verified in entitlements.ts |
| workspaceForPath fix for /dashboard root | ✅ Complete in nav-items.tsx:287 |
| Direct ADMIN_WORKSPACE.items render | ✅ Complete in nav-items.tsx:742 |
| Customer behavior unchanged | ✅ All changes behind isAdmin checks |
| TypeScript: zero errors | ✅ tsc --noEmit exits 0 |
| Next.js build: 187 pages | ✅ Build passes |
| /admin/* pages have own navigation | ✅ Pre-existing (ADMIN_GROUPS in admin/nav-links.tsx) |

---

## 15. Summary for New Server Day

When the new server is provisioned:

1. Set up Ubuntu + Node 20 + PostgreSQL + Caddy (one-time setup above)
2. Copy `.env` from backup / recreate with the env vars section above
3. Run: `KEYONE_HOST="ubuntu@<NEW_IP>" deploy/release-aws.sh`
4. Verify: `curl https://w.keyone1.com/api/health` → `{"status":"ok","db":"ok"}`
5. Log in as Platform Admin → open /dashboard → click "Admin" workspace in rail → verify 65 routes appear
6. Click sample routes: /dashboard/brain, /dashboard/knowledge, /dashboard/revenue-copilot, /dashboard/flow-builder, /dashboard/agents — all should load without lock icons or upgrade messaging

No code changes required on deployment day.
