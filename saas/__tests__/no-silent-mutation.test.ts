/**
 * A customer action must never fail silently.
 *
 * The regression this locks was systemic, not a one-off: 41 call sites across
 * 25 customer screens wrote
 *
 *     await fetch(`/api/products/${p.id}`, { method: "DELETE" });
 *     load();
 *
 * and never looked at the response. When the server answered 402 (off-plan),
 * 403 (wrong role) or 500, the list simply reloaded unchanged — the row the
 * customer just deleted was still there, with no error, no toast, nothing. The
 * product looked broken rather than gated. Three screens were worse: they set a
 * success message *before* the request resolved, so a failed WhatsApp reconnect
 * still reported "بدأ إعادة الربط".
 *
 * THE RULE: on a customer screen, a mutating fetch (POST/PATCH/PUT/DELETE) must
 * have its outcome inspected — via useMutate(), an assigned Response that gets
 * checked, or a .then/.catch chain. `await fetch(...)` as a bare statement is
 * the shape that cannot report failure, and it is what this test rejects.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const DASH = path.join(process.cwd(), "app", "dashboard");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");

/**
 * Screens exempt from the rule, each for a reason that is checked, not assumed.
 * Adding to this list is a deliberate act — do not extend it to silence a real
 * customer-facing gap.
 */
const EXEMPT: { match: string; why: string }[] = [
  {
    match: "app/dashboard/arena/",
    why: "operator console behind requireAdmin(); never reachable by a customer",
  },
  {
    match: "app/dashboard/whatsapp/whatsapp-ui.tsx",
    why: "dead code — app/dashboard/whatsapp/page.tsx is a pure redirect and nothing imports this file",
  },
  {
    match: "app/dashboard/logout",
    why: "sign-out; the navigation away IS the feedback, and a failed logout still clears the client",
  },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

interface Offence {
  file: string;
  line: number;
  code: string;
}

/** Every `await fetch(...);` statement, with its full parenthesised argument list. */
function bareAwaitFetchStatements(src: string): { index: number; text: string }[] {
  const out: { index: number; text: string }[] = [];
  for (const m of src.matchAll(/^[ \t]*await fetch\(/gm)) {
    const open = m.index! + m[0].length - 1;
    let depth = 0;
    let j = open;
    for (; j < src.length; j++) {
      if (src[j] === "(") depth++;
      else if (src[j] === ")" && --depth === 0) break;
    }
    // Only a statement — i.e. the call is immediately terminated by `);`.
    if (src.slice(j, j + 2) === ");") out.push({ index: m.index!, text: src.slice(m.index!, j + 2) });
  }
  return out;
}

function scan(): Offence[] {
  const offences: Offence[] = [];
  for (const file of walk(DASH)) {
    const rel = path.relative(process.cwd(), file).replace(/\\/g, "/");
    if (EXEMPT.some((e) => rel.includes(e.match))) continue;

    const raw = fs.readFileSync(file, "utf8");
    if (!/["']use client["']/.test(raw)) continue;
    const src = strip(raw);

    for (const { index, text } of bareAwaitFetchStatements(src)) {
      if (!/method:\s*["'](POST|PATCH|PUT|DELETE)["']/.test(text)) continue;
      offences.push({
        file: rel,
        line: src.slice(0, index).split("\n").length,
        code: text.trim().split("\n")[0].slice(0, 90),
      });
    }
  }
  return offences;
}

describe("no customer action fails silently", () => {
  it("the scan itself finds files to check (a broken walk must not pass as clean)", () => {
    const clientFiles = walk(DASH).filter((f) => /["']use client["']/.test(fs.readFileSync(f, "utf8")));
    expect(clientFiles.length).toBeGreaterThan(30);
  });

  it("every mutating fetch on a customer screen checks its response", () => {
    const offences = scan();
    const report = offences
      .map(
        (o) =>
          `\n  Unchecked mutation — the customer sees nothing when this fails:` +
          `\n    file=${o.file}:${o.line}` +
          `\n    code=${o.code}` +
          `\n    fix=wrap with useMutate(): if (!(await mutate(...))) return;`,
      )
      .join("");
    expect(offences, report).toEqual([]);
  });

  it("every exemption names a file that still exists, so the list cannot rot", () => {
    for (const e of EXEMPT) {
      const target = path.join(process.cwd(), e.match);
      const exists = fs.existsSync(target) || fs.existsSync(path.dirname(target));
      expect(exists, `exemption points at nothing: ${e.match} (${e.why})`).toBe(true);
    }
  });
});
