/**
 * A merchant is never shown an API endpoint as instructions.
 *
 * Found by reading customer pages on production:
 *
 *   /dashboard/agents  described the feature as
 *                      "شغّلهم عبر /api/agents/run" — the page's own subtitle.
 *   /dashboard/brain   made it the EMPTY STATE: "لم تُبنَ ملفات الدماغ بعد —
 *                      استدعِ /api/brain/memory لإثرائها", i.e. the one moment
 *                      the customer needs a next step, they were handed an
 *                      HTTP call they have no way to make from the UI.
 *
 * The developer centre is exempt for the obvious reason: publishing endpoints
 * is what it is for. Everywhere else, an endpoint in visible copy means the
 * page is describing the implementation instead of the product.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const DASH = path.join(process.cwd(), "app", "dashboard");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");

/** Publishing endpoints is the developer centre's job. Operator consoles are not customer surface. */
const EXEMPT = ["/developer/", "/arena/"];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

interface Hit { file: string; line: number; endpoint: string }

function scan(): Hit[] {
  const hits: Hit[] = [];
  for (const file of walk(DASH)) {
    const rel = path.relative(process.cwd(), file).replace(/\\/g, "/");
    if (EXEMPT.some((e) => ("/" + rel).includes(e))) continue;

    const src = strip(fs.readFileSync(file, "utf8"));
    if (/requireAdmin\s*\(/.test(src)) continue; // platform tooling

    src.split("\n").forEach((line, i) => {
      // Skip the places an endpoint legitimately appears: the call itself, a
      // link target, and imports.
      if (/fetch\(|href=|import |from ["']/.test(line)) return;
      const m = line.match(/>[^<]*(\/api\/[a-z0-9/_-]+)/i);
      if (m) hits.push({ file: rel, line: i + 1, endpoint: m[1] });
    });
  }
  return hits;
}

describe("customer copy describes the product, not the API", () => {
  it("the scan reaches real files", () => {
    expect(walk(DASH).length).toBeGreaterThan(50);
  });

  it("no customer page renders an API endpoint as visible text", () => {
    const hits = scan();
    const report = hits
      .map(
        (h) =>
          `\n  API endpoint shown to a merchant:` +
          `\n    file=${h.file}:${h.line}` +
          `\n    endpoint=${h.endpoint}` +
          `\n    fix=describe what the customer does, and link to /dashboard/developer for the programmatic path`,
      )
      .join("");
    expect(hits, report).toEqual([]);
  });
});
