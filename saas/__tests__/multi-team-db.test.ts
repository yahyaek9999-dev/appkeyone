/**
 * multi_team against a REAL database.
 *
 * The companion suite (multi-team.test.ts) proves the pure resolver and asserts
 * the shape of the guards. This one runs the actual Prisma writes the API makes,
 * against a live PostgreSQL schema pushed from prisma/schema.postgres.prisma —
 * because the two claims that matter most here cannot be proven from source:
 *
 *   1. TENANT ISOLATION. `findFirst({ id, ownerId })` returning null for a
 *      foreign team is a database fact, not a code-reading exercise.
 *   2. NON-REGRESSION. Deleting a team must not delete the people in it
 *      (onDelete: SetNull) — a schema-level behaviour that only the engine
 *      can confirm.
 *
 * Requires a local PostgreSQL. Create the scratch database once with:
 *   createdb keyone_multiteam_test && \
 *   POSTGRES_URL=postgresql://localhost:5432/keyone_multiteam_test \
 *   npx prisma db push --schema prisma/schema.postgres.prisma
 *
 * Every row it creates is namespaced by a per-run tag and torn down in after().
 * It never touches a shared database: the URL is hard-required to end in
 * `_test`, so pointing it at dev or production fails instead of mutating them.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { resolveScope, parseNumberIds } from "@/lib/teams/scope";

const URL =
  process.env.TEST_POSTGRES_URL ||
  "postgresql://localhost:5432/keyone_multiteam_test";

// Refuse to run against anything that is not an explicit test database.
if (!/_test(\?|$)/.test(URL)) {
  throw new Error(`refusing to run DB tests against a non-_test database: ${URL}`);
}

const db = new PrismaClient({ datasources: { db: { url: URL } } }) as any;

/** Unique per run so parallel runs and leftovers never collide. */
const TAG = `mt-${process.pid}-${process.hrtime.bigint().toString(36)}`;
const email = (s: string) => `${TAG}-${s}@example.test`;

let reachable = true;
let alpha: any;   // tenant A (the workspace under test)
let beta: any;    // tenant B (the foreign workspace)

beforeAll(async () => {
  try {
    await db.$queryRawUnsafe("select 1");
  } catch {
    reachable = false;
    return;
  }
  alpha = await db.user.create({
    data: { email: email("alpha-owner"), passwordHash: "x", name: "Alpha" },
  });
  beta = await db.user.create({
    data: { email: email("beta-owner"), passwordHash: "x", name: "Beta" },
  });
});

afterAll(async () => {
  if (reachable) {
    // Cascades from User clear teams, members and numbers.
    await db.user.deleteMany({ where: { email: { contains: TAG } } }).catch(() => {});
  }
  await db.$disconnect().catch(() => {});
});

/** Skips the whole file with a loud message rather than a silent green run. */
function requireDb() {
  if (!reachable) {
    throw new Error(
      `PostgreSQL not reachable at ${URL} — these tests assert real DB behaviour and must not be skipped silently.`,
    );
  }
}

const member = (ownerId: string, local: string, over: any = {}) =>
  db.teamMember.create({
    data: { ownerId, email: email(local), name: local, role: "sales", status: "active", ...over },
  });

// ───────────────────────────────────────────────────────────────────────────
describe("create / rename / delete a team", () => {
  it("creates a team with the default policy", async () => {
    requireDb();
    const t = await db.team.create({ data: { ownerId: alpha.id, name: `${TAG} مبيعات` } });
    expect(t.conversationScope).toBe("team");
    expect(t.allowedNumberIds).toBe("[]");
    expect(t.description).toBe("");
  });

  it("rejects a duplicate name inside the SAME workspace", async () => {
    requireDb();
    await db.team.create({ data: { ownerId: alpha.id, name: `${TAG} دعم` } });
    await expect(
      db.team.create({ data: { ownerId: alpha.id, name: `${TAG} دعم` } }),
    ).rejects.toThrow();
  });

  it("allows the same team name in a DIFFERENT workspace", async () => {
    requireDb();
    const name = `${TAG} مشترك`;
    await db.team.create({ data: { ownerId: alpha.id, name } });
    const other = await db.team.create({ data: { ownerId: beta.id, name } });
    expect(other.id).toBeTruthy();
  });

  it("renames and re-scopes a team", async () => {
    requireDb();
    const t = await db.team.create({ data: { ownerId: alpha.id, name: `${TAG} قبل` } });
    const after = await db.team.update({
      where: { id: t.id },
      data: { name: `${TAG} بعد`, conversationScope: "all", description: "وصف" },
    });
    expect(after.name).toBe(`${TAG} بعد`);
    expect(after.conversationScope).toBe("all");
    expect(after.description).toBe("وصف");
  });

  it("deleting a team DETACHES its members instead of deleting them", async () => {
    requireDb();
    const t = await db.team.create({ data: { ownerId: alpha.id, name: `${TAG} مؤقت` } });
    const m = await member(alpha.id, "survivor", { teamId: t.id });

    await db.team.delete({ where: { id: t.id } });

    const still = await db.teamMember.findUnique({ where: { id: m.id } });
    expect(still, "deleting a team deleted a person — data loss").toBeTruthy();
    expect(still.teamId, "member kept a dangling teamId").toBeNull();
    // And they fall back to the narrowest scope, never a wider one.
    expect(resolveScope({ ...still, team: null }).scope).toBe("own_only");
  });
});

describe("membership: add and remove", () => {
  it("adds a member to a team and reads them back through the relation", async () => {
    requireDb();
    const t = await db.team.create({ data: { ownerId: alpha.id, name: `${TAG} فريق-أ` } });
    const m = await member(alpha.id, "adds");
    await db.teamMember.update({ where: { id: m.id }, data: { teamId: t.id } });

    const withMembers = await db.team.findUnique({
      where: { id: t.id },
      include: { members: { select: { id: true, email: true } } },
    });
    expect(withMembers.members.map((x: any) => x.id)).toContain(m.id);
  });

  it("removing a member clears their personal override too", async () => {
    requireDb();
    const t = await db.team.create({ data: { ownerId: alpha.id, name: `${TAG} فريق-ب` } });
    const m = await member(alpha.id, "removes", {
      teamId: t.id, conversationScope: "all", allowedNumberIds: '["n1"]',
    });

    // Exactly what DELETE /api/teams/:id/members writes.
    const after = await db.teamMember.update({
      where: { id: m.id },
      data: { teamId: null, conversationScope: "", allowedNumberIds: "[]" },
    });

    expect(after.teamId).toBeNull();
    // The point: leaving a team must not leave someone holding "all".
    expect(resolveScope({ ...after, team: null }).scope).toBe("own_only");
  });

  it("a member with no team is in the unassigned pool the UI offers", async () => {
    requireDb();
    const m = await member(alpha.id, "pool");
    const pool = await db.teamMember.findMany({
      where: { ownerId: alpha.id, teamId: null },
      select: { id: true },
    });
    expect(pool.map((x: any) => x.id)).toContain(m.id);
  });
});

describe("scope + allowed numbers, resolved from real rows", () => {
  it("a member inherits their team's scope and numbers", async () => {
    requireDb();
    const t = await db.team.create({
      data: {
        ownerId: alpha.id,
        name: `${TAG} فريق-نطاق`,
        conversationScope: "team",
        allowedNumberIds: JSON.stringify(["num-1", "num-2"]),
      },
    });
    const m = await member(alpha.id, "inherits", { teamId: t.id });

    const row = await db.teamMember.findUnique({
      where: { id: m.id },
      select: {
        conversationScope: true, allowedNumberIds: true,
        team: { select: { id: true, name: true, conversationScope: true, allowedNumberIds: true } },
      },
    });
    const r = resolveScope(row);
    expect(r.scope).toBe("team");
    expect(r.scopeSource).toBe("team");
    expect(r.allowedNumberIds).toEqual(["num-1", "num-2"]);
    expect(r.teamId).toBe(t.id);
  });

  it("a personal override wins over the team policy", async () => {
    requireDb();
    const t = await db.team.create({
      data: { ownerId: alpha.id, name: `${TAG} فريق-تجاوز`, conversationScope: "all" },
    });
    const m = await member(alpha.id, "override", { teamId: t.id, conversationScope: "own_only" });

    const row = await db.teamMember.findUnique({
      where: { id: m.id },
      select: {
        conversationScope: true, allowedNumberIds: true,
        team: { select: { id: true, name: true, conversationScope: true, allowedNumberIds: true } },
      },
    });
    const r = resolveScope(row);
    expect(r.scope).toBe("own_only");
    expect(r.scopeSource).toBe("member");
  });

  it("every member created before teams existed still resolves to own_only", async () => {
    requireDb();
    // A row written with nothing but the pre-teams fields — the shape of every
    // TeamMember currently in production.
    const legacy = await member(alpha.id, "legacy");
    expect(legacy.teamId).toBeNull();
    expect(legacy.conversationScope).toBe("");
    expect(legacy.allowedNumberIds).toBe("[]");

    const r = resolveScope({ ...legacy, team: null });
    expect(r.scope).toBe("own_only");
    expect(r.allowedNumberIds).toEqual([]);
  });

  it("the team roster is the assignee set a 'team'-scoped member may read", async () => {
    requireDb();
    const t = await db.team.create({ data: { ownerId: alpha.id, name: `${TAG} فريق-زملاء` } });
    const a = await member(alpha.id, "peer-a", { teamId: t.id });
    const b = await member(alpha.id, "peer-b", { teamId: t.id });
    const outsider = await member(alpha.id, "outsider");

    const peers = await db.teamMember.findMany({ where: { teamId: t.id }, select: { id: true } });
    const ids = peers.map((p: any) => p.id);
    expect(ids).toEqual(expect.arrayContaining([a.id, b.id]));
    expect(ids, "a member outside the team leaked into its scope").not.toContain(outsider.id);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("TENANT ISOLATION", () => {
  it("a team from another workspace is invisible, not just unwritable", async () => {
    requireDb();
    const foreign = await db.team.create({ data: { ownerId: beta.id, name: `${TAG} أجنبي` } });

    // The exact read every handler performs.
    const asAlpha = await db.team.findFirst({ where: { id: foreign.id, ownerId: alpha.id } });
    expect(asAlpha, "cross-tenant team read succeeded").toBeNull();

    // …while its own tenant does see it, proving the row exists and the null
    // above is the scoping, not a missing row.
    expect(await db.team.findFirst({ where: { id: foreign.id, ownerId: beta.id } })).toBeTruthy();
  });

  it("listing teams never returns another workspace's rows", async () => {
    requireDb();
    await db.team.create({ data: { ownerId: beta.id, name: `${TAG} قائمة-أجنبية` } });
    const mine = await db.team.findMany({ where: { ownerId: alpha.id }, select: { ownerId: true } });
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((t: any) => t.ownerId === alpha.id)).toBe(true);
  });

  it("a member from another workspace cannot be pulled into my team", async () => {
    requireDb();
    const mine = await db.team.create({ data: { ownerId: alpha.id, name: `${TAG} فريقي` } });
    const theirs = await member(beta.id, "foreign-member");

    // The members handler resolves the member with ownerId: uid as well — this
    // is the lookup that must fail before any update is attempted.
    const found = await db.teamMember.findFirst({ where: { id: theirs.id, ownerId: alpha.id } });
    expect(found, "cross-tenant member lookup succeeded — assignment would follow").toBeNull();

    // And they stay where they were.
    const after = await db.teamMember.findUnique({ where: { id: theirs.id } });
    expect(after.teamId).toBeNull();
    expect(after.ownerId).toBe(beta.id);
    expect(mine.id).toBeTruthy();
  });

  it("a WhatsApp number is only grantable by the workspace that owns it", async () => {
    requireDb();
    const theirNumber = await db.whatsAppNumber.create({
      data: { userId: beta.id, displayName: `${TAG}-beta-num`, phone: "+900000000" },
    });
    const myNumber = await db.whatsAppNumber.create({
      data: { userId: alpha.id, displayName: `${TAG}-alpha-num`, phone: "+900000001" },
    });

    // The ownership re-check every write performs on body-supplied ids.
    const owned = await db.whatsAppNumber.findMany({
      where: { userId: alpha.id, id: { in: [theirNumber.id, myNumber.id] } },
      select: { id: true },
    });
    const ids = owned.map((n: any) => n.id);
    expect(ids).toEqual([myNumber.id]);
    expect(ids, "a foreign number id survived the ownership filter").not.toContain(theirNumber.id);

    // Which is what lands in the column.
    const t = await db.team.create({
      data: { ownerId: alpha.id, name: `${TAG} فريق-أرقام`, allowedNumberIds: JSON.stringify(ids) },
    });
    expect(parseNumberIds(t.allowedNumberIds)).toEqual([myNumber.id]);
  });

  it("deleting a workspace takes its teams with it and leaves the other intact", async () => {
    requireDb();
    const doomed = await db.user.create({
      data: { email: email("doomed-owner"), passwordHash: "x" },
    });
    const t = await db.team.create({ data: { ownerId: doomed.id, name: `${TAG} فريق-محذوف` } });

    await db.user.delete({ where: { id: doomed.id } });

    expect(await db.team.findUnique({ where: { id: t.id } })).toBeNull();
    expect(await db.team.count({ where: { ownerId: alpha.id } })).toBeGreaterThan(0);
  });
});
