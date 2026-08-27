/**
 * A customer screen must not misreport why it has no data.
 *
 * Found by opening /dashboard/system-health as a signed-in Enterprise customer.
 * The page said "انتهت الجلسة — سجّل الدخول مرة أخرى" and offered a login
 * button. The session was fine. /api/system/health is platform-ops only by
 * design — its own comment says it exposes host CPU/RAM, DB size and
 * CROSS-TENANT counts — so it answers 403 to every tenant, forever. The client
 * collapsed `401 || 403` into one "auth" state, so a permanent "not for you"
 * was rendered as a temporary "you got signed out", with a CTA that could never
 * change the outcome. A customer could log in and out all day and never learn
 * why the page was empty.
 *
 * The neighbouring shape is the same mistake with a paywall:
 * /dashboard/business-intelligence let 402 fall through to its generic branch
 * and printed "تعذّر تحميل البيانات · HTTP 402" — a locked capability shown as
 * a crash rather than an upgrade path.
 *
 * THE RULE, for any customer screen that branches on a response status:
 *   401 → signed out        (a login CTA is correct)
 *   403 → not permitted     (must NOT claim the session expired)
 *   402 → locked capability (must offer upgrade, never a fault message)
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const DASH = path.join(process.cwd(), "app", "dashboard");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** Customer client screens only — operator consoles are not customer surface. */
function customerClientFiles(): string[] {
  return walk(DASH).filter((f) => {
    const rel = ("/" + path.relative(process.cwd(), f)).replace(/\\/g, "/");
    if (rel.includes("/arena/")) return false;
    const raw = fs.readFileSync(f, "utf8");
    if (!/["']use client["']/.test(raw)) return false;
    return !/requireAdmin\s*\(/.test(strip(raw));
  });
}

describe("a screen reports the real reason it has no data", () => {
  it("finds customer screens to check", () => {
    expect(customerClientFiles().length).toBeGreaterThan(30);
  });

  it("no screen collapses 403 into the same branch as 401", () => {
    const offences: string[] = [];
    for (const file of customerClientFiles()) {
      const src = strip(fs.readFileSync(file, "utf8"));
      const rel = path.relative(process.cwd(), file).replace(/\\/g, "/");
      src.split("\n").forEach((line, i) => {
        // `status === 401 || status === 403` (either order) in one condition
        if (/status\s*===\s*401[\s\S]{0,30}?\|\|[\s\S]{0,30}?status\s*===\s*403/.test(line) ||
            /status\s*===\s*403[\s\S]{0,30}?\|\|[\s\S]{0,30}?status\s*===\s*401/.test(line)) {
          offences.push(
            `\n  401 and 403 share a branch — a permanent "not permitted" will be` +
              `\n  reported as an expired session:` +
              `\n    file=${rel}:${i + 1}` +
              `\n    fix=split them; 403 must say the data is not available to this` +
              `\n        account and point somewhere that IS`,
          );
        }
      });
    }
    expect(offences, offences.join("")).toEqual([]);
  });

  it("the two screens this was found on now branch on 403 and 402 separately", () => {
    const sh = strip(fs.readFileSync(path.join(DASH, "system-health/system-health-ui.tsx"), "utf8"));
    expect(sh, "system-health must handle 403 on its own").toMatch(/status === 403/);
    expect(sh).toMatch(/kind: "forbidden"/);

    const bi = strip(
      fs.readFileSync(path.join(DASH, "business-intelligence/business-intelligence-ui.tsx"), "utf8"),
    );
    expect(bi, "402 must not fall through to the generic error branch").toMatch(/status === 402/);
    expect(bi).toMatch(/kind: "locked"/);
  });
});
