/**
 * multi_team — the capability that was sold on Enterprise and had no product
 * behind it. The catalog listed "فرق متعدّدة مع صلاحيات منفصلة", the isolation
 * columns existed on TeamMember (`conversationScope`, `allowedNumberIds`), and
 * NOTHING wrote either one: no API, no script, no screen. Every member sat on
 * the default forever, so a customer could not create a second team or give a
 * team its own permissions.
 *
 * What these tests pin down:
 *   · the precedence rule (member override > team policy > historical default)
 *   · that an untouched workspace resolves EXACTLY to the pre-teams behaviour
 *     — this is the non-regression guarantee, and it is the reason the default
 *     is own_only rather than something wider
 *   · that the destination is discoverable, Enterprise-unlocked, and locked
 *     (never hidden) below Enterprise
 *   · that the API surface enforces the same authorization the UI does
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Read a source file with comments stripped. These modules document their own
 * gating rules in prose — `pageGate(...)` and `apiGate("multi_team","team")`
 * both appear in header comments — so an assertion that counted or located
 * them raw would be measuring the documentation instead of the code.
 */
function code(rel: string): string {
  return fs
    .readFileSync(path.join(process.cwd(), rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
}
import {
  resolveScope,
  parseNumberIds,
  isConversationScope,
  DEFAULT_SCOPE,
  CONVERSATION_SCOPES,
  type MemberScopeInput,
} from "@/lib/teams/scope";
import {
  navItemVisible,
  navItemLocked,
  NAV_CAP_BY_HREF,
  NAV_FEATURE_BY_HREF,
  WORKSPACES,
  type NavItem,
} from "@/app/dashboard/nav-items";
import { CAPABILITIES } from "@/lib/pricing/catalog";

const CUSTOMER_ITEMS: NavItem[] = WORKSPACES.flatMap((w) => w.items);
const TEAMS_HREF = "/dashboard/teams";

function capsForTier(tierIndex: number): Record<string, boolean> {
  const caps: Record<string, boolean> = {};
  for (const c of CAPABILITIES) caps[c.key] = tierIndex >= c.minTierIndex;
  return caps;
}
const base = { activated: true, metaMode: "qr" as const, disabledFeatures: new Set<string>() };

/** A member with nothing configured — every row that exists in production today. */
const untouched: MemberScopeInput = {
  conversationScope: "",
  allowedNumberIds: "[]",
  team: null,
};

const team = (over: Partial<NonNullable<MemberScopeInput["team"]>> = {}) => ({
  id: "t1",
  name: "فريق المبيعات",
  conversationScope: "team",
  allowedNumberIds: "[]",
  ...over,
});

// ───────────────────────────────────────────────────────────────────────────
describe("scope resolution: an untouched workspace does not change", () => {
  it("a member with no team and no override is own_only over all numbers", () => {
    const r = resolveScope(untouched);
    expect(r.scope).toBe("own_only");
    expect(r.scope).toBe(DEFAULT_SCOPE);
    expect(r.allowedNumberIds).toEqual([]);
    expect(r.teamId).toBeNull();
    expect(r.scopeSource).toBe("default");
  });

  it("nulls from the DB are treated as unconfigured, not as a wider scope", () => {
    const r = resolveScope({ conversationScope: null, allowedNumberIds: null, team: null });
    expect(r.scope).toBe("own_only");
    expect(r.allowedNumberIds).toEqual([]);
  });

  it("a garbage scope value never widens access", () => {
    const r = resolveScope({ ...untouched, conversationScope: "superuser" });
    expect(r.scope).toBe("own_only");
    expect(r.scopeSource).toBe("default");
  });
});

describe("scope resolution: precedence", () => {
  it("the team policy applies when the member sets no override", () => {
    const r = resolveScope({ ...untouched, team: team({ conversationScope: "team" }) });
    expect(r.scope).toBe("team");
    expect(r.scopeSource).toBe("team");
    expect(r.teamName).toBe("فريق المبيعات");
  });

  it("a member override BEATS the team policy — both wider and narrower", () => {
    const wider = resolveScope({ ...untouched, conversationScope: "all", team: team({ conversationScope: "team" }) });
    expect(wider.scope).toBe("all");
    expect(wider.scopeSource).toBe("member");

    const narrower = resolveScope({ ...untouched, conversationScope: "own_only", team: team({ conversationScope: "all" }) });
    expect(narrower.scope).toBe("own_only");
    expect(narrower.scopeSource).toBe("member");
  });

  it("number restrictions follow the same precedence", () => {
    const fromTeam = resolveScope({ ...untouched, team: team({ allowedNumberIds: '["n1","n2"]' }) });
    expect(fromTeam.allowedNumberIds).toEqual(["n1", "n2"]);
    expect(fromTeam.numbersSource).toBe("team");

    const fromMember = resolveScope({
      conversationScope: "",
      allowedNumberIds: '["n9"]',
      team: team({ allowedNumberIds: '["n1","n2"]' }),
    });
    expect(fromMember.allowedNumberIds).toEqual(["n9"]);
    expect(fromMember.numbersSource).toBe("member");
  });

  it("an empty member list means INHERIT, not 'restrict to nothing'", () => {
    // The distinction that makes the column usable: [] is the unset value, so a
    // member with no personal number list still picks up their team's.
    const r = resolveScope({ conversationScope: "", allowedNumberIds: "[]", team: team({ allowedNumberIds: '["n1"]' }) });
    expect(r.allowedNumberIds).toEqual(["n1"]);
  });
});

describe("allowedNumberIds parsing is defensive", () => {
  it("malformed JSON is unrestricted rather than throwing", () => {
    expect(parseNumberIds("{not json")).toEqual([]);
    expect(parseNumberIds("null")).toEqual([]);
    expect(parseNumberIds('{"a":1}')).toEqual([]);
  });
  it("non-string entries are dropped", () => {
    expect(parseNumberIds('["a",1,null,"b",""]')).toEqual(["a", "b"]);
  });
  it("only the three known scopes are accepted", () => {
    for (const s of CONVERSATION_SCOPES) expect(isConversationScope(s)).toBe(true);
    for (const s of ["", "owner", "ALL", null, undefined, 3]) expect(isConversationScope(s)).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("navigation: multi_team is discoverable", () => {
  it("the destination exists in a CUSTOMER workspace (not admin-only)", () => {
    const ws = WORKSPACES.find((w) => w.items.some((i) => i.href === TEAMS_HREF));
    expect(ws, "/dashboard/teams is in no customer workspace").toBeTruthy();
    expect(ws!.id).toBe("settings");
  });

  it("it carries an icon and an Arabic label", () => {
    const item = CUSTOMER_ITEMS.find((i) => i.href === TEAMS_HREF)!;
    expect(item.icon, "no icon — it would render as a bare text row").toBeTruthy();
    expect(item.label).toBe("الفرق والصلاحيات");
    expect(/[؀-ۿ]/.test(item.label), "label is not Arabic").toBe(true);
  });

  it("it gates on the capability the page itself enforces", () => {
    expect(NAV_CAP_BY_HREF[TEAMS_HREF]).toBe("multi_team");
    expect(NAV_FEATURE_BY_HREF[TEAMS_HREF]).toBe("multi_team");
    const src = code("app/dashboard/teams/page.tsx");
    expect(src).toMatch(/pageGate\(\s*"multi_team"\s*\)/);
  });

  it("multi_team is a real Enterprise capability in the catalog", () => {
    const cap = CAPABILITIES.find((c) => c.key === "multi_team");
    expect(cap, "multi_team vanished from the catalog").toBeTruthy();
    expect(cap!.minTierIndex, "multi_team is no longer Enterprise-tier").toBe(3);
    expect(cap!.comingSoon, "multi_team must not be comingSoon — it ships").toBeFalsy();
  });
});

describe("entitlement: Enterprise unlocked, lower tiers LOCKED not hidden", () => {
  const item = () => CUSTOMER_ITEMS.find((i) => i.href === TEAMS_HREF)!;

  it("an Enterprise owner sees it unlocked", () => {
    const opts = { role: "owner" as const, ...base, enforce: true, caps: capsForTier(3) };
    expect(navItemVisible(item(), opts)).toBe(true);
    expect(navItemLocked(item(), opts)).toBe(false);
  });

  it.each([0, 1, 2])("tier %i still SEES it, wearing the upgrade lock", (t) => {
    const opts = { role: "owner" as const, ...base, enforce: true, caps: capsForTier(t) };
    expect(navItemVisible(item(), opts), "entitlement hid the destination").toBe(true);
    expect(navItemLocked(item(), opts), "a lower tier is not shown the lock").toBe(true);
  });

  it("turning customerVisible off is the ONLY thing that removes it", () => {
    const opts = { role: "owner" as const, ...base, enforce: true, caps: capsForTier(3) };
    expect(navItemVisible(item(), { ...opts, disabledFeatures: new Set(["multi_team"]) })).toBe(false);
  });
});

describe("navigation: RBAC matches the page and the API", () => {
  it("the nav entry requires the 'team' permission", () => {
    expect(CUSTOMER_ITEMS.find((i) => i.href === TEAMS_HREF)!.perm).toBe("team");
  });

  it.each(["sales", "support", "viewer"] as const)("a %s member cannot see it", (role) => {
    const opts = { role, ...base, enforce: true, caps: capsForTier(3) };
    expect(navItemVisible(CUSTOMER_ITEMS.find((i) => i.href === TEAMS_HREF)!, opts)).toBe(false);
  });

  it("owner and admin can", () => {
    for (const role of ["owner", "admin"] as const) {
      const opts = { role, ...base, enforce: true, caps: capsForTier(3) };
      expect(navItemVisible(CUSTOMER_ITEMS.find((i) => i.href === TEAMS_HREF)!, opts)).toBe(true);
    }
  });

  it("the PAGE redirects a principal without the 'team' permission, before it ever mentions the plan", () => {
    // Order matters: a viewer must not learn which capabilities the plan holds.
    const src = code("app/dashboard/teams/page.tsx");
    const rbacAt = src.indexOf('can(ctx.role, "team")');
    const gateAt = src.indexOf("pageGate(");
    expect(rbacAt, "page does not check the team permission").toBeGreaterThan(-1);
    expect(rbacAt).toBeLessThan(gateAt);
  });
});

// ───────────────────────────────────────────────────────────────────────────
/**
 * API authorization is asserted structurally rather than over HTTP: these are
 * Next route modules whose guard is a single call, and the risk being locked
 * here is someone ADDING a handler later without the guard — which a source
 * assertion catches and a happy-path HTTP test does not.
 */
describe("API: every teams handler is gated and tenant-scoped", () => {
  const ROUTES = [
    "app/api/teams/route.ts",
    "app/api/teams/[id]/route.ts",
    "app/api/teams/[id]/members/route.ts",
  ];

  it.each(ROUTES)("%s gates every exported handler on multi_team + team", (rel) => {
    const src = code(rel);
    const handlers = [...src.matchAll(/export async function (GET|POST|PATCH|DELETE|PUT)\b/g)].map((m) => m[1]);
    expect(handlers.length, `${rel} exports no handlers`).toBeGreaterThan(0);
    const gates = [...src.matchAll(/apiGate\(\s*"multi_team"\s*,\s*"team"\s*\)/g)];
    expect(gates.length, `${rel}: ${handlers.length} handlers but ${gates.length} gates`).toBe(handlers.length);
  });

  it.each(ROUTES)("%s never trusts an owner id from the request", (rel) => {
    const src = code(rel);
    // uid comes from the gate (session-derived) and nowhere else.
    expect(src).toMatch(/const uid = g\.uid!/);
    expect(src, "an ownerId is being read out of the request body").not.toMatch(/body\.(ownerId|userId)/);
  });

  it("every team read is scoped by ownerId — a foreign id must 404, not resolve", () => {
    for (const rel of ROUTES) {
      const src = code(rel);
      const reads = [...src.matchAll(/db\.team\.(findFirst|findMany|findUnique)\(\{[\s\S]{0,120}?\}/g)].map((m) => m[0]);
      for (const r of reads) {
        expect(r, `unscoped team read in ${rel}: ${r}`).toMatch(/ownerId: uid/);
      }
    }
  });

  it("assigning a member re-checks that the MEMBER belongs to the caller's workspace too", () => {
    // Scoping only the team would let an admin pull a person out of another
    // tenant by guessing their id.
    const src = code("app/api/teams/[id]/members/route.ts");
    const reads = [...src.matchAll(/db\.teamMember\.findFirst\(\{[\s\S]{0,160}?\}/g)].map((m) => m[0]);
    expect(reads.length).toBeGreaterThan(0);
    for (const r of reads) expect(r).toMatch(/ownerId: uid/);
  });

  it("number ids from the body are re-verified against the workspace before being stored", () => {
    for (const rel of ["app/api/teams/route.ts", "app/api/teams/[id]/route.ts", "app/api/teams/[id]/members/route.ts"]) {
      const src = code(rel);
      if (!/allowedNumberIds/.test(src)) continue;
      expect(src, `${rel} stores number ids without checking ownership`).toMatch(
        /whatsAppNumber\.findMany\(\{\s*where:\s*\{\s*userId: uid/,
      );
    }
  });

  it("scope values are validated against the enum, never free text", () => {
    for (const rel of ROUTES) {
      const src = code(rel);
      if (!/conversationScope/.test(src)) continue;
      expect(src, `${rel} accepts an unvalidated scope`).toMatch(/z\.enum\(/);
    }
  });
});

describe("the inbox actually enforces the resolved scope", () => {
  const src = code("app/api/inbox/conversations/route.ts");

  it("it resolves the member's scope instead of hard-coding own_only", () => {
    expect(src).toMatch(/resolveMemberScope\(memberId\)/);
    expect(src).toMatch(/assigneeScopeIds\(memberId, resolved\)/);
  });

  it("the number filter comes from the resolver, not from a raw column read", () => {
    expect(src).toMatch(/resolved\.allowedNumberIds/);
    expect(src, "still parsing the column inline — the team policy would be ignored")
      .not.toMatch(/JSON\.parse\(\s*memberRow\.allowedNumberIds/);
  });
});
