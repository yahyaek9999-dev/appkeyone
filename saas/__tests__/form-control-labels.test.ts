/**
 * Form controls on customer screens need an accessible name.
 *
 * Found while walking /dashboard/settings/team: the invite form's three
 * controls — name, email, and the role <select> — had no accessible name at
 * all. Placeholders are not labels (they disappear the moment you type, and are
 * not a reliable accessible name); the <select> did not even have that much, so
 * a screen reader announced the role picker as an anonymous combobox.
 *
 * It also made the page look broken to tooling: the accessibility tree listed
 * no form controls for that page, which is what first drew attention to it.
 *
 * A <select> is the strictest case in this codebase — it has no placeholder to
 * fall back on — so it is what this test enforces. At the time of writing,
 * 43 of 46 customer selects were unnamed. That is a real debt and it is
 * recorded here as a BUDGET rather than an allowlist: the number may fall, and
 * must never rise. Fixing selects lowers the budget; adding an unlabelled one
 * fails the build.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const DASH = path.join(process.cwd(), "app", "dashboard");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");

/**
 * Customer selects with no accessible name at the time this guard was written:
 * 43 of 46. Lower it as you label more; never raise it.
 */
const UNNAMED_SELECT_BUDGET = 43;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

function customerClientFiles(): string[] {
  return walk(DASH).filter((f) => {
    if (("/" + path.relative(process.cwd(), f)).replace(/\\/g, "/").includes("/arena/")) return false;
    const raw = fs.readFileSync(f, "utf8");
    if (!/["']use client["']/.test(raw)) return false;
    return !/requireAdmin\s*\(/.test(strip(raw));
  });
}

/**
 * Attributes of the tag opening at `start`, ending at the first `>` seen at
 * brace depth zero.
 *
 * A naive /<select\b([^>]*)>/ is WRONG here and I got it wrong first: JSX
 * attributes hold arrow functions — `onChange={(e) => ...}` — whose `=>`
 * contains a `>`, so the capture stops early and any aria-label placed after
 * such an attribute is invisible to the scan. That over-counted the debt as
 * 46/46 when it was 43/46.
 */
function tagAttrs(src: string, start: number): string {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return src.slice(start, i);
  }
  return src.slice(start, start + 400);
}

function unnamedSelects(): { file: string; snippet: string }[] {
  const out: { file: string; snippet: string }[] = [];
  for (const file of customerClientFiles()) {
    const src = strip(fs.readFileSync(file, "utf8"));
    let idx = 0;
    while ((idx = src.indexOf("<select", idx)) !== -1) {
      const attrs = tagAttrs(src, idx + "<select".length);
      // id= counts because a <label for=…> may supply the name elsewhere.
      if (!/aria-label|aria-labelledby|\bid=/.test(attrs)) {
        out.push({
          file: path.relative(process.cwd(), file).replace(/\\/g, "/"),
          snippet: ("<select" + attrs).replace(/\s+/g, " ").slice(0, 80),
        });
      }
      idx += "<select".length;
    }
  }
  return out;
}

describe("customer form controls are announceable", () => {
  it("the scan reaches real client screens", () => {
    expect(customerClientFiles().length).toBeGreaterThan(30);
  });

  it("the number of unnamed <select> controls never grows", () => {
    const found = unnamedSelects();
    expect(
      found.length,
      `Unnamed <select> count rose to ${found.length} (budget ${UNNAMED_SELECT_BUDGET}).\n` +
        `A <select> has no placeholder to fall back on, so with no aria-label a\n` +
        `screen reader announces it as an anonymous combobox.\n` +
        `fix=add aria-label="…" describing what is being chosen.\n` +
        found.slice(0, 8).map((f) => `  ${f.file}: ${f.snippet}`).join("\n"),
    ).toBeLessThanOrEqual(UNNAMED_SELECT_BUDGET);
  });

  it("the team invite form — the one proven broken in the browser — is named", () => {
    const src = strip(fs.readFileSync(path.join(DASH, "settings/team/team-settings-ui.tsx"), "utf8"));
    for (const label of ["اسم العضو (اختياري)", "البريد الإلكتروني للعضو", "دور العضو"]) {
      expect(src, `invite form lost its accessible name: ${label}`).toContain(`aria-label="${label}"`);
    }
  });
});
