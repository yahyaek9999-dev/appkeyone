#!/usr/bin/env node
/*
 * KEYONE — Wallet + Meta Billing static regression guard.
 *
 * Read-only structural checks (no DB) that lock in the safety invariants of the
 * prepaid wallet + Meta cost engine so a future refactor can't silently break
 * money handling or leak the engine into the protected WhatsApp send pipeline.
 *
 * Exits non-zero on any violation so it can gate CI / pre-deploy.
 */

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const read = (rel) => {
  const f = path.join(ROOT, rel);
  if (!fs.existsSync(f)) return null;
  return fs.readFileSync(f, "utf8");
};

const failures = [];
const oks = [];
function assert(name, cond, detail) {
  if (cond) oks.push(name);
  else failures.push(`${name}${detail ? "  →  " + detail : ""}`);
}

// ── 1. Engine safety invariants (wallet.ts) ──────────────────────────────────
const wallet = read("lib/wallet/wallet.ts");
assert("wallet.ts exists", !!wallet);
if (wallet) {
  assert("debit uses atomic guarded decrement (balanceUsd >= amount)", /balanceUsd:\s*\{\s*gte:\s*amount\s*\}/.test(wallet));
  assert("debit checks updateMany count !== 1 (never negative)", /res\.count\s*!==\s*1/.test(wallet) && /INSUFFICIENT/.test(wallet));
  assert("mutations run inside $transaction (atomic ledger+balance)", /\$transaction\(async/.test(wallet));
  assert("ledger row created before balance change (idempotency gate)", wallet.indexOf("walletLedger.create") < wallet.indexOf("wallet.update"));
  assert("P2002 replay handled (no double charge)", /P2002/.test(wallet));
  assert("reversal uses deterministic per-entry key", /reversalKey\(/.test(wallet));
  assert("walletAllowsSend is flag-gated (enforceSends)", /walletFlags\.enforceSends/.test(wallet));
}

// ── 2. Money precision (money.ts) ────────────────────────────────────────────
const money = read("lib/wallet/money.ts");
assert("money.ts rounds to micro-dollar (1e6)", !!money && /Math\.round\(n\s*\*\s*1e6\)\s*\/\s*1e6/.test(money));

// ── 3. Meta cost engine never touches the send pipeline ──────────────────────
const metaCost = read("lib/wallet/meta-cost.ts");
assert("meta-cost.ts exists", !!metaCost);
if (metaCost) {
  assert("meta-cost.ts does NOT import the messaging send pipeline", !/from\s+["']@\/lib\/messaging/.test(metaCost) && !/from\s+["']@\/lib\/wa["']/.test(metaCost));
  assert("meta-cost.ts resolves template name→category via WaTemplate", /waTemplate\.findMany/.test(metaCost));
  assert("meta-cost.ts debits idempotently (meta:<id> key)", /idempotencyKey:\s*`meta:\$\{/.test(metaCost));
}

// ── 4. The protected send pipeline does NOT import the wallet engine ─────────
const PIPELINE = [
  "lib/messaging/qr-provider.ts",
  "lib/messaging/meta-provider.ts",
  "lib/messaging/outgoing-queue.ts",
  "lib/messaging/provider.ts",
  "lib/messaging/index.ts",
];
for (const f of PIPELINE) {
  const src = read(f);
  if (src == null) continue; // file optional
  assert(`send pipeline ${path.basename(f)} does NOT import @/lib/wallet`, !/from\s+["']@\/lib\/wallet/.test(src));
}

// ── 5. Schema is additive + in lock-step (both schemas have the 5 models) ────
const MODELS = ["Wallet", "WalletLedger", "WalletTopupRequest", "MetaUsageRecord", "MetaRateCard"];
for (const schema of ["prisma/schema.prisma", "prisma/schema.postgres.prisma"]) {
  const src = read(schema);
  assert(`${schema} present`, !!src);
  if (src) for (const m of MODELS) assert(`${schema} defines model ${m}`, new RegExp(`model\\s+${m}\\s*\\{`).test(src));
}
// Money/ledger uniqueness invariants
const sqlite = read("prisma/schema.prisma") || "";
assert("WalletLedger.idempotencyKey is @unique", /idempotencyKey\s+String\s+@unique/.test(sqlite));
assert("WalletLedger.reversalOf is @unique", /reversalOf\s+String\?\s+@unique/.test(sqlite));
assert("MetaUsageRecord has @@unique([userId, conversationKey])", /@@unique\(\[userId,\s*conversationKey\]\)/.test(sqlite));

// ── Report ───────────────────────────────────────────────────────────────────
console.log(`[verify:wallet] ${oks.length} checks passed`);
if (failures.length) {
  console.error(`[verify:wallet] FAIL — ${failures.length} violation(s):`);
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("[verify:wallet] PASS — wallet + Meta billing invariants intact.");
