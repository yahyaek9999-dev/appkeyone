/**
 * The customer health endpoint must stay tenant-scoped.
 *
 * /dashboard/system-health is sold from Pro up but pointed at
 * /api/system/health, which is platform-ops by design — host CPU/RAM, database
 * size, cross-tenant counts — and refuses every tenant. The customer bought a
 * page that answered them 403, which the UI then reported as an expired
 * session. The fix was a SEPARATE customer endpoint, /api/system/health/me.
 *
 * The risk now is the opposite one: that someone "helpfully" enriches the
 * customer endpoint with a platform metric, or repoints the page back at the
 * admin route. Both would leak infrastructure to every Pro tenant, so both are
 * asserted against here.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ME = path.join(process.cwd(), "app/api/system/health/me/route.ts");
const ADMIN = path.join(process.cwd(), "app/api/system/health/route.ts");
const PAGE = path.join(process.cwd(), "app/dashboard/system-health/page.tsx");
const read = (p: string) => fs.readFileSync(p, "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");

describe("customer health is scoped to the caller's workspace", () => {
  it("the customer endpoint exists and is gated on the sold capability", () => {
    const src = code(ME);
    expect(src).toMatch(/apiGate\(\s*"system_health"\s*\)/);
    expect(src, "uid must come from the gate, never the request").toMatch(/const uid = g\.uid!/);
  });

  it("every database read is filtered by the caller's own id", () => {
    const src = code(ME);
    const reads = [...src.matchAll(/db\.\w+\.(findMany|findUnique|count|groupBy)\(\{[\s\S]{0,220}?\}\)/g)].map((m) => m[0]);
    expect(reads.length, "no reads found — the scan is broken").toBeGreaterThan(5);
    for (const r of reads) {
      expect(
        /userId: uid|customer: \{ userId: uid \}|broadcast: \{ userId: uid \}/.test(r),
        `unscoped read in the customer health endpoint:\n${r}`,
      ).toBe(true);
    }
  });

  it("it exposes no platform-level metric", () => {
    const src = code(ME);
    // Each of these is present on the ADMIN endpoint and must never appear here.
    for (const leak of ["cpuModel", "cpuCores", "totalMemMB", "usedMemMB", "heapUsed", "rss", "uptimeSec", "sizeBytes", "os.", "process.memoryUsage"]) {
      expect(src.includes(leak), `customer endpoint exposes platform metric: ${leak}`).toBe(false);
    }
  });

  it("the admin endpoint is left admin-only — this fix must not have opened it", () => {
    const src = code(ADMIN);
    expect(src).toMatch(/role !== "admin"/);
    expect(src).toMatch(/status: 403/);
  });

  it("the customer page renders the tenant view, not the platform console", () => {
    const src = code(PAGE);
    expect(src).toMatch(/TenantHealthUi/);
    expect(src, "page must not import the platform console again").not.toMatch(/from "\.\/system-health-ui"/);
  });

  it("the tenant UI calls the customer endpoint only", () => {
    const ui = code(path.join(process.cwd(), "app/dashboard/system-health/tenant-health-ui.tsx"));
    expect(ui).toMatch(/\/api\/system\/health\/me/);
    expect(ui, "tenant UI must not call the admin endpoint").not.toMatch(/fetch\("\/api\/system\/health"/);
  });
});
