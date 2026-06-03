#!/usr/bin/env node
/*
 * RBAC route-coverage audit (Agent 5 — Enterprise & Security).
 *
 * Static, read-only check: walks every `app/api/**\/route.ts` and asserts that
 * each MUTATING handler (POST/PUT/PATCH/DELETE) either:
 *   (a) calls an RBAC gate — requirePermission / getUserIdForPermission /
 *       getUserForPermission / requireAdmin, OR
 *   (b) is explicitly waived (public/internal/webhook) in route-permissions.ts.
 *
 * Exits non-zero and prints offenders if any mutating route is ungated and not
 * waived — so a future PR that adds an ungated mutation fails CI loudly.
 *
 * Pure file-scan: no DB, no network, no app import. Safe to run anywhere.
 */

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const API_DIR = path.join(ROOT, "app", "api");

// Keep this waiver list in sync with PUBLIC_OR_INTERNAL_ROUTES in
// lib/route-permissions.ts. Duplicated here (not imported) so the audit stays a
// dependency-free Node script.
const WAIVED = new Set([
  "api/auth/login/route.ts",
  "api/auth/signup/route.ts",
  "api/auth/logout/route.ts",
  "api/auth/accept-invite/route.ts",
  "api/health/route.ts",
  "api/ready/route.ts",
  "api/commerce/webhooks/route.ts",
  "api/whatsapp/meta-webhook/route.ts",
  "api/whatsapp/incoming/route.ts",
  "api/whatsapp/status/route.ts",
  "api/cron/broadcasts/route.ts",
  "api/cron/daily-report/route.ts",
  "api/cron/follow-ups/route.ts",
  "api/cron/llm-prewarm/route.ts",
  "api/cron/meta-quality-monitor/route.ts",
  "api/cron/meta-template-sync/route.ts",
  "api/cron/meta-webhook-processor/route.ts",
  "api/cron/outgoing-messages/route.ts",
  "api/internal/metrics/route.ts",
  "api/internal/queue-health/route.ts",
  "api/internal/wa-health/route.ts",
]);

const GATE_RE =
  /\b(requirePermission|getUserIdForPermission|getUserForPermission|requireAdmin)\b/;
const MUTATING_RE = /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\b/g;
const INTERNAL_SECRET_RE = /x-internal-secret|X-Internal-Secret|SAAS_INTERNAL_SECRET/;
const WEBHOOK_SIG_RE = /verifySignature|X-Hub-Signature|resolveIntegrationFromRequest/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

function rel(full) {
  return path.relative(ROOT, full).split(path.sep).join("/").replace(/^app\//, "");
}

function main() {
  if (!fs.existsSync(API_DIR)) {
    console.error(`[rbac-coverage] no app/api dir at ${API_DIR}`);
    process.exit(2);
  }
  const files = walk(API_DIR);
  const offenders = [];
  let gated = 0;
  let waived = 0;
  let readOnly = 0;

  for (const file of files) {
    const route = rel(file);
    const src = fs.readFileSync(file, "utf8");
    const methods = [...src.matchAll(MUTATING_RE)].map((m) => m[1]);
    if (methods.length === 0) {
      readOnly++;
      continue; // no mutating handler — out of scope for this audit
    }
    if (WAIVED.has(route)) {
      waived++;
      continue;
    }
    const hasGate =
      GATE_RE.test(src) ||
      // admin routes are gated by requireAdmin; some guard via internal secret
      (route.startsWith("api/admin/") && /requireAdmin|ADMIN_INIT_SECRET/.test(src)) ||
      INTERNAL_SECRET_RE.test(src) ||
      WEBHOOK_SIG_RE.test(src);
    if (hasGate) {
      gated++;
    } else {
      offenders.push({ route, methods: methods.join(",") });
    }
  }

  console.log(
    `[rbac-coverage] scanned ${files.length} routes — ${gated} gated, ${waived} waived, ${readOnly} read-only`,
  );
  if (offenders.length) {
    console.error(`\n[rbac-coverage] FAIL — ${offenders.length} ungated mutating route(s):`);
    for (const o of offenders) console.error(`  - ${o.route}  [${o.methods}]`);
    console.error(
      "\nFix: add a gate (requirePermission / getUserForPermission / getUserIdForPermission / requireAdmin)\n" +
        "or, if intentionally public/internal, add it to WAIVED here and PUBLIC_OR_INTERNAL_ROUTES in lib/route-permissions.ts.",
    );
    process.exit(1);
  }
  console.log("[rbac-coverage] PASS — every mutating route is gated or waived.");
}

main();
