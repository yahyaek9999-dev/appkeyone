# KEYONE — Docker CI/CD Migration Plan

**Prepared:** 2026-06-05  
**Status:** AWAITING APPROVAL — Do not execute without sign-off  
**Target:** Git Push → Zero-Touch Docker Deploy  

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        DEVELOPER FLOW                           │
│                                                                 │
│   git push origin main                                          │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              GitHub Actions (ubuntu-latest)              │   │
│  │                                                         │   │
│  │  Job 1: validate                                        │   │
│  │    ├─ npm ci                                            │   │
│  │    ├─ prisma generate                                   │   │
│  │    └─ tsc --noEmit  ──── FAIL → blocks deploy ────►    │   │
│  │                                                         │   │
│  │  Job 2: build (needs: validate)                         │   │
│  │    ├─ docker buildx (multi-stage, linux/amd64)          │   │
│  │    │    Stage 1: deps    → npm ci                       │   │
│  │    │    Stage 2: builder → prisma generate + next build │   │
│  │    │    Stage 3: runner  → ~200MB minimal image         │   │
│  │    └─ docker push ghcr.io/OWNER/keyone-saas:main        │   │
│  │                                │                        │   │
│  │  Job 3: verify (90s delay)     │                        │   │
│  │    ├─ GET /api/health          │                        │   │
│  │    └─ GET /api/ready           │                        │   │
│  └────────────────────────────────│────────────────────────┘   │
└───────────────────────────────────│────────────────────────────┘
                                    │
                         GHCR (GitHub Container Registry)
                         ghcr.io/OWNER/keyone-saas
                         Tags: :main  :sha-abc1234  :abc1234-20260605-120000
                                    │
                                    │ Watchtower polls every 60s
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                     LINUX VPS (new or existing)                 │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Docker Compose (docker-compose.production.yml)          │  │
│  │                                                          │  │
│  │  ┌─────────────────────────┐  ┌──────────────────────┐  │  │
│  │  │   keyone-saas           │  │   watchtower          │  │  │
│  │  │   :3000 (127.0.0.1)    │  │   polls GHCR :60s    │  │  │
│  │  │                         │  │   pulls :main         │  │  │
│  │  │   Volumes:              │  │   rolling restart     │  │  │
│  │  │   /keyone/data → /data  │  └──────────────────────┘  │  │
│  │  │   /keyone/logs → /logs  │                             │  │
│  │  │                         │                             │  │
│  │  │   Health: /api/health   │                             │  │
│  │  └─────────────────────────┘                             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  HOST (stays on host, not containerized yet)             │  │
│  │  ├── Caddy (HTTPS reverse proxy → localhost:3000)        │  │
│  │  ├── WhatsApp Node service (port 7799)                   │  │
│  │  └── Python LLM API (port 7788)                         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Host filesystem (NEVER touched by deploy):                     │
│  /keyone/data/saas.db          ← SQLite database               │
│  /keyone/data/uploads          ← User uploads                  │
│  /keyone/logs/saas             ← App logs                      │
│  /keyone/.env.saas             ← Production secrets            │
│  /keyone/backups               ← DB backups                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Critical Pre-Condition: VPS Platform

**CURRENT:** Windows Server VPS (PowerShell + NSSM + Caddy for Windows)  
**REQUIRED:** Linux VPS running Docker CE

### Options

| Option | Effort | Risk | Recommendation |
|--------|--------|------|----------------|
| **A. New Linux VPS** | Medium | Low | ✅ Recommended |
| **B. Docker on Windows VPS** | High | Medium | Only if provider supports nested virtualization |

**Option A — New Linux VPS (recommended):**
1. Provision Ubuntu 22.04 or Debian 12 VPS (same or new provider)
2. Run `deploy/vps-docker-setup.sh` — installs Docker, creates dirs
3. Upload `.env.saas` and `docker-compose.production.yml`
4. Copy database from Windows VPS
5. Point DNS to new VPS
6. Keep Windows VPS alive for 48h as fallback
7. Decommission Windows VPS

**Option B — Docker on existing Windows VPS:**
Requires Windows Containers or WSL2 + Docker Desktop.  
Not recommended for production SQLite workloads. Use Option A.

---

## Files Created/Modified

| File | Action | Purpose |
|------|--------|---------|
| `saas/Dockerfile` | **NEW** | Multi-stage Docker build for Next.js |
| `saas/.dockerignore` | **NEW** | Exclude node_modules, .next, secrets from build context |
| `docker-compose.production.yml` | **NEW** | Production services + Watchtower |
| `.github/workflows/deploy.yml` | **MODIFIED** | Docker build+push instead of artifact+SSH |
| `deploy/vps-docker-setup.sh` | **NEW** | One-shot VPS bootstrap script |
| `saas/next.config.js` | **MODIFIED** | Added `output: "standalone"` for minimal image |

---

## Migration Steps

### Phase 1 — Preparation (no production impact)
- [x] All files created and reviewed
- [ ] Commit files to a feature branch (NOT main)
- [ ] Verify Docker build locally: `cd saas && docker build -t keyone-saas-test .`
- [ ] Verify `output: standalone` doesn't break existing `next start` locally

### Phase 2 — New VPS Setup
- [ ] Provision Ubuntu 22.04 VPS (minimum: 2 vCPU, 2GB RAM, 20GB disk)
- [ ] SSH access configured
- [ ] Run `deploy/vps-docker-setup.sh` on new VPS
- [ ] Upload `/keyone/.env.saas` with production values
- [ ] Upload `docker-compose.production.yml` to `/keyone/`
- [ ] Create GitHub PAT with `read:packages` scope
- [ ] Run `docker login ghcr.io` on new VPS with PAT

### Phase 3 — Database Migration (CRITICAL — read carefully)
```bash
# On your local machine — copy from Windows VPS to new Linux VPS
# 1. Pull database from Windows VPS
scp -P 22 Administrator@217.154.163.16:'C:\KEYONE\data\saas.db' ./saas-prod.db

# 2. Verify integrity
sqlite3 ./saas-prod.db "PRAGMA integrity_check;"
# Expected: ok

# 3. Push to new Linux VPS
scp ./saas-prod.db root@<NEW_VPS_IP>:/keyone/data/saas.db

# 4. Set permissions
ssh root@<NEW_VPS_IP> "chown 1001:1001 /keyone/data/saas.db"
```

### Phase 4 — First Docker Deploy
```bash
# Merge feature branch to main → triggers GitHub Actions
git checkout main
git merge feature/docker-deploy
git push origin main

# GitHub Actions runs:
#   validate → typecheck passes
#   build    → Docker image pushed to GHCR as :main
#   verify   → waits 90s, checks health endpoint

# On new VPS — pull and start (first time only, before DNS switch)
docker compose -f /keyone/docker-compose.production.yml up -d

# Verify on new VPS
curl http://localhost:3000/api/health
curl http://localhost:3000/api/ready
```

### Phase 5 — DNS Cutover
```bash
# Time the cutover for low-traffic window (e.g., 3am)
# 1. Update A record for app.keyone1.com → new VPS IP
# 2. TTL should be < 60s beforehand (set TTL=30 24h before cutover)
# 3. Keep Windows VPS running for 48h (DNS propagation buffer)
# 4. Monitor /api/health after cutover
```

### Phase 6 — Validation & Cleanup
- [ ] Test login, WhatsApp session, broadcast send
- [ ] Verify database data intact (check user count, message count)
- [ ] Verify Watchtower auto-updates: push a minor change → confirm auto-deploy
- [ ] Decommission Windows VPS after 48h stable

---

## Rollback Plan

### Scenario 1 — Bad code push (app crashes after deploy)
```bash
# Watchtower already deployed bad :main image
# Fix: roll back to previous SHA tag

# On VPS
IMAGE_TAG=sha-<PREVIOUS_SHA> \
  docker compose -f /keyone/docker-compose.production.yml up -d

# App restarts with old image — database untouched
# Time to rollback: ~60 seconds
```

### Scenario 2 — Database corruption (should not happen, but plan exists)
```bash
# Stop container
docker compose -f /keyone/docker-compose.production.yml stop keyone-saas

# Restore from backup
cp /keyone/backups/saas.db.$(date +%Y%m%d) /keyone/data/saas.db

# Restart
docker compose -f /keyone/docker-compose.production.yml up -d keyone-saas
```

### Scenario 3 — Complete failure, return to Windows VPS
```bash
# Point DNS A record back to Windows VPS IP (217.154.163.16)
# Windows NSSM service was never stopped — it is still live
# Time to rollback: DNS TTL (set to 30s before cutover)
```

### Scenario 4 — Watchtower deploys a broken image
```bash
# Stop Watchtower to prevent further auto-deploys
docker stop keyone-watchtower

# Rollback app to last known good SHA
IMAGE_TAG=sha-<LAST_GOOD_SHA> \
  docker compose -f /keyone/docker-compose.production.yml up -d keyone-saas

# Once fixed image is pushed, restart Watchtower
docker start keyone-watchtower
```

---

## Downtime Estimate

| Phase | Downtime | Notes |
|-------|----------|-------|
| Preparation (build, VPS setup) | **0 minutes** | Windows VPS untouched |
| First deploy on new VPS (before DNS switch) | **0 minutes** | Shadow testing |
| DNS cutover | **~30 seconds** | With low TTL (30s). In-flight requests fail. |
| Each future deploy (Watchtower rolling restart) | **~5 seconds** | Container restart time |

**Total production downtime: ~30 seconds** (DNS cutover only)

---

## Future Deploy Flow (after migration)

```bash
# Developer workflow — nothing else needed
git add .
git commit -m "feat: my change"
git push origin main

# Automatic:
# 1. GitHub Actions validates (typecheck) — ~3 min
# 2. GitHub Actions builds Docker image — ~5 min
# 3. GitHub Actions pushes to GHCR — ~1 min
# 4. Watchtower on VPS pulls new :main image — ~30s
# 5. Container gracefully restarts — ~5s
# 6. GitHub Actions verifies /api/health — pass

# Total: ~10 minutes from push to live
# Zero SSH. Zero manual steps. Zero downtime.
```

---

## Data Safety Guarantees

| Data | How Protected |
|------|---------------|
| `saas.db` | Volume mount at `/keyone/data` — NEVER inside image |
| Docker images | Never contain database files (.dockerignore blocks *.db) |
| Deploys | Only swap the container, not the volume |
| Rollback | Only swaps the container image, data volume unchanged |
| `prisma migrate` | Never runs in the pipeline — no schema changes |
| `prisma db push` | Never runs in the pipeline — no schema changes |
| Backups | Existing backup scripts on host continue to run independently |

---

## GitHub Secrets Required

| Secret | Where | Description |
|--------|-------|-------------|
| `GITHUB_TOKEN` | Auto | Built-in — used for GHCR push |
| `SENTRY_AUTH_TOKEN` | Optional | Source map upload at build time |
| `HEALTH_CHECK_URL` | Variable | `https://app.keyone1.com` (set in repo Variables) |

**No VPS SSH credentials needed in GitHub.** Watchtower pulls automatically.

---

## GHCR Image Tags Strategy

Each push to `main` creates three tags:
- `:main` — Watchtower tracks this tag; always the latest deploy
- `:sha-abc1234` — Pinned SHA for precise rollback
- `:abc1234-20260605-120000` — Audit trail with timestamp

Rollback = change `IMAGE_TAG=sha-<old>` in docker-compose and restart.

---

## Approval Required

Before any execution:
- [ ] Review all files created above
- [ ] Confirm target VPS platform (new Linux VPS vs Windows Docker)
- [ ] Confirm GitHub username for GHCR_OWNER
- [ ] Confirm DNS cutover window
- [ ] Confirm database backup is current
