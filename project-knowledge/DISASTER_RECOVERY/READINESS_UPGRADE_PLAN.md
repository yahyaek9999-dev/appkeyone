# READINESS_UPGRADE_PLAN — KEYONE 52 → 87 / 100

**Date:** 2026-06-12
**Goal:** raise the Disaster-Recovery readiness score from **52/100** to **≥ 85/100** by closing the three critical blockers and the supporting risks.
**Constraint:** documentation, audits, scripts, and plans only. Actions that touch running services (secret rotation, promoting required env, the migration itself) are **planned here and gated on owner approval** — none are executed.

---

## 1. Scoreboard

| Dimension | Weight | Before | After plan | Lever |
|---|---:|---:|---:|---|
| Disaster recovery readiness | 30% | 48 | **88** | off-site backups + secrets vault + engine in Git + tested drill |
| Backup readiness | 20% | 42 | **90** | 3-2-1 off-site, retention, immutability, tested restore |
| Infrastructure independence | 20% | 35 | **72** | secrets + engine + backups off the VPS (still single host until migration) |
| Repository portability | 15% | 85 | **100** | commit the CloakBrowser LLM engine |
| Migration readiness | 15% | 70 | **85** | reconcile drift, validated runbook, engine in Git |
| **Overall (weighted)** | 100% | **≈ 52** | **≈ 87** | — |

> Math: before = 48·.30 + 42·.20 + 35·.20 + 85·.15 + 70·.15 = **53**. After = 88·.30 + 90·.20 + 72·.20 + 100·.15 + 85·.15 = **87**. The cap on **Infrastructure independence** (72) is the single VPS — pushing past ~80 requires actually executing the Ubuntu migration / adding redundancy (Phase 6, beyond the 85 target).

---

## 2. The plan at a glance

| Phase | Closes | Touches prod? | Effort | Score lift |
|---|---|---|---|---|
| **P1** Version-control the AI engine | B3 | No (commits local source) | ~1.5h | Repo 85→100, DR + |
| **P2** Off-site encrypted backups | B1 | No (read-only scripts) | ~2h | Backup 42→90, DR + |
| **P3** Secrets vault + manifest | B2 | No (copy to vault) | ~1.5h | Infra 35→72, DR + |
| **P4** Reconcile config drift | M1–M6 | Mostly no | ~2.5h | Migration 70→85 |
| **P5** Recovery drill (prove it) | H3 | No (scratch box) | ~3.5h | DR → 88 (validation) |
| **P6** *(optional, >85)* Execute Ubuntu migration | H1, H4 | Yes (window) | ~1–2 days | Infra 72→90+ |
| | | **Total to reach 85** | **≈ 11h** | **52 → 87** |

All of P1–P5 are achievable in roughly **1.5 focused days** and require **no production downtime**. P4's two service-touching items (secret rotation, promoting required env) are queued for a short maintenance window with approval.

---

## 3. Phase detail (exact actions + effort)

### P1 — Version-control the CloakBrowser / mse_ai_api engine  *(B3 → Repo 100)*
Source is **already located** ([AI_ENGINE_SOURCE_INVENTORY](AI_ENGINE_SOURCE_INVENTORY.md)); this captures it.

| Step | Action | Effort |
|---|---|---|
| P1.1 | `gh repo create <owner>/keyone-llm-proxy --private` | 5 min |
| P1.2 | Stage canonical `~/Desktop/mse_ai_api-main` (exclude `.venv`, `saas/`, old `.env`, `email_link_bot/`) | 15 min |
| P1.3 | **Vendor `cloakbrowser` v0.3.26** (`~/Desktop/CloakBrowser-main/cloakbrowser`) into `vendor/` + keep `BINARY-LICENSE.md` | 15 min |
| P1.4 | **Fix `requirements.txt`** to install cloakbrowser (it is NOT on PyPI) + document the stealth-browser binary source | 10 min |
| P1.5 | Write `README.md` (build/run/ChatGPT-login bootstrap, env `API_SECRET_KEY`/`CHROME_PROFILE_DIR`) | 20 min |
| P1.6 | Commit, push, tag `v-prod-2026-06-12` | 5 min |
| P1.7 | Update [DISASTER_RECOVERY](DISASTER_RECOVERY.md) Scenario A §10 to `git clone` instead of "non-Git source" | 10 min |
| **Gate** | Fresh `git clone` + `pip install -r requirements.txt` + `playwright install` starts the proxy and `GET /healthz` returns ok | — |

### P2 — Off-site encrypted backups  *(B1 → Backup 90)*
Scripts already written in [`deploy/offsite/`](../../deploy/offsite/). This operationalizes them.

| Step | Action | Effort |
|---|---|---|
| P2.1 | Install `age` + `rclone` + `sqlite3` on the VPS | 10 min |
| P2.2 | Create off-site bucket (B2/R2/S3) + `rclone config` | 15 min |
| P2.3 | `age-keygen` off-server; public key on server, private key to vault | 10 min |
| P2.4 | Manual dry-run `backup-offsite.*`; confirm upload + `rclone check` | 10 min |
| P2.5 | Enable bucket **object-lock / versioning** (immutability) | 15 min |
| P2.6 | Schedule daily 03:50 / weekly Sun / monthly 1st | 15 min |
| P2.7 | Document remote + bucket + key location in vault | 10 min |
| **Gate** | An encrypted archive lands off-site; `rclone check` passes; it cannot be decrypted without the vault key | — |

### P3 — Secrets vault + versioned manifest  *(B2 → Infra 72)*
Per [SECRETS_INVENTORY_AND_MIGRATION](SECRETS_INVENTORY_AND_MIGRATION.md).

| Step | Action | Effort |
|---|---|---|
| P3.1 | Pick a vault (1Password/Bitwarden, or `age`-encrypted file in the bucket) | 10 min |
| P3.2 | Run the redaction helper to checklist which secrets are set (names only) | 10 min |
| P3.3 | Copy T1/T2/T5 values into the vault (incl. `AUTH_SECRET`, SSH, DNS, rclone token, age private key, GitHub Actions secrets) | 30 min |
| P3.4 | **Verify `AUTH_SECRET`** decrypts a known `Bot.aiApiKeyEnc` | 15 min |
| P3.5 | Commit `secrets.manifest` (names only) to the repo | 10 min |
| P3.6 | Review/secure the stale `mse_ai_api-main/saas/.env` (rotate or delete) | 10 min |
| **Gate** | Every recovery-critical secret exists off the VPS; manifest committed; `AUTH_SECRET` verified | — |

### P4 — Reconcile configuration drift  *(M1–M6 → Migration 85)*

| Step | Action | Touches prod? | Effort |
|---|---|---|---|
| P4.1 | Pick the **canonical host** (`app.keyone1.com` vs `k1wb.app.keyone1.com`); fix Caddyfile + `NEXT_PUBLIC_SITE_URL` + health URLs to agree | config only | 30 min |
| P4.2 | Pick the **canonical wa-service port** (3001 vs 7799); align `WHATSAPP_SERVICE_URL`, wa `PORT`, Caddy `/wa/*` | config only | 20 min |
| P4.3 | Pick **canonical service names** (`mse-*` vs `KEYONE-*`); align scripts; record live names | docs | 20 min |
| P4.4 | Pick the **canonical DB path** (`saas.db` vs `prod.db`); align backup + runtime config | config only | 20 min |
| P4.5 | Fix stale env-template names (`SHARED_SECRET`→`SAAS_INTERNAL_SECRET`, `SAAS_WEBHOOK_URL`→`SAAS_INCOMING_URL`, `POSTGRES_DIRECT_URL`→`DATABASE_DIRECT_URL`); add the ~50 undocumented vars to `.env.example` | repo edit | 40 min |
| P4.6 | **Promote `WHATSAPP_SHARED_SECRET` to required** + rotate `LLM_API_KEY`/`SAAS_INTERNAL_SECRET` off weak defaults | **yes — window** | 30 min |
| **Gate** | One canonical host/port/name/path; templates copy-paste to a working config; `validate-env.sh` enforces the shared secret | — |

### P5 — Recovery drill (prove the runbook)  *(H3 → DR 88)*

| Step | Action | Effort |
|---|---|---|
| P5.1 | Spin up a throwaway Ubuntu VPS | 15 min |
| P5.2 | Execute [DISASTER_RECOVERY](DISASTER_RECOVERY.md) Scenario A end-to-end from Git + off-site backup + vault | 2h |
| P5.3 | Validate: `/api/health` db:ok, a tenant key decrypts, WA test send, AI reply via restored engine | 30 min |
| P5.4 | Time it; record actual RTO; fix any runbook gaps found | 30 min |
| P5.5 | Destroy the scratch VPS | 5 min |
| **Gate** | A clean machine restored to working KEYONE in < 90 min using only Git + off-site backups + vault → **flips the verdict to YES** | — |

### P6 — *(optional, beyond 85)* Execute the Ubuntu migration  *(H1, H4 → Infra 90+)*
Follow [UBUNTU_MIGRATION_PLAN](UBUNTU_MIGRATION_PLAN.md). Removes the Windows 8–12 min deploy outage and (with Docker/Watchtower) enables ~30s deploys. True multi-host HA is a further step. Effort: ~1–2 days incl. validation + 72h soak.

---

## 4. Recommended sequence & timeline

```
Day 1 (no prod impact):  P1 (engine→Git)  →  P2 (off-site backups)  →  P3 (vault)
Day 2 (no prod impact):  P4.1–P4.5 (drift/docs)  →  P5 (recovery drill)
Maintenance window:      P4.6 (promote/rotate secrets)   ← approval required
Later (scheduled):       P6 (Ubuntu migration)            ← approval required
```

After **Day 1 + Day 2 + the P4.6 window**, the score is **≈ 87/100** and the [FINAL_READINESS_REPORT](FINAL_READINESS_REPORT.md) verdict moves from **NO** to **YES** — KEYONE is restorable to a fresh Ubuntu VPS from Git + off-site backups + vault alone, proven by the P5 drill.

---

## 5. What "done" looks like (acceptance)

- [ ] **B1 closed:** encrypted backups land off-site on a schedule, with retention + immutability
- [ ] **B2 closed:** every recovery-critical secret is in an off-VPS vault; `AUTH_SECRET` verified; manifest committed
- [ ] **B3 closed:** the CloakBrowser engine (+ vendored `cloakbrowser`) is in a private Git repo, tagged, and in the off-site set
- [ ] All five `.env.example`/Caddy/service drifts reconciled to one canonical value each
- [ ] `WHATSAPP_SHARED_SECRET` required; weak `LLM_API_KEY` default rotated
- [ ] A timed recovery drill restored KEYONE on a clean box in < 90 min
- [ ] [FINAL_READINESS_REPORT](FINAL_READINESS_REPORT.md) re-scored to ≥ 85 and verdict = **YES**

---

## 6. Effort summary

| Phase | Effort | Prod impact |
|---|---|---|
| P1 engine → Git | ~1.5h | none |
| P2 off-site backups | ~2h | none |
| P3 secrets vault | ~1.5h | none |
| P4 drift reconcile | ~2.5h | P4.6 only (window) |
| P5 recovery drill | ~3.5h | none |
| **Subtotal to reach ≥85** | **≈ 11h** | one short window |
| P6 Ubuntu migration *(optional)* | ~1–2 days | scheduled window |
