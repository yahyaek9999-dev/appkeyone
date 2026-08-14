/**
 * Team Routing — Tests
 *
 * Tests all 3 assignment strategies: manual, round_robin, least_loaded.
 * Mocks Prisma to isolate the pure routing logic.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Inline routing logic (mirrors executor.ts resolveStaffByStrategy) ─────────
// We test the strategy algorithm directly without Prisma.

type StaffMember = {
  id: string;
  userId: string;
  active: boolean;
  department: string | null;
  lastAssignedAt: Date | null;
};

type ConversationCount = { staffId: string; count: number };

function resolveByRoundRobin(staff: StaffMember[]): StaffMember | null {
  if (!staff.length) return null;
  // Sort by lastAssignedAt ASC — least recently assigned goes first
  const sorted = [...staff].sort((a, b) => {
    const aTime = a.lastAssignedAt?.getTime() ?? 0;
    const bTime = b.lastAssignedAt?.getTime() ?? 0;
    return aTime - bTime;
  });
  return sorted[0];
}

function resolveByLeastLoaded(staff: StaffMember[], counts: ConversationCount[]): StaffMember | null {
  if (!staff.length) return null;
  const countMap = new Map(counts.map((c) => [c.staffId, c.count]));
  const withCounts = staff.map((s) => ({ staff: s, count: countMap.get(s.id) ?? 0 }));
  withCounts.sort((a, b) => a.count - b.count);
  return withCounts[0].staff;
}

function resolveByManual(staff: StaffMember[], staffId: string): StaffMember | null {
  return staff.find((s) => s.id === staffId) || null;
}

// ─── Test data ────────────────────────────────────────────────────────────────

const BASE_DATE = new Date("2026-01-01T00:00:00Z");
const LATER_DATE = new Date("2026-01-01T12:00:00Z");
const LATEST_DATE = new Date("2026-01-01T18:00:00Z");

const makeStaff = (id: string, lastAssigned: Date | null = null, dept: string | null = null): StaffMember => ({
  id,
  userId: "owner-1",
  active: true,
  department: dept,
  lastAssignedAt: lastAssigned,
});

// ─── TESTS ────────────────────────────────────────────────────────────────────

describe("Team Routing — Manual Strategy", () => {
  const staff = [makeStaff("alice"), makeStaff("bob"), makeStaff("carol")];

  it("M1. manual: returns specified staff member", () => {
    const result = resolveByManual(staff, "bob");
    expect(result?.id).toBe("bob");
  });

  it("M2. manual: returns null if staffId not found", () => {
    const result = resolveByManual(staff, "nonexistent");
    expect(result).toBeNull();
  });

  it("M3. manual: works with single staff", () => {
    const result = resolveByManual([makeStaff("solo")], "solo");
    expect(result?.id).toBe("solo");
  });
});

describe("Team Routing — Round Robin Strategy", () => {
  it("R1. round robin: picks staff with oldest lastAssignedAt", () => {
    const staff = [
      makeStaff("alice", LATEST_DATE),
      makeStaff("bob", BASE_DATE),  // oldest — should be picked
      makeStaff("carol", LATER_DATE),
    ];
    const winner = resolveByRoundRobin(staff);
    expect(winner?.id).toBe("bob");
  });

  it("R2. round robin: null lastAssignedAt treated as never assigned (pick first)", () => {
    const staff = [
      makeStaff("alice", LATEST_DATE),
      makeStaff("bob", null), // never assigned — should be picked (0 < any timestamp)
      makeStaff("carol", BASE_DATE),
    ];
    const winner = resolveByRoundRobin(staff);
    expect(winner?.id).toBe("bob");
  });

  it("R3. round robin: single staff always wins", () => {
    const staff = [makeStaff("solo", LATEST_DATE)];
    const winner = resolveByRoundRobin(staff);
    expect(winner?.id).toBe("solo");
  });

  it("R4. round robin: empty staff returns null", () => {
    const winner = resolveByRoundRobin([]);
    expect(winner).toBeNull();
  });

  it("R5. round robin: distributes across multiple assignments (rotation)", () => {
    // Simulate 3 rounds of assignment
    const staff = [makeStaff("a", null), makeStaff("b", null), makeStaff("c", null)];
    const assignments: string[] = [];

    // Round 1: all null → first in list gets it
    const r1 = resolveByRoundRobin(staff);
    expect(r1).not.toBeNull();
    assignments.push(r1!.id);

    // Update lastAssignedAt for round 1 winner
    const idx1 = staff.findIndex((s) => s.id === r1!.id);
    staff[idx1].lastAssignedAt = new Date(Date.now() + 1);

    // Round 2: winner of round 1 now has a later time
    const r2 = resolveByRoundRobin(staff);
    expect(r2?.id).not.toBe(r1?.id); // different staff picked
    assignments.push(r2!.id);

    // 3 rounds → 3 different staff (round robin)
    const idx2 = staff.findIndex((s) => s.id === r2!.id);
    staff[idx2].lastAssignedAt = new Date(Date.now() + 2);

    const r3 = resolveByRoundRobin(staff);
    expect(r3?.id).not.toBe(r1?.id);
    expect(r3?.id).not.toBe(r2?.id);
  });
});

describe("Team Routing — Least Loaded Strategy", () => {
  it("L1. least loaded: picks staff with 0 active conversations", () => {
    const staff = [makeStaff("alice"), makeStaff("bob"), makeStaff("carol")];
    const counts: ConversationCount[] = [
      { staffId: "alice", count: 5 },
      { staffId: "bob", count: 0 },   // least loaded
      { staffId: "carol", count: 3 },
    ];
    const winner = resolveByLeastLoaded(staff, counts);
    expect(winner?.id).toBe("bob");
  });

  it("L2. least loaded: no counts → all 0 → picks first in list", () => {
    const staff = [makeStaff("alice"), makeStaff("bob")];
    const winner = resolveByLeastLoaded(staff, []);
    expect(winner?.id).toBe("alice"); // both 0, first wins
  });

  it("L3. least loaded: single staff always wins regardless of count", () => {
    const staff = [makeStaff("solo")];
    const counts: ConversationCount[] = [{ staffId: "solo", count: 99 }];
    const winner = resolveByLeastLoaded(staff, counts);
    expect(winner?.id).toBe("solo");
  });

  it("L4. least loaded: empty staff returns null", () => {
    const winner = resolveByLeastLoaded([], []);
    expect(winner).toBeNull();
  });

  it("L5. least loaded: tie broken by array order (first in list)", () => {
    const staff = [makeStaff("alice"), makeStaff("bob")];
    const counts: ConversationCount[] = [
      { staffId: "alice", count: 3 },
      { staffId: "bob", count: 3 }, // tie
    ];
    const winner = resolveByLeastLoaded(staff, counts);
    expect(winner?.id).toBe("alice"); // first in list wins tie
  });

  it("L6. least loaded: large team, picks global minimum", () => {
    const staff = Array.from({ length: 10 }, (_, i) => makeStaff(`staff-${i}`));
    const counts = staff.map((s, i) => ({ staffId: s.id, count: i * 2 }));
    const winner = resolveByLeastLoaded(staff, counts);
    expect(winner?.id).toBe("staff-0"); // count=0
  });
});

describe("Team Routing — Department Filtering", () => {
  const allStaff: StaffMember[] = [
    makeStaff("alice", null, "support"),
    makeStaff("bob", null, "support"),
    makeStaff("carol", null, "sales"),
    makeStaff("dave", null, null),
  ];

  function filterByDept(staff: StaffMember[], dept: string | null): StaffMember[] {
    if (!dept) return staff;
    return staff.filter((s) => s.department === dept);
  }

  it("D1. filter by support team: only alice and bob", () => {
    const filtered = filterByDept(allStaff, "support");
    expect(filtered.length).toBe(2);
    expect(filtered.map((s) => s.id).sort()).toEqual(["alice", "bob"]);
  });

  it("D2. filter by sales team: only carol", () => {
    const filtered = filterByDept(allStaff, "sales");
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe("carol");
  });

  it("D3. no team filter: all staff", () => {
    const filtered = filterByDept(allStaff, null);
    expect(filtered.length).toBe(4);
  });

  it("D4. unknown team: empty result", () => {
    const filtered = filterByDept(allStaff, "nonexistent");
    expect(filtered.length).toBe(0);
  });

  it("D5. empty team → round robin returns null", () => {
    const emptyDeptStaff = filterByDept(allStaff, "nonexistent");
    const winner = resolveByRoundRobin(emptyDeptStaff);
    expect(winner).toBeNull();
  });
});
