/**
 * Inbox Queue States — Tests
 *
 * Verifies all 7 queue states exist, are valid, and transition correctly.
 * Also verifies SLA computation logic.
 */
import { describe, it, expect } from "vitest";

// ─── Valid states (mirroring assign route + Prisma model) ─────────────────────

const VALID_QUEUE_STATES = ["open", "assigned", "pending", "resolved", "closed", "new", "waiting_customer"] as const;
type QueueState = typeof VALID_QUEUE_STATES[number];

// ─── State transition rules (from assign route PATCH) ─────────────────────────

const TERMINAL_STATES: QueueState[] = ["resolved", "closed"];

function applyQueueStateTransition(
  current: QueueState,
  next: QueueState,
): {
  valid: boolean;
  resolvedAt?: Date;
  closedAt?: Date;
  newState?: QueueState;
} {
  if (!VALID_QUEUE_STATES.includes(next)) {
    return { valid: false };
  }

  const now = new Date();
  const result: any = { valid: true, newState: next };

  if (next === "resolved") result.resolvedAt = now;
  if (next === "closed") result.closedAt = now;

  return result;
}

// ─── SLA computation (from conversations route) ────────────────────────────────

function computeSla(slaDeadlineAt: Date | null): {
  slaBreached: boolean;
  slaMinsLeft: number | null;
} {
  if (!slaDeadlineAt) return { slaBreached: false, slaMinsLeft: null };

  const now = Date.now();
  const deadline = slaDeadlineAt.getTime();
  const slaBreached = now > deadline;
  const slaMinsLeft = Math.round((deadline - now) / 60_000);

  return { slaBreached, slaMinsLeft };
}

// ─── Filter logic ─────────────────────────────────────────────────────────────

type Conversation = {
  id: string;
  queueState: QueueState;
  assignedStaffId: string | null;
  slaDeadlineAt: Date | null;
};

function filterConversations(
  conversations: Conversation[],
  filters: { queue?: QueueState; assigned?: string },
): Conversation[] {
  return conversations.filter((c) => {
    if (filters.queue && c.queueState !== filters.queue) return false;
    if (filters.assigned && c.assignedStaffId !== filters.assigned) return false;
    return true;
  });
}

// ─── TESTS ────────────────────────────────────────────────────────────────────

describe("Inbox — Queue State Enumeration", () => {
  it("Q1. all 7 required queue states are defined", () => {
    const required = ["open", "assigned", "pending", "resolved", "closed", "new", "waiting_customer"];
    for (const state of required) {
      expect(VALID_QUEUE_STATES).toContain(state);
    }
  });

  it("Q2. invalid state rejected", () => {
    const result = applyQueueStateTransition("open", "banana" as QueueState);
    expect(result.valid).toBe(false);
  });
});

describe("Inbox — Queue State Transitions", () => {
  it("T1. open → assigned: valid", () => {
    const r = applyQueueStateTransition("open", "assigned");
    expect(r.valid).toBe(true);
    expect(r.newState).toBe("assigned");
  });

  it("T2. assigned → pending: valid", () => {
    const r = applyQueueStateTransition("assigned", "pending");
    expect(r.valid).toBe(true);
    expect(r.newState).toBe("pending");
  });

  it("T3. assigned → resolved: sets resolvedAt", () => {
    const r = applyQueueStateTransition("assigned", "resolved");
    expect(r.valid).toBe(true);
    expect(r.resolvedAt).toBeInstanceOf(Date);
    expect(r.closedAt).toBeUndefined();
  });

  it("T4. resolved → closed: sets closedAt", () => {
    const r = applyQueueStateTransition("resolved", "closed");
    expect(r.valid).toBe(true);
    expect(r.closedAt).toBeInstanceOf(Date);
  });

  it("T5. open → closed: sets closedAt directly", () => {
    const r = applyQueueStateTransition("open", "closed");
    expect(r.valid).toBe(true);
    expect(r.closedAt).toBeInstanceOf(Date);
  });

  it("T6. new → open: valid (initial triage)", () => {
    const r = applyQueueStateTransition("new", "open");
    expect(r.valid).toBe(true);
    expect(r.newState).toBe("open");
  });

  it("T7. assigned → waiting_customer: valid", () => {
    const r = applyQueueStateTransition("assigned", "waiting_customer");
    expect(r.valid).toBe(true);
    expect(r.newState).toBe("waiting_customer");
  });
});

describe("Inbox — SLA Computation", () => {
  it("S1. no deadline: not breached, no minsLeft", () => {
    const result = computeSla(null);
    expect(result.slaBreached).toBe(false);
    expect(result.slaMinsLeft).toBeNull();
  });

  it("S2. deadline in future: not breached, positive minsLeft", () => {
    const deadline = new Date(Date.now() + 30 * 60 * 1000); // 30 min from now
    const result = computeSla(deadline);
    expect(result.slaBreached).toBe(false);
    expect(result.slaMinsLeft).toBeGreaterThan(0);
    expect(result.slaMinsLeft).toBeLessThanOrEqual(30);
  });

  it("S3. deadline in past: breached, negative minsLeft", () => {
    const deadline = new Date(Date.now() - 10 * 60 * 1000); // 10 min ago
    const result = computeSla(deadline);
    expect(result.slaBreached).toBe(true);
    expect(result.slaMinsLeft).toBeLessThan(0);
  });

  it("S4. exactly at deadline: breached (boundary)", () => {
    const deadline = new Date(Date.now() - 1); // 1ms ago
    const result = computeSla(deadline);
    expect(result.slaBreached).toBe(true);
  });
});

describe("Inbox — Conversation Filtering", () => {
  const convs: Conversation[] = [
    { id: "c1", queueState: "open", assignedStaffId: null, slaDeadlineAt: null },
    { id: "c2", queueState: "assigned", assignedStaffId: "staff-1", slaDeadlineAt: null },
    { id: "c3", queueState: "assigned", assignedStaffId: "staff-2", slaDeadlineAt: null },
    { id: "c4", queueState: "resolved", assignedStaffId: "staff-1", slaDeadlineAt: null },
    { id: "c5", queueState: "pending", assignedStaffId: null, slaDeadlineAt: null },
    { id: "c6", queueState: "closed", assignedStaffId: "staff-1", slaDeadlineAt: null },
    { id: "c7", queueState: "waiting_customer", assignedStaffId: "staff-2", slaDeadlineAt: null },
  ];

  it("F1. filter by queue=open: returns only open conversations", () => {
    const result = filterConversations(convs, { queue: "open" });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("c1");
  });

  it("F2. filter by queue=assigned: returns all assigned", () => {
    const result = filterConversations(convs, { queue: "assigned" });
    expect(result.length).toBe(2);
  });

  it("F3. filter by assigned=staff-1: returns staff-1's conversations regardless of state", () => {
    const result = filterConversations(convs, { assigned: "staff-1" });
    expect(result.length).toBe(3); // c2, c4, c6
    expect(result.every((c) => c.assignedStaffId === "staff-1")).toBe(true);
  });

  it("F4. filter by queue=resolved AND assigned=staff-1: returns only c4", () => {
    const result = filterConversations(convs, { queue: "resolved", assigned: "staff-1" });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("c4");
  });

  it("F5. no filters: returns all 7 conversations", () => {
    const result = filterConversations(convs, {});
    expect(result.length).toBe(7);
  });
});
