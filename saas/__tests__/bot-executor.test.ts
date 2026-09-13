/**
 * Bot Executor — Integration Tests
 *
 * Tests all 11 node types + concurrency + edge cases.
 * Prisma and external sends are mocked to isolate pure business logic.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const outgoingMessages: any[] = [];
const lockStore: Map<string, any> = new Map();
const executionStore: Map<string, any> = new Map();
const conversationStore: Map<string, any> = new Map();
const customerStore: Map<string, any> = new Map();
const flowStore: Map<string, any> = new Map();

function resetStores() {
  outgoingMessages.length = 0;
  lockStore.clear();
  executionStore.clear();
  conversationStore.clear();
  customerStore.clear();
  flowStore.clear();
}

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: {
      findFirst: vi.fn(({ where }: any) => {
        for (const [, c] of customerStore) {
          if (c.userId === where.userId && c.phone === where.phone) return Promise.resolve(c);
        }
        return Promise.resolve(null);
      }),
      findUnique: vi.fn(({ where }: any) => Promise.resolve(customerStore.get(where.id) || null)),
      update: vi.fn(({ where, data }: any) => {
        const existing = customerStore.get(where.id);
        if (existing) {
          const updated = { ...existing, ...data };
          customerStore.set(where.id, updated);
          return Promise.resolve(updated);
        }
        return Promise.resolve(null);
      }),
    },
    message: {
      create: vi.fn(() => Promise.resolve({ id: "msg-1" })),
    },
    teamMember: {
      findMany: vi.fn(() => Promise.resolve([])),
      update: vi.fn(() => Promise.resolve({})),
    },
    convBotLock: {
      create: vi.fn(({ data }: any) => {
        if (lockStore.has(data.conversationId)) throw new Error("UNIQUE_CONSTRAINT");
        lockStore.set(data.conversationId, data);
        return Promise.resolve(data);
      }),
      findUnique: vi.fn(({ where }: any) => Promise.resolve(lockStore.get(where.conversationId) || null)),
      update: vi.fn(({ where, data }: any) => {
        const existing = lockStore.get(where.conversationId);
        if (existing) lockStore.set(where.conversationId, { ...existing, ...data });
        return Promise.resolve({});
      }),
      delete: vi.fn(({ where }: any) => {
        lockStore.delete(where.conversationId);
        return Promise.resolve({});
      }),
    },
    convFlowExecution: {
      create: vi.fn(({ data }: any) => {
        executionStore.set(data.id, data);
        return Promise.resolve(data);
      }),
      findUnique: vi.fn(({ where }: any) => Promise.resolve(executionStore.get(where.id) || null)),
      update: vi.fn(({ where, data }: any) => {
        const existing = executionStore.get(where.id);
        if (existing) executionStore.set(where.id, { ...existing, ...data });
        return Promise.resolve({});
      }),
    },
    conversation: {
      findFirst: vi.fn(({ where }: any) => {
        for (const [, c] of conversationStore) {
          if (c.customerId === where.customerId) return Promise.resolve(c);
        }
        return Promise.resolve(null);
      }),
      findUnique: vi.fn(({ where }: any) => Promise.resolve(conversationStore.get(where.id) || null)),
      count: vi.fn(() => Promise.resolve(0)),
      updateMany: vi.fn(({ where, data }: any) => {
        for (const [id, c] of conversationStore) {
          if (c.customerId === where.customerId || c.id === where.id) {
            conversationStore.set(id, { ...c, ...data });
          }
        }
        return Promise.resolve({ count: 1 });
      }),
    },
    convFlow: {
      findMany: vi.fn(() => Promise.resolve([])),
      findUnique: vi.fn(({ where }: any) => Promise.resolve(flowStore.get(where.id) || null)),
      update: vi.fn(() => Promise.resolve({})),
    },
  },
}));

// The executor delivers through the canonical queue (`wa.send`), the same path
// the AI reply path uses — NOT through a Prisma model. An earlier version of
// this file mocked a `prisma.outgoingMessage` delegate that does not exist in
// the schema, so these tests stayed green while production silently discarded
// every bot message. Capture the real seam instead.
vi.mock("@/lib/wa", () => ({
  wa: {
    send: vi.fn((_userId: string, _to: string, content: string) => {
      outgoingMessages.push({ content });
      return Promise.resolve({ ok: true, status: 202, data: { queued: true } });
    }),
  },
}));

vi.mock("@/lib/sms/send", () => ({
  sendSmsFromTemplate: vi.fn(() => Promise.resolve({ ok: true })),
  sendSms: vi.fn(() => Promise.resolve({ ok: true })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { triggerBotFlow } from "@/lib/bot/executor";
import { prisma as mockPrisma } from "@/lib/db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeConversation(id: string, customerId: string, overrides: any = {}) {
  const conv = {
    id,
    customerId,
    botPaused: false,
    handoffState: null,
    activeFlowExecId: null,
    activeFlowId: null,
    queueState: "open",
    assignedStaffId: null,
    assignedTeam: null,
    ...overrides,
  };
  conversationStore.set(id, conv);
  return conv;
}

function makeCustomer(id: string, userId: string, phone: string, overrides: any = {}) {
  const customer = { id, userId, phone, tags: "[]", ...overrides };
  customerStore.set(id, customer);
  return customer;
}

function makeFlow(id: string, userId: string, nodes: any[], overrides: any = {}) {
  const flow = {
    id,
    userId,
    nodesJson: JSON.stringify(nodes),
    status: "active",
    trigger: "message_in",
    isDefault: true,
    triggerConfig: "{}",
    execCount: 0,
    completions: 0,
    ...overrides,
  };
  flowStore.set(id, flow);
  return flow;
}


// ─── TEST SUITES ──────────────────────────────────────────────────────────────

function setupFindMany() {
  (mockPrisma as any).convFlow.findMany.mockImplementation(({ where }: any) => {
    const result = Array.from(flowStore.values()).filter(
      (f: any) => f.userId === where.userId && f.status === where.status,
    );
    return Promise.resolve(result);
  });
}

describe("Bot Executor — Node Types", () => {
  beforeEach(() => {
    resetStores();
    vi.clearAllMocks();
    setupFindMany();
  });

  // ── NODE: start → message → end ──────────────────────────────────────────

  it("01. start → message → end: sends text and completes", async () => {
    const userId = "user-1";
    const customerId = "cust-1";
    makeCustomer(customerId, userId, "+966500000001");
    makeConversation("conv-1", customerId);
    makeFlow("flow-1", userId, [
      { id: "n-start", type: "start", data: {}, nextId: "n-msg" },
      { id: "n-msg", type: "message", data: { text: "مرحبا بك!" }, nextId: "n-end" },
      { id: "n-end", type: "end", data: {} },
    ]);

    const result = await triggerBotFlow({ userId, customerId, phone: "+966500000001", incomingMessage: "hi" });

    expect(result.triggered).toBe(true);
    expect(result.status).toBe("completed");
    expect(outgoingMessages.length).toBeGreaterThan(0);
    expect(outgoingMessages[0].content).toBe("مرحبا بك!");
  });

  // ── NODE: variable interpolation in message ────────────────────────────────

  it("02. message with variable interpolation ({{name}})", async () => {
    const userId = "user-2";
    const customerId = "cust-2";
    makeCustomer(customerId, userId, "+966500000002");
    makeConversation("conv-2", customerId);

    // question → stores var → message uses it
    makeFlow("flow-2", userId, [
      { id: "n-start", type: "start", data: {}, nextId: "n-q" },
      { id: "n-q", type: "question", data: { question: "ما اسمك؟", variableKey: "name" }, nextId: "n-greet" },
      { id: "n-greet", type: "message", data: { text: "أهلاً {{name}}!" }, nextId: "n-end" },
      { id: "n-end", type: "end", data: {} },
    ]);

    const r1 = await triggerBotFlow({ userId, customerId, phone: "+966500000002", incomingMessage: "hello" });
    expect(r1.status).toBe("waiting");

    // Now answer the question
    const r2 = await triggerBotFlow({ userId, customerId, phone: "+966500000002", incomingMessage: "أحمد" });
    expect(r2.triggered).toBe(true);
    const greetMsg = outgoingMessages.find((m) => m.content?.includes("أهلاً"));
    expect(greetMsg?.content).toBe("أهلاً أحمد!");
  });

  // ── NODE: buttons ─────────────────────────────────────────────────────────

  it("03. buttons: sends button list, waits for tap", async () => {
    const userId = "user-3";
    const customerId = "cust-3";
    makeCustomer(customerId, userId, "+966500000003");
    makeConversation("conv-3", customerId);
    makeFlow("flow-3", userId, [
      { id: "n-start", type: "start", data: {}, nextId: "n-btn" },
      {
        id: "n-btn",
        type: "buttons",
        data: { text: "اختر:", buttons: [{ label: "نعم" }, { label: "لا" }] },
        branches: [
          { label: "نعم", value: "نعم", nextId: "n-yes" },
          { label: "لا", value: "لا", nextId: "n-no" },
        ],
      },
      { id: "n-yes", type: "message", data: { text: "رائع!" }, nextId: "n-end" },
      { id: "n-no", type: "message", data: { text: "حسناً" }, nextId: "n-end" },
      { id: "n-end", type: "end", data: {} },
    ]);

    const r1 = await triggerBotFlow({ userId, customerId, phone: "+966500000003", incomingMessage: "start" });
    expect(r1.status).toBe("waiting");
    // Labels ride in the body: the queue carries plain text, and a `buttons`
    // node matches the reply with `b.label === userInput`, so the customer has
    // to be able to read and retype them.
    const btnMsg = outgoingMessages.find((m) => m.content?.includes("اختر:"));
    expect(btnMsg).toBeTruthy();
    expect(btnMsg.content).toContain("نعم");
    expect(btnMsg.content).toContain("لا");

    // Tap "نعم"
    const r2 = await triggerBotFlow({ userId, customerId, phone: "+966500000003", incomingMessage: "نعم", buttonValue: "نعم" });
    expect(r2.triggered).toBe(true);
    const yesMsg = outgoingMessages.find((m) => m.content === "رائع!");
    expect(yesMsg).toBeTruthy();
  });

  // ── NODE: condition — equals ──────────────────────────────────────────────

  it("04. condition equals: routes to correct branch", async () => {
    const userId = "user-4";
    const customerId = "cust-4";
    makeCustomer(customerId, userId, "+966500000004");
    makeConversation("conv-4", customerId);
    makeFlow("flow-4", userId, [
      { id: "n-start", type: "start", data: {}, nextId: "n-cond" },
      {
        id: "n-cond",
        type: "condition",
        data: { variable: "", operator: "contains", value: "order" },
        branches: [
          { label: "true", value: "true", nextId: "n-yes" },
          { label: "false", value: "false", nextId: "n-no" },
        ],
      },
      { id: "n-yes", type: "message", data: { text: "looking up order" }, nextId: "n-end" },
      { id: "n-no", type: "message", data: { text: "not an order" }, nextId: "n-end" },
      { id: "n-end", type: "end", data: {} },
    ]);

    const r = await triggerBotFlow({ userId, customerId, phone: "+966500000004", incomingMessage: "my order status?" });
    expect(r.triggered).toBe(true);
    expect(r.status).toBe("completed");
    const msg = outgoingMessages.find((m) => m.content === "looking up order");
    expect(msg).toBeTruthy();
  });

  // ── NODE: condition — false branch ────────────────────────────────────────

  it("05. condition false branch: routes correctly", async () => {
    const userId = "user-5";
    const customerId = "cust-5";
    makeCustomer(customerId, userId, "+966500000005");
    makeConversation("conv-5", customerId);
    makeFlow("flow-5", userId, [
      { id: "n-start", type: "start", data: {}, nextId: "n-cond" },
      {
        id: "n-cond",
        type: "condition",
        data: { variable: "", operator: "contains", value: "order" },
        branches: [
          { label: "true", value: "true", nextId: "n-yes" },
          { label: "false", value: "false", nextId: "n-no" },
        ],
      },
      { id: "n-yes", type: "message", data: { text: "order found" }, nextId: "n-end" },
      { id: "n-no", type: "message", data: { text: "general reply" }, nextId: "n-end" },
      { id: "n-end", type: "end", data: {} },
    ]);

    await triggerBotFlow({ userId, customerId, phone: "+966500000005", incomingMessage: "hello" });
    const msg = outgoingMessages.find((m) => m.content === "general reply");
    expect(msg).toBeTruthy();
  });

  // ── NODE: assign — manual ─────────────────────────────────────────────────

  it("06. assign (manual): sets assignedStaffId on conversation", async () => {
    const userId = "user-6";
    const customerId = "cust-6";
    makeCustomer(customerId, userId, "+966500000006");
    makeConversation("conv-6", customerId);
    makeFlow("flow-6", userId, [
      { id: "n-start", type: "start", data: {}, nextId: "n-assign" },
      { id: "n-assign", type: "assign", data: { staffId: "staff-abc", strategy: "manual" }, nextId: "n-end" },
      { id: "n-end", type: "end", data: {} },
    ]);

    const result = await triggerBotFlow({ userId, customerId, phone: "+966500000006", incomingMessage: "help" });
    expect(result.triggered).toBe(true);

    const updatedConv = conversationStore.get("conv-6");
    expect(updatedConv?.assignedStaffId).toBe("staff-abc");
    expect(updatedConv?.queueState).toBe("assigned");
  });

  // ── NODE: handoff ─────────────────────────────────────────────────────────

  it("07. handoff: sets botPaused=true and handoffState=human_required", async () => {
    const userId = "user-7";
    const customerId = "cust-7";
    makeCustomer(customerId, userId, "+966500000007");
    makeConversation("conv-7", customerId);
    makeFlow("flow-7", userId, [
      { id: "n-start", type: "start", data: {}, nextId: "n-ho" },
      { id: "n-ho", type: "handoff", data: { reason: "يحتاج خدمة عميل" } },
    ]);

    const result = await triggerBotFlow({ userId, customerId, phone: "+966500000007", incomingMessage: "urgent" });
    expect(result.triggered).toBe(true);

    const updatedConv = conversationStore.get("conv-7");
    expect(updatedConv?.botPaused).toBe(true);
    expect(updatedConv?.handoffState).toBe("human_required");
    expect(updatedConv?.activeFlowExecId).toBeNull();
  });

  // ── NODE: delay ───────────────────────────────────────────────────────────

  it("08. delay (≤0.01s): pauses briefly then continues", async () => {
    const userId = "user-8";
    const customerId = "cust-8";
    makeCustomer(customerId, userId, "+966500000008");
    makeConversation("conv-8", customerId);
    makeFlow("flow-8", userId, [
      { id: "n-start", type: "start", data: {}, nextId: "n-delay" },
      { id: "n-delay", type: "delay", data: { seconds: 0 }, nextId: "n-msg" },
      { id: "n-msg", type: "message", data: { text: "after delay" }, nextId: "n-end" },
      { id: "n-end", type: "end", data: {} },
    ]);

    const result = await triggerBotFlow({ userId, customerId, phone: "+966500000008", incomingMessage: "go" });
    expect(result.triggered).toBe(true);
    expect(result.status).toBe("completed");
    const msg = outgoingMessages.find((m) => m.content === "after delay");
    expect(msg).toBeTruthy();
  });

  // ── NODE: tag ─────────────────────────────────────────────────────────────

  it("09. tag: appends tag to customer.tags JSON", async () => {
    const userId = "user-9";
    const customerId = "cust-9";
    makeCustomer(customerId, userId, "+966500000009");
    makeConversation("conv-9", customerId);
    makeFlow("flow-9", userId, [
      { id: "n-start", type: "start", data: {}, nextId: "n-tag" },
      { id: "n-tag", type: "tag", data: { tag: "vip" }, nextId: "n-end" },
      { id: "n-end", type: "end", data: {} },
    ]);

    await triggerBotFlow({ userId, customerId, phone: "+966500000009", incomingMessage: "hi" });
    const updatedCustomer = customerStore.get(customerId);
    const tags = JSON.parse(updatedCustomer?.tags || "[]");
    expect(tags).toContain("vip");
  });

  // ── NODE: sms via sendSms (body) ──────────────────────────────────────────

  it("10. sms node: calls sendSms with body field (not message)", async () => {
    const userId = "user-10";
    const customerId = "cust-10";
    makeCustomer(customerId, userId, "+966500000010");
    makeConversation("conv-10", customerId);
    makeFlow("flow-10", userId, [
      { id: "n-start", type: "start", data: {}, nextId: "n-sms" },
      { id: "n-sms", type: "sms", data: { message: "رمز التحقق {{otp}}" }, nextId: "n-end" },
      { id: "n-end", type: "end", data: {} },
    ]);

    const { sendSms } = await import("@/lib/sms/send");

    await triggerBotFlow({ userId, customerId, phone: "+966500000010", incomingMessage: "send otp" });

    expect(sendSms).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.any(String) }),
    );
  });

  // ── NODE: end with message ────────────────────────────────────────────────

  it("11. end node with message: sends final text", async () => {
    const userId = "user-11";
    const customerId = "cust-11";
    makeCustomer(customerId, userId, "+966500000011");
    makeConversation("conv-11", customerId);
    makeFlow("flow-11", userId, [
      { id: "n-start", type: "start", data: {}, nextId: "n-end" },
      { id: "n-end", type: "end", data: { message: "شكراً لتواصلك" } },
    ]);

    const result = await triggerBotFlow({ userId, customerId, phone: "+966500000011", incomingMessage: "bye" });
    expect(result.triggered).toBe(true);
    expect(result.status).toBe("completed");
    const endMsg = outgoingMessages.find((m) => m.content === "شكراً لتواصلك");
    expect(endMsg).toBeTruthy();
  });
});

describe("Bot Executor — Edge Cases", () => {
  beforeEach(() => {
    resetStores();
    vi.clearAllMocks();
    setupFindMany();
  });

  it("E1. bot paused: returns triggered=false", async () => {
    const userId = "u-e1";
    const customerId = "c-e1";
    makeCustomer(customerId, userId, "+1");
    makeConversation("cv-e1", customerId, { botPaused: true });

    const result = await triggerBotFlow({ userId, customerId, phone: "+1", incomingMessage: "hi" });
    expect(result.triggered).toBe(false);
    expect(result.reason).toBe("bot_paused");
  });

  it("E2. human_active handoff: returns triggered=false", async () => {
    const userId = "u-e2";
    const customerId = "c-e2";
    makeCustomer(customerId, userId, "+2");
    makeConversation("cv-e2", customerId, { handoffState: "human_active" });

    const result = await triggerBotFlow({ userId, customerId, phone: "+2", incomingMessage: "hi" });
    expect(result.triggered).toBe(false);
    expect(result.reason).toBe("human_active");
  });

  it("E3. no matching flow: returns no_matching_flow", async () => {
    const userId = "u-e3";
    const customerId = "c-e3";
    makeCustomer(customerId, userId, "+3");
    makeConversation("cv-e3", customerId);
    // No flows in store

    const result = await triggerBotFlow({ userId, customerId, phone: "+3", incomingMessage: "hello" });
    expect(result.triggered).toBe(false);
    expect(result.reason).toBe("no_matching_flow");
  });

  it("E4. no conversation: returns no_conversation", async () => {
    const result = await triggerBotFlow({
      userId: "u-e4",
      customerId: "nonexistent",
      phone: "+4",
      incomingMessage: "hi",
    });
    expect(result.triggered).toBe(false);
    expect(result.reason).toBe("no_conversation");
  });

  it("E5. missing next node: completes gracefully without crash", async () => {
    const userId = "u-e5";
    const customerId = "c-e5";
    makeCustomer(customerId, userId, "+5");
    makeConversation("cv-e5", customerId);
    makeFlow("flow-e5", userId, [
      { id: "n-start", type: "start", data: {}, nextId: "n-msg" },
      { id: "n-msg", type: "message", data: { text: "hello" }, nextId: "MISSING_NODE_ID" },
      // nextId points to non-existent node
    ]);

    const result = await triggerBotFlow({ userId, customerId, phone: "+5", incomingMessage: "go" });
    expect(result.triggered).toBe(true);
    // Completes gracefully (returns done: true when next node not found)
    expect(result.status).toBe("completed");
  });

  it("E6. MAX_DEPTH guard: stops at 50 levels deep without infinite loop", async () => {
    const userId = "u-e6";
    const customerId = "c-e6";
    makeCustomer(customerId, userId, "+6");
    makeConversation("cv-e6", customerId);

    // Build a chain of 60 message nodes — should stop at depth 50
    const nodes: any[] = [{ id: "n-start", type: "start", data: {}, nextId: "n-0" }];
    for (let i = 0; i < 60; i++) {
      nodes.push({
        id: `n-${i}`,
        type: "message",
        data: { text: `msg-${i}` },
        nextId: i < 59 ? `n-${i + 1}` : undefined,
      });
    }
    makeFlow("flow-e6", userId, nodes);

    const result = await triggerBotFlow({ userId, customerId, phone: "+6", incomingMessage: "go" });
    expect(result.triggered).toBe(true);
    // Must not crash or loop forever; should complete within test timeout
  });

  it("E7. concurrent lock: second trigger rejected while first holds lock", async () => {
    const userId = "u-e7";
    const customerId = "c-e7";
    makeCustomer(customerId, userId, "+7");
    makeConversation("cv-e7", customerId);
    makeFlow("flow-e7", userId, [
      { id: "n-start", type: "start", data: {}, nextId: "n-end" },
      { id: "n-end", type: "end", data: {} },
    ]);

    // Manually pre-lock the conversation with future expiry
    lockStore.set("cv-e7", {
      conversationId: "cv-e7",
      execId: "already-locked",
      lockedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await triggerBotFlow({ userId, customerId, phone: "+7", incomingMessage: "hi" });
    expect(result.triggered).toBe(false);
    expect(result.reason).toBe("locked");
  });

  it("E8. expired lock stolen: execution proceeds after TTL", async () => {
    const userId = "u-e8";
    const customerId = "c-e8";
    makeCustomer(customerId, userId, "+8");
    makeConversation("cv-e8", customerId);
    makeFlow("flow-e8", userId, [
      { id: "n-start", type: "start", data: {}, nextId: "n-end" },
      { id: "n-end", type: "end", data: {} },
    ]);

    // Lock that is already expired
    lockStore.set("cv-e8", {
      conversationId: "cv-e8",
      execId: "stale-lock",
      lockedAt: new Date(Date.now() - 120_000),
      expiresAt: new Date(Date.now() - 60_000), // expired
    });

    const result = await triggerBotFlow({ userId, customerId, phone: "+8", incomingMessage: "hi" });
    expect(result.triggered).toBe(true);
    expect(result.status).toBe("completed");
  });

  it("E9. keyword trigger: matches keyword flow over default", async () => {
    const userId = "u-e9";
    const customerId = "c-e9";
    makeCustomer(customerId, userId, "+9");
    makeConversation("cv-e9", customerId);

    // Default flow
    makeFlow("flow-default", userId, [
      { id: "n-start", type: "start", data: {}, nextId: "n-end" },
      { id: "n-end", type: "end", data: { message: "default reply" } },
    ], { isDefault: true, trigger: "message_in" });

    // Keyword flow for "طلب"
    makeFlow("flow-order", userId, [
      { id: "n-start", type: "start", data: {}, nextId: "n-end" },
      { id: "n-end", type: "end", data: { message: "order flow triggered" } },
    ], { isDefault: false, trigger: "keyword", triggerConfig: JSON.stringify({ keywords: ["طلب", "order"] }) });

    await triggerBotFlow({ userId, customerId, phone: "+9", incomingMessage: "أريد تتبع طلب" });
    const orderMsg = outgoingMessages.find((m) => m.content === "order flow triggered");
    expect(orderMsg).toBeTruthy();
  });

  it("E10. empty flow (no nodes): returns empty_flow", async () => {
    const userId = "u-e10";
    const customerId = "c-e10";
    makeCustomer(customerId, userId, "+10");
    makeConversation("cv-e10", customerId);
    makeFlow("flow-e10", userId, []); // empty nodes

    const result = await triggerBotFlow({ userId, customerId, phone: "+10", incomingMessage: "hi" });
    expect(result.triggered).toBe(false);
    expect(result.reason).toBe("empty_flow");
  });

  it("E11. no start node: returns no_start_node", async () => {
    const userId = "u-e11";
    const customerId = "c-e11";
    makeCustomer(customerId, userId, "+11");
    makeConversation("cv-e11", customerId);
    makeFlow("flow-e11", userId, [
      { id: "n-msg", type: "message", data: { text: "hello" } },
      // No start node
    ]);

    const result = await triggerBotFlow({ userId, customerId, phone: "+11", incomingMessage: "hi" });
    expect(result.triggered).toBe(false);
    expect(result.reason).toBe("no_start_node");
  });
});
