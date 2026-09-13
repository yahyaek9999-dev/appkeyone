/**
 * Production runs WA_SMART_QUEUE_ENABLED=0.
 *
 * In that mode `wa.send` skips the queue entirely and calls `sendNow`, so
 * there is no WaMessage row and no queued id. An earlier version of the Bot
 * Builder fix keyed the assistant message to that id unconditionally, so
 * production would have recorded nothing in the inbox — every other test ran
 * with the queue ON (the default) and missed it.
 *
 * Asserts real database behaviour and must not be skipped silently.
 */
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

const DB_URL =
  process.env.TEST_POSTGRES_URL ||
  "postgresql://localhost:5432/keyone_multiteam_test";
if (!/_test(\?|$)/.test(DB_URL)) {
  throw new Error(`refusing to run DB tests against a non-_test database: ${DB_URL}`);
}

process.env.POSTGRES_URL = DB_URL;
// Pin production's configuration BEFORE wa.ts is loaded — it reads this into a
// module-level const, so setting it inside a test would be too late.
process.env.WA_SMART_QUEUE_ENABLED = "0";
process.env.BRIDGE_ENABLED = "1";
process.env.SAAS_INTERNAL_SECRET = process.env.SAAS_INTERNAL_SECRET || "test-internal-secret";

const db = new PrismaClient({ datasources: { db: { url: DB_URL } } }) as any;
const TAG = `qoff-${process.pid}-${process.hrtime.bigint().toString(36)}`;

let reachable = true;
let triggerBotFlow: (ctx: any) => Promise<any>;

function requireDb() {
  if (!reachable) {
    throw new Error(
      `PostgreSQL not reachable at ${DB_URL} — these tests assert real DB behaviour ` +
        `and must not be skipped silently. Note the URL needs a username.`,
    );
  }
}

async function makeTenant(mode: string, text: string) {
  const user = await db.user.create({
    data: { email: `${TAG}-${mode}-${Math.random().toString(36).slice(2, 8)}@example.test`, passwordHash: "x", name: "Q" },
  });
  await db.bot.create({ data: { userId: user.id, connectionMode: mode } });
  const customer = await db.customer.create({
    data: { userId: user.id, phone: `+1555${Math.floor(Math.random() * 9_000_000 + 1_000_000)}`, name: "C" },
  });
  await db.conversation.create({ data: { customerId: customer.id } });
  await db.convFlow.create({
    data: {
      userId: user.id, name: "Q", trigger: "message_in", isDefault: true, status: "active",
      nodesJson: JSON.stringify([
        { id: "n1", type: "start", nextId: "n2" },
        { id: "n2", type: "message", data: { text } },
      ]),
    },
  });
  return { user, customer };
}

async function assistantRows(customerId: string) {
  const conv = await db.conversation.findUnique({ where: { customerId }, select: { id: true } });
  return db.message.findMany({
    where: { conversationId: conv.id, role: "assistant" },
    select: { content: true, metadataJson: true },
  });
}

/** Runs the flow with the transport stubbed out at the network boundary. */
async function runFlow(t: { user: any; customer: any }) {
  const realFetch = globalThis.fetch;
  const calls: string[] = [];
  (globalThis as any).fetch = async (url: any) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  };
  try {
    await triggerBotFlow({
      userId: t.user.id, customerId: t.customer.id,
      phone: t.customer.phone, incomingMessage: "hi",
    });
  } finally {
    (globalThis as any).fetch = realFetch;
  }
  return calls;
}

beforeAll(async () => {
  try { await db.$queryRawUnsafe("select 1"); } catch { reachable = false; return; }
  ({ triggerBotFlow } = await import("@/lib/bot/executor"));
});

afterAll(async () => {
  if (reachable) await db.user.deleteMany({ where: { email: { contains: TAG } } }).catch(() => {});
  await db.$disconnect().catch(() => {});
});

describe("Bot Builder with the smart queue disabled (production's setting)", () => {
  test("the queue really is bypassed — no WaMessage row is written", async () => {
    requireDb();
    const t = await makeTenant("bridge", "بدون طابور");
    await runFlow(t);
    expect(await db.waMessage.findMany({ where: { userId: t.user.id } })).toHaveLength(0);
  });

  test("the reply still reaches the inbox exactly once", async () => {
    requireDb();
    const t = await makeTenant("bridge", "يظهر في المحادثة");
    await runFlow(t);

    const rows = await assistantRows(t.customer.id);
    expect(rows, "the bot reply never reached the inbox").toHaveLength(1);
    expect(rows[0].content).toContain("يظهر في المحادثة");
  });

  test("a bridge tenant still routes to the Bridge gateway, not the QR session", async () => {
    requireDb();
    const t = await makeTenant("bridge", "عبر البريدج بدون طابور");
    const calls = await runFlow(t);
    expect(calls.some((u) => u.includes("/internal/outbound"))).toBe(true);
    expect(calls.some((u) => /\/sessions\/.*\/send/.test(u))).toBe(false);
  });

  test("a QR tenant still routes to the QR session, never to the Bridge", async () => {
    requireDb();
    const t = await makeTenant("qr", "عبر الكيو ار بدون طابور");
    const calls = await runFlow(t);
    expect(calls.some((u) => /\/sessions\/.*\/send/.test(u))).toBe(true);
    expect(calls.some((u) => u.includes("/internal/outbound"))).toBe(false);
  });

  test("a failed send records nothing — no inbox row claiming the customer was answered", async () => {
    requireDb();
    const t = await makeTenant("bridge", "فشل الإرسال");
    const realFetch = globalThis.fetch;
    (globalThis as any).fetch = async () =>
      new Response(JSON.stringify({ error: "no_bridge_online" }), {
        status: 503, headers: { "content-type": "application/json" },
      });
    try {
      await triggerBotFlow({
        userId: t.user.id, customerId: t.customer.id,
        phone: t.customer.phone, incomingMessage: "hi",
      });
    } finally {
      (globalThis as any).fetch = realFetch;
    }
    expect(await assistantRows(t.customer.id)).toHaveLength(0);
  });
});
