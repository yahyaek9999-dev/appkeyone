# Security & Reliability Assessment — app.keyone1.com

**Date:** 2026-06-09
**Sources:** OWASP ZAP spider + active scan (result1/result2/result3 exports), nuclei v3.8.0 (templates v10.4.4)
**Scope:** https://app.keyone1.com (production)

---

## Summary

- **Security posture: clean.** No exposed secrets/config, correct HTTP→HTTPS redirects, no PHP/Spring/actuator attack surface. nuclei found **0** critical/high/medium issues across 623 templates / 1162 requests.
- **One real reliability defect:** the two homepage videos (`/vedio.mp4`, `/mobile.mp4`) return **504 Gateway Timeout** under concurrency, after 40–44s. This degrades the landing-page experience for live users when the origin is busy.
- One trivial bug: `/apple-touch-icon.png` → 404.

---

## Reliability findings

### 1. Homepage videos 504 under load — HIGH (UX/reliability)
- `/vedio.mp4` and `/mobile.mp4` returned **504 Gateway Timeout** ~18× during the session, each after **40–44s** (ZAP IDs: 644, 701, 724, 809, 823, 932, 933, 985, 987, 1025, 1059, 1167, 1185, 1186, 1192, 1253, 1275, 1277).
- Files are 3–4 MB, served via `206 Partial Content` range requests directly from the origin. Successful when idle; time out under concurrency.
- **Likely cause:** large static MP4s served through the Next.js/Node origin (Windows host) with no CDN/static offload → connection/worker exhaustion.
- **Recommended fix (additive, does NOT touch WhatsApp pipeline):** offload the two MP4s to a CDN / object storage with byte-range + caching, or serve them outside the Next process. Lazy-load / poster-image the hero video so first paint doesn't block on it.

### 2. `/apple-touch-icon.png` 404 — LOW
- Referenced in HTML, missing on disk (ZAP IDs 339, 459, 481, 529, 559, 592, 739, 863). Drop the asset into `public/`.

### Cosmetic
- File is literally named `vedio.mp4` (typo for "video"). Real deployed name — renaming requires updating references. Not urgent.

---

## Security findings

### nuclei (cves, exposures, misconfig @ critical/high/medium, rate-limited -rl 30 -c 10)
- **0 matches.** 623 templates, 1162 requests, 11 request errors (timeouts consistent with origin load). Output file empty.

### ZAP forced-browse / active scan — all handled correctly
- Secret/config probes (`.env`, `.git/config`, `.svn/entries`, `id_rsa`, `WS_FTP.ini`, `server.key`, `composer.json`, `phpinfo.php`, `.DS_Store`, …) → **308 redirect to HTTPS**, none served.
- Cloud-metadata SSRF paths (`/latest/meta-data/`, `/computeMetadata/v1/`, `/opc/v1/instance/`) → 308, unreachable.
- Spring (`/actuator/health`) → 404; PHP injection (`?-d allow_url_include…`) and Spring4Shell (`class.module.classLoader…`) → 308/400. N/A to a Next.js app.
- App-level ZAP alerts: only Low/Informational, and the `Low` hits were on Mozilla's CDN (out-of-scope browser noise), not the app domain.

---

## To verify (not covered by this pass)
- `/admin` and `/dashboard` were crawled as in-scope routes (result1) but response codes weren't captured — confirm both are auth-gated.
- `k1wb.app.keyone1.com` subdomain appeared in crawl (marked out-of-scope) — confirm intended exposure.

---

## Artifacts
- nuclei raw output: `~/Desktop/nuclei-keyone.txt` (empty = 0 findings)
- ZAP exports: `~/Desktop/result1.csv`, `result2.csv`, `result3.csv`
