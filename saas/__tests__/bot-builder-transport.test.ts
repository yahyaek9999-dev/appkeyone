/**
 * Bot Builder must deliver through the canonical outbound queue.
 *
 * The Bot Builder failure on a working Bridge tenant was NOT a Bridge problem.
 * `sendBotMessage()` wrote to `prisma.outgoingMessage` — a model that does not
 * exist in the schema. `prisma.outgoingMessage` is `undefined`, so `.create()`
 * threw a *synchronous* TypeError; the `.catch()` chained onto it was never
 * attached (there was no promise to attach it to), which made the fallback
 * dead code, and the surrounding `try/catch` swallowed the throw. Every
 * message a flow produced was discarded in silence, on every transport.
 *
 * The canonical path — the one normal chat already uses, and which routes to
 * Bridge/QR/Meta — is `wa.send()` -> `enqueueOutboundText()` -> `WaMessage` ->
 * `drainOutgoingQueue()` -> `wa.sendNow()` -> `maybeRouteBridgeSend()`.
 *
 * These tests assert real database behaviour and must not be skipped silently.
 */
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

const DB_URL =
  process.env.TEST_POSTGRES_URL ||
  "postgresql://localhost:5432/keyone_multiteam_test";

if (!/_test(\?|$)/.test(DB_URL)) {
  throw new Error(`refusing to run DB tests against a non-_test database: ${DB_URL}`);
}

// The executor imports the app's prisma singleton, which reads POSTGRES_URL.
// Point it at the scratch database before that module is ever loaded.
process.env.POSTGRES_URL = DB_URL;

// BRIDGE_ENABLED and SAAS_INTERNAL_SECRET are read into module-level consts at
// import time, so they have to be set here — setting them inside a test is too
// late and the bridge path bails at the secret check before it ever dispatches.
process.env.BRIDGE_ENABLED = "1";
process.env.SAAS_INTERNAL_SECRET = process.env.SAAS_INTERNAL_SECRET || "test-internal-secret";

const db = new PrismaClient({ datasources: { db: { url: DB_URL } } }) as any;

const TAG = `botx-${process.pid}-${process.hrtime.bigint().toString(36)}`;
const email = (s: string) => `${TAG}-${s}@example.test`;

let reachable = true;
let triggerBotFlow: (ctx: any) => Promise<any>;

/** Fails loudly rather than passing green on a missing database. */
function requireDb() {
  if (!reachable) {
    throw new Error(
      `PostgreSQL not reachable at ${DB_URL} — these tests assert real DB behaviour ` +
        `and must not be skipped silently. Note the URL needs a username.`,
    );
  }
}

/** A tenant with one customer, one conversation and one active flow. */
async function makeTenant(opts: { mode: string; text: string; buttons?: string[] }) {
  const user = await db.user.create({
    data: {
      email: email(`${opts.mode}-${Math.random().toString(36).slice(2, 8)}`),
      passwordHash: "x",
      name: "Bot",
    },
  });
  await db.bot.create({ data: { userId: user.id, connectionMode: opts.mode } });

  const customer = await db.customer.create({
    data: {
      userId: user.id,
      phone: `+1555${Math.floor(Math.random() * 9_000_000 + 1_000_000)}`,
      name: "Cust",
    },
  });
  // Conversation has no userId — customerId is the (unique) owner key.
  const conv = await db.conversation.create({ data: { customerId: customer.id } });

  const nodes = opts.buttons
    ? [
        { id: "n1", type: "start", nextId: "n2" },
        { id: "n2", type: "buttons", data: { text: opts.text, buttons: opts.buttons }, branches: [] },
      ]
    : [
        { id: "n1", type: "start", nextId: "n2" },
        { id: "n2", type: "message", data: { text: opts.text } },
      ];

  await db.convFlow.create({
    data: {
      userId: user.id,
      name: "T",
      trigger: "message_in",
      // a message_in flow is only the catch-all when it is the default one
      isDefault: true,
      status: "active",
      nodesJson: JSON.stringify(nodes),
    },
  });

  return { user, customer, conv };
}

/** Outbound rows the canonical queue hands to the transport router. */
async function queuedFor(userId: string) {
  return db.waMessage.findMany({ where: { userId }, select: { body: true, status: true } });
}

beforeAll(async () => {
  try {
    await db.$queryRawUnsafe("select 1");
  } catch {
    reachable = false;
    return;
  }
  ({ triggerBotFlow } = await import("@/lib/bot/executor"));
});

afterAll(async () => {
  if (reachable) {
    await db.user.deleteMany({ where: { email: { contains: TAG } } }).catch(() => {});
  }
  await db.$disconnect().catch(() => {});
});

describe("Bot Builder outbound delivery", () => {
  test("the model the old sender wrote to does not exist", () => {
    requireDb();
    // Documents the defect: the delegate is undefined, so the call threw
    // synchronously and the chained .catch() fallback was unreachable.
    expect((db as any).outgoingMessage).toBeUndefined();
    expect((db as any).waMessage).toBeDefined();
  });

  test("a message node queues real outbound work for a BRIDGE tenant", async () => {
    requireDb();
    const { user, customer } = await makeTenant({ mode: "bridge", text: "مرحبا من البوت" });

    const res = await triggerBotFlow({
      userId: user.id,
      customerId: customer.id,
      phone: customer.phone,
      incomingMessage: "hello",
    });

    expect(res.triggered, `not triggered: ${res.reason}`).toBe(true);
    const queued = await queuedFor(user.id);
    expect(queued.length).toBe(1);
    expect(queued[0].body).toContain("مرحبا من البوت");
  });

  test("a message node queues real outbound work for a QR tenant (no regression)", async () => {
    requireDb();
    const { user, customer } = await makeTenant({ mode: "qr", text: "hello from qr bot" });

    const res = await triggerBotFlow({
      userId: user.id,
      customerId: customer.id,
      phone: customer.phone,
      incomingMessage: "hello",
    });

    expect(res.triggered, `not triggered: ${res.reason}`).toBe(true);
    const queued = await queuedFor(user.id);
    expect(queued.length).toBe(1);
    expect(queued[0].body).toContain("hello from qr bot");
  });

  test("button labels reach the customer, who must reply with the exact label", async () => {
    requireDb();
    const { user, customer } = await makeTenant({
      mode: "bridge",
      text: "اختر",
      buttons: ["نعم", "لا"],
    });

    await triggerBotFlow({
      userId: user.id,
      customerId: customer.id,
      phone: customer.phone,
      incomingMessage: "hi",
    });

    const queued = await queuedFor(user.id);
    expect(queued.length).toBe(1);
    // The buttons node matches a reply against `b.label`, so a customer who
    // never sees the labels can never select a branch.
    expect(queued[0].body).toContain("نعم");
    expect(queued[0].body).toContain("لا");
  });

  test("the executor no longer references a non-existent Prisma model", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(process.cwd(), "lib/bot/executor.ts"), "utf8");
    expect(src).not.toMatch(/prisma\s+as\s+any\)\.outgoingMessage/);
    expect(src).toMatch(/enqueueOutboundText|wa\.send/);
  });
});

describe("Bot Builder reaches the right transport", () => {
  /**
   * Runs the flow with `fetch` captured, and reports which transport the
   * resolver picked. `wa.send` enqueues and then kicks off its own drain
   * (fire-and-forget), so the dispatch happens during/just after the trigger —
   * not in a drain we call ourselves. Poll the row until it leaves "queued"
   * rather than guessing at a timing window.
   */
  async function runFlowAndCaptureTransport(t: { user: any; customer: any }) {
    const realFetch = globalThis.fetch;
    const calls: string[] = [];
    (globalThis as any).fetch = async (url: any) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    try {
      await triggerBotFlow({
        userId: t.user.id,
        customerId: t.customer.id,
        phone: t.customer.phone,
        incomingMessage: "hello",
      });
      // `wa.send` kicks off its own drain, but the queue's pacing clock is
      // module-global and other test files advance it, so that drain may defer
      // the row. Drain again with a far-future `now` to defeat pacing. Both
      // orderings are inside the capture window, so exactly one of them
      // dispatches and the assertions below hold either way.
      const { drainOutgoingQueue } = await import("@/lib/messaging/outgoing-queue");
      await drainOutgoingQueue({
        userId: t.user.id,
        batchSize: 5,
        perUserLimit: 5,
        now: new Date(Date.now() + 7 * 24 * 3_600_000),
      }).catch(() => {});
    } finally {
      (globalThis as any).fetch = realFetch;
    }
    return { calls };
  }

  test("a BRIDGE tenant's bot reply is delivered through the Bridge gateway", async () => {
    requireDb();
    const t = await makeTenant({ mode: "bridge", text: "رد البوت عبر البريدج" });

    const { calls } = await runFlowAndCaptureTransport(t);
    expect(calls.length, "nothing was dispatched at all").toBeGreaterThan(0);
    expect(calls.some((u) => u.includes("/internal/outbound"))).toBe(true);
    // Must not silently fall back to the QR gateway for a bridge tenant.
    expect(calls.some((u) => /\/sessions\/.*\/send/.test(u))).toBe(false);
  });

  test("a QR tenant's bot reply still goes out over the QR gateway (no regression)", async () => {
    requireDb();
    const t = await makeTenant({ mode: "qr", text: "qr bot reply" });

    const { calls } = await runFlowAndCaptureTransport(t);
    expect(calls.length, "nothing was dispatched at all").toBeGreaterThan(0);
    // A QR tenant must never be handed to the Bridge gateway.
    expect(calls.some((u) => u.includes("/internal/outbound"))).toBe(false);
    expect(calls.some((u) => /\/sessions\/.*\/send/.test(u))).toBe(true);
  });
});
