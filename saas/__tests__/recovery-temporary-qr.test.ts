/**
 * Recovery on a temporary QR session — the Bridge tenant's only door to Import.
 *
 * The product contract these tests hold to the fire:
 *   Import stays QR-only; a Bridge tenant gets a session only inside Recovery;
 *   that session never becomes a normal connection; the tenant never leaves
 *   Bridge; and every terminal state tears the session down.
 *
 * Asserts real database behaviour and must not be skipped silently.
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

const DB_URL =
  process.env.TEST_POSTGRES_URL ||
  "postgresql://localhost:5432/keyone_multiteam_test";
if (!/_test(\?|$)/.test(DB_URL)) {
  throw new Error(`refusing to run DB tests against a non-_test database: ${DB_URL}`);
}
process.env.POSTGRES_URL = DB_URL;
process.env.BRIDGE_ENABLED = "1";

const db = new PrismaClient({ datasources: { db: { url: DB_URL } } }) as any;
const TAG = `rec-${process.pid}-${process.hrtime.bigint().toString(36)}`;

/** Every wa call the recovery path can make, captured. */
const waCalls: Array<{ fn: string; args: any[] }> = [];
let statusQueue: any[] = [];

vi.mock("@/lib/wa", () => ({
  wa: {
    start: vi.fn((...args: any[]) => {
      waCalls.push({ fn: "start", args });
      return Promise.resolve({ ok: true, status: 200, data: { ok: true, status: "connecting" } });
    }),
    status: vi.fn((...args: any[]) => {
      waCalls.push({ fn: "status", args });
      const next = statusQueue.shift() || { status: "qr", qr: "data:image/png;base64,QRDATA" };
      return Promise.resolve({ ok: true, status: 200, data: next });
    }),
    logout: vi.fn((...args: any[]) => {
      waCalls.push({ fn: "logout", args });
      return Promise.resolve({ ok: true, status: 200, data: {} });
    }),
    wake: vi.fn(() => Promise.resolve({ ok: true, status: 200, data: {} })),
    markEphemeral: vi.fn(() => Promise.resolve({ ok: true, status: 200, data: {} })),
    exportData: vi.fn(() => Promise.resolve({ ok: true, status: 200, data: { contacts: [], chats: [] } })),
  },
}));

let reachable = true;
let R: typeof import("@/lib/import/recovery-session");

function requireDb() {
  if (!reachable) {
    throw new Error(
      `PostgreSQL not reachable at ${DB_URL} — these tests assert real DB behaviour ` +
        `and must not be skipped silently. Note the URL needs a username.`,
    );
  }
}

async function makeTenant(mode: string) {
  const user = await db.user.create({
    data: { email: `${TAG}-${mode}-${Math.random().toString(36).slice(2, 8)}@example.test`, passwordHash: "x", name: "R" },
  });
  await db.bot.create({ data: { userId: user.id, connectionMode: mode, updatedAt: new Date() } });
  return user;
}

beforeAll(async () => {
  try { await db.$queryRawUnsafe("select 1"); } catch { reachable = false; return; }
  R = await import("@/lib/import/recovery-session");
});

afterAll(async () => {
  if (reachable) await db.user.deleteMany({ where: { email: { contains: TAG } } }).catch(() => {});
  await db.$disconnect().catch(() => {});
});

beforeEach(() => { waCalls.length = 0; statusQueue = []; });

// ─────────────────────────── B. Bridge tenant ───────────────────────────

describe("B. Bridge tenant — Recovery on a temporary session", () => {
  test("the session is created EPHEMERAL, never as a normal QR session", async () => {
    requireDb();
    const user = await makeTenant("bridge");

    const view = await R.startRecoverySession(user.id);

    expect(view.state).toBe("preparing");
    const start = waCalls.find((c) => c.fn === "start");
    expect(start, "recovery never started a session").toBeTruthy();
    // This is the whole safety property: a normal start would omit the flag and
    // leave a permanent QR connection behind.
    expect(start!.args[1]).toEqual({ ephemeral: true });
  });

  test("nothing starts unless the customer asks — opening the page is not consent", async () => {
    requireDb();
    const user = await makeTenant("bridge");

    const view = await R.pollRecoverySession(user.id);

    expect(view.state).toBe("idle");
    expect(waCalls.some((c) => c.fn === "start"), "polling started a session on its own").toBe(false);
  });

  test("the QR is surfaced only while the session waits to be scanned", async () => {
    requireDb();
    const user = await makeTenant("bridge");
    await R.startRecoverySession(user.id);

    statusQueue = [{ status: "qr", qr: "data:image/png;base64,QRDATA" }];
    const waiting = await R.pollRecoverySession(user.id);
    expect(waiting.state).toBe("qr_ready");
    expect(waiting.qr).toContain("data:image/png");

    statusQueue = [{ status: "connected" }];
    const scanned = await R.pollRecoverySession(user.id);
    expect(scanned.state).toBe("connected");
    expect(scanned.qr, "the QR outlived the scan").toBeNull();
  });

  test("a scan hands off to the EXISTING import job rather than a parallel path", async () => {
    requireDb();
    const user = await makeTenant("bridge");
    await R.startRecoverySession(user.id);
    statusQueue = [{ status: "connected" }];

    await R.pollRecoverySession(user.id);

    const job = await db.qrSlotJob.findFirst({ where: { userId: user.id } });
    expect(job, "no slot job was enqueued").toBeTruthy();
    expect(job.type).toBe("import");
    const s = await db.importSession.findUnique({ where: { userId: user.id } });
    expect(s.status).toBe("queued");
    expect(s.qrJobId).toBe(job.id);
  });

  test("connectionMode stays `bridge` through the whole flow", async () => {
    requireDb();
    const user = await makeTenant("bridge");

    await R.startRecoverySession(user.id);
    statusQueue = [{ status: "connected" }];
    await R.pollRecoverySession(user.id);

    const bot = await db.bot.findUnique({ where: { userId: user.id } });
    expect(bot.connectionMode, "Recovery changed the tenant's transport").toBe("bridge");
  });

  test("cancelling logs the session out and leaves nothing behind", async () => {
    requireDb();
    const user = await makeTenant("bridge");
    await R.startRecoverySession(user.id);

    const view = await R.cancelRecoverySession(user.id);

    expect(view.state).toBe("cancelled");
    expect(waCalls.some((c) => c.fn === "logout"), "cancel left the session running").toBe(true);
    const bot = await db.bot.findUnique({ where: { userId: user.id } });
    expect(bot.connectionMode).toBe("bridge");
  });

  test("an unscanned session expires and is torn down, never reconnected", async () => {
    requireDb();
    const user = await makeTenant("bridge");
    await R.startRecoverySession(user.id);
    // Wind the deadline into the past exactly the way the module stores it.
    await db.importSession.update({
      where: { userId: user.id },
      data: { error: `recovery_pending:${Date.now() - 1000}` },
    });
    waCalls.length = 0; // the setup's own start is not what this test is about

    const view = await R.pollRecoverySession(user.id);

    expect(view.state).toBe("expired");
    expect(waCalls.some((c) => c.fn === "logout")).toBe(true);
    // No restart: an expired recovery must not silently try again.
    expect(waCalls.some((c) => c.fn === "start")).toBe(false);
  });

  test("a service outage fails visibly instead of leaving a half-started session", async () => {
    requireDb();
    const user = await makeTenant("bridge");
    const { wa } = await import("@/lib/wa");
    (wa.start as any).mockResolvedValueOnce({ ok: false, status: 500, data: { error: "down" } });

    const view = await R.startRecoverySession(user.id);

    expect(view.state).toBe("failed");
    expect(view.error).toBe("recovery_service_unavailable");
    const s = await db.importSession.findUnique({ where: { userId: user.id } });
    expect(s.status).toBe("failed");
  });
});

// ─────────────────────── A + C. QR tenants and loopholes ───────────────────────

describe("A+C. the normal QR path and the loopholes", () => {
  test("a QR tenant is not a recovery tenant — their existing Import is untouched", async () => {
    requireDb();
    const user = await makeTenant("qr");
    expect(await R.isRecoveryTenant(user.id)).toBe(false);
  });

  test("recovery refuses a QR tenant outright, so there is no second way in", async () => {
    requireDb();
    const user = await makeTenant("qr");

    const view = await R.startRecoverySession(user.id);

    expect(view.state).toBe("failed");
    expect(view.error).toBe("not_a_bridge_tenant");
    expect(waCalls.some((c) => c.fn === "start"), "a QR tenant got a recovery session").toBe(false);
  });

  test("the normal QR routes still refuse Bridge tenants", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    for (const f of ["app/api/whatsapp/start/route.ts", "app/api/whatsapp/pair/route.ts"]) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      expect(src, `${f} lost its bridge guard`).toMatch(/normalizeConnectionMode[\s\S]{0,200}"bridge"/);
    }
  });

  test("recovery is the only caller that can create an ephemeral session", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { execSync } = await import("node:child_process");
    const hits = execSync('grep -rn "ephemeral: true" app lib --include=*.ts || true', {
      cwd: process.cwd(), encoding: "utf8",
    })
      .trim().split("\n").filter(Boolean)
      .filter((l) => !l.includes("recovery-session.ts") && !l.includes("lib/wa.ts"));
    expect(hits, `unexpected ephemeral-session callers:\n${hits.join("\n")}`).toHaveLength(0);
    // and wa.ts only forwards the flag it is given
    const wsrc = readFileSync(join(process.cwd(), "lib/wa.ts"), "utf8");
    expect(wsrc).toMatch(/ephemeral: !!opts\?\.ephemeral/);
  });
});

// ───────────────── D. what the service can actually report ─────────────────

describe("D. failure handling (no invented device-limit behaviour)", () => {
  test("the ephemeral session never forwards inbound to the SaaS webhook", async () => {
    // whatsapp-web.js exposes no device-slot API, so the only thing worth
    // asserting is our own handling: a temporary device must stay silent.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(process.cwd(), "..", "whatsapp-service", "src", "sessions.js"), "utf8",
    );
    const start = src.indexOf('client.on("message"');
    const handler = src.slice(start, src.indexOf("const t0 = Date.now();", start));
    expect(handler, "ephemeral inbound is still forwarded").toMatch(/if \(session\.ephemeral\) return;/);
    // The guard must precede the typing indicator, which the customer sees.
    // Match the statements, not the prose that explains them.
    const guardAt = handler.indexOf("if (session.ephemeral) return;");
    const typingAt = handler.indexOf("await chat.sendStateTyping()");
    expect(guardAt).toBeGreaterThan(-1);
    expect(typingAt).toBeGreaterThan(-1);
    expect(guardAt, "a recovery device would show the customer 'typing…'").toBeLessThan(typingAt);
  });

  test("every terminal state routes through a teardown that logs out", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(process.cwd(), "lib/import/recovery-session.ts"), "utf8");
    const teardown = src.slice(src.indexOf("async function teardown"));
    expect(teardown).toMatch(/wa\.logout\(userId\)/);
    // teardown must never touch the tenant's transport
    expect(src).not.toMatch(/connectionMode:\s*"/);
  });
});
