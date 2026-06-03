// Load test: simulate concurrent message arrivals at the API layer
// Tests: /api/health, /api/ready (public unauthenticated endpoints)
// For authenticated endpoints, measures auth latency (all will 401, but that exercises the code path)
// Run: node scripts/verify/load-test.cjs
"use strict";

const BASE = "http://127.0.0.1:3013";

async function hitEndpoint(url, opts = {}) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(10000) });
    return { ok: true, status: r.status, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - t0, error: e.message };
  }
}

async function runBatch(n, urlFn, label) {
  const start = Date.now();
  const startMem = process.memoryUsage().heapUsed;

  const promises = Array.from({ length: n }, (_, i) => hitEndpoint(urlFn(i)));
  const results = await Promise.all(promises);

  const elapsed = Date.now() - start;
  const endMem = process.memoryUsage().heapUsed;
  const memGrowthMB = ((endMem - startMem) / 1024 / 1024).toFixed(1);

  const ok = results.filter(r => r.status === 200 || r.status === 401 || r.status === 307);
  const errors = results.filter(r => !r.ok || (r.status >= 500));
  const latencies = results.map(r => r.ms).sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];

  const FAILURES = [];
  if (errors.length > 0) FAILURES.push(`${errors.length} server errors (5xx/timeout)`);
  if (p95 > 2000) FAILURES.push(`p95 latency ${p95}ms exceeds 2000ms`);
  if (parseFloat(memGrowthMB) > 100) FAILURES.push(`memory growth ${memGrowthMB}MB > 100MB threshold`);

  if (FAILURES.length > 0) {
    console.log(`[${label}] n=${n} FAIL: ${FAILURES.join(", ")}`);
    FAILURES.forEach(f => console.log(`  ❌ ${f}`));
  } else {
    console.log(`[${label}] n=${n} ok=${ok.length} errors=${errors.length} p50=${p50}ms p95=${p95}ms p99=${p99}ms elapsed=${elapsed}ms memGrowth=${memGrowthMB}MB`);
  }

  return { n, ok: ok.length, errors: errors.length, p50, p95, p99, elapsed, memGrowthMB, failures: FAILURES };
}

async function main() {
  console.log("=== LOAD TEST ===");
  console.log(`Target: ${BASE}\n`);

  // Warm up
  await hitEndpoint(`${BASE}/api/health`);

  const allFailures = [];

  // /api/health — public, no auth, 200
  for (const n of [100, 500, 1000, 5000]) {
    const r = await runBatch(n, () => `${BASE}/api/health`, "health");
    if (r.failures.length) allFailures.push(...r.failures.map(f => `health n=${n}: ${f}`));
  }

  console.log();

  // /api/system/health — requires auth, will 401 (tests import + auth path, no DB)
  for (const n of [100, 500, 1000]) {
    const r = await runBatch(n, () => `${BASE}/api/system/health`, "sys-health(401)");
    if (r.failures.length) allFailures.push(...r.failures.map(f => `sys-health n=${n}: ${f}`));
  }

  console.log();

  // /api/command-center — requires auth, 401 (tests module import chain)
  for (const n of [100, 500]) {
    const r = await runBatch(n, () => `${BASE}/api/command-center`, "command-center(401)");
    if (r.failures.length) allFailures.push(...r.failures.map(f => `cmd-center n=${n}: ${f}`));
  }

  console.log();

  // /api/copilot — requires auth, 401
  for (const n of [100, 500]) {
    const r = await runBatch(n, (i) => `${BASE}/api/copilot?context=${["dashboard","orders","customers"][i%3]}`, "copilot(401)");
    if (r.failures.length) allFailures.push(...r.failures.map(f => `copilot n=${n}: ${f}`));
  }

  console.log();
  if (allFailures.length === 0) {
    console.log("✓ ALL LOAD TESTS PASSED");
  } else {
    console.log(`❌ FAILURES (${allFailures.length}):`);
    allFailures.forEach(f => console.log(`  - ${f}`));
    process.exit(1);
  }
}

main().catch(e => { console.error("LOAD TEST CRASHED:", e.message); process.exit(1); });
