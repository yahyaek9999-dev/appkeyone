# RETIREMENT_BLOCKERS — KEYONE

**Date:** 2026-06-12 · Live tracker of what stands between **now** and **SAFE TO RETIRE**. Updated after the blocker-removal session.

---

## ✅ Resolved this session

| Blocker | Action taken | Evidence |
|---|---|---|
| **Local Git assets unpushed** (#11) | Pushed UI branch + DR docs to GitHub (feature branches — **no deploy**, `origin/main` unchanged at `cbb7eda`) | `claude/hopeful-kowalevski-90a1e7` @ `bf79ab6` and `claude/crazy-cartwright-8afae8` @ `d0204cd` now on `origin` |
| **DR documentation only on Mac** | Same push — the entire `project-knowledge/DISASTER_RECOVERY/` + `deploy/offsite/` (28 files) are now on GitHub | durable off-Mac copy |
| **DNS undocumented** (#6) | Verified registrar + NS + records live; wrote recovery doc | [DNS_REGISTRAR_RECOVERY](DNS_REGISTRAR_RECOVERY.md) — Registrar **HOSTINGER** (exp 2027-05-07), NS `*.dns-parking.com`, `app.keyone1.com→217.154.163.16` |
| **No engine-preservation plan** (#10) | Wrote exact private-repo plan (vendoring `cloakbrowser`, license note, commands) | [AI_ENGINE_REPO_PLAN](AI_ENGINE_REPO_PLAN.md) |
| **No final-pull procedure** (#12 prep) | Wrote the shutdown extraction runbook (stop writes → pull DB → pull sessions → verify) | [FINAL_SHUTDOWN_RUNBOOK](FINAL_SHUTDOWN_RUNBOOK.md) |

---

## 🔴 EXACT REMAINING BLOCKERS (must clear before SAFE TO RETIRE)

| # | Blocker | Why it blocks | Owner action | Effort |
|---|---|---|---|---|
| **B-1** | **Data is single-copy (Mac only)** — `db/` + `env/` (AUTH_SECRET) + `wa-sessions/` + `backups/` exist in exactly one durable place | Retiring drops VPS+Mac (2 copies) → Mac only (1). A Mac failure = total loss. **This is the #1 blocker.** | Copy `~/Desktop/KEYONE_EOL_EXTRACTION/` to an **external SSD** AND an **encrypted off-site** bucket (`deploy/offsite/` → `age` + `rclone`) | ~30 min |
| **B-2** | **AI engine + CloakBrowser not in Git** | Engine source exists only as loose Mac folders; a Mac loss loses the AI engine | Execute [AI_ENGINE_REPO_PLAN](AI_ENGINE_REPO_PLAN.md) — create the **private** `keyone-llm-proxy` repo (via github.com/new since `gh` isn't installed) and push | ~30 min |
| **B-3** | **Hostinger account access not vaulted** | Registrar identified, but without the login/2FA you cannot re-point `app.keyone1.com` during recovery | Store Hostinger email + password + 2FA recovery codes in the password vault ([DNS_REGISTRAR_RECOVERY](DNS_REGISTRAR_RECOVERY.md) §2) | ~10 min |
| **B-4** | **Final data delta not captured** | The extraction is a 10:19 snapshot; live writes since are not preserved | At shutdown, run [FINAL_SHUTDOWN_RUNBOOK](FINAL_SHUTDOWN_RUNBOOK.md) (stop writes → fresh DB+sessions pull → verify) | ~15 min (at shutdown) |
| **B-5** *(recommended)* | **No restore smoke test performed** | Recovery procedure unproven end-to-end | Boot a local KEYONE on the extracted DB + `AUTH_SECRET`; confirm login + a tenant key decrypts | ~30 min |

### Minor (not retirement-blocking)
- **M-1** `project-knowledge/UIUX_POLISH_PASS_2026_06_10.md` is still untracked on `main` (one UI doc). Preserve by committing to a branch (not `main`, to avoid deploy). ~2 min.
- **M-2** AUTH_SECRET orphaned-ciphertext on 2 dormant legacy columns (no older secret found) — accept as unrecoverable; negligible impact.

---

## Recalculated retirement readiness

| Dimension | Mission-5 | **Now** | Change driver |
|---|---:|---:|---|
| Recovery readiness | 82 | **86** | UI commits + DR docs on GitHub; DNS known; shutdown runbook ready |
| Disaster recovery | 80 | **85** | DR docs durable off-Mac; registrar documented; final-pull procedure written |
| Infrastructure independence | 65 | **68** | DR docs/UI off the Mac; but DB/secrets/engine still single-copy/un-pushed |
| **Composite** | **77** | **~81** | recovery *knowledge* now complete; data *redundancy* still pending |

> The score rose on **documentation/recovery-completeness**, but the **single-copy data risk (B-1)** and **engine-not-in-Git (B-2)** are unchanged — these are the substance of the remaining gap.

---

## Decision (unchanged, with a shorter path)

# 🛑 DO NOT RETIRE SERVER — yet

Four quick blockers remain (**B-1, B-2, B-3** are owner actions totaling **~70 min**; **B-4** runs at shutdown). None involves data we don't already hold — they're about getting that data into **multiple durable locations** and the **engine into Git**.

**Clear B-1 → B-4 (and ideally B-5), then it becomes ✅ SAFE TO RETIRE** (projected composite ~92/100, checklist all-PASS). Until B-1 is done, **keep the VPS alive** — it is currently the only second copy of the production data.
