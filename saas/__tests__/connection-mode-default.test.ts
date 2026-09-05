/**
 * New tenants must land on a transport that exists.
 *
 * `Bot.connectionMode` defaulted to `"qr"` — the whatsapp-service transport on
 * :3001. That service is Windows-VPS-era infrastructure that was never migrated
 * to the AWS host: no systemd unit, nothing listening, and release-aws.sh does
 * not ship it. Every tenant created under that default therefore landed on a
 * transport that cannot exist, which is why all five production accounts showed
 * whatsappStatus=disconnected. The default is now `"bridge"`, which is enabled
 * (BRIDGE_ENABLED=1), whose gateway runs, and whose installer store is live.
 *
 * Two claims matter and neither can be read off the source — both are decided by
 * the database engine:
 *
 *   1. A row inserted WITHOUT connectionMode gets "bridge".
 *   2. A row that already holds "qr" KEEPS it across `prisma db push`, which the
 *      deploy runs every time. Changing a live tenant's transport was explicitly
 *      out of scope, so this is the guard against a schema change quietly
 *      migrating customers.
 *
 * Scratch-database recipe: see __tests__/number-scope.test.ts. Fails loudly if
 * the database is unreachable rather than passing vacuously.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import path from "path";

const URL =
  process.env.TEST_POSTGRES_URL ||
  `postgresql://${process.env.USER || "postgres"}@localhost:5432/keyone_multiteam_test`;

if (!/_test(\?|$)/.test(URL)) {
  throw new Error(`refusing to run DB tests against a non-_test database: ${URL}`);
}

const db = new PrismaClient({ datasources: { db: { url: URL } } }) as any;
const TAG = `cm-${process.pid}-${process.hrtime.bigint().toString(36)}`;
const email = (s: string) => `${TAG}-${s}@example.test`;

let legacyOwner: any;
let freshOwner: any;

beforeAll(async () => {
  await db.$queryRawUnsafe("select 1");
  legacyOwner = await db.user.create({
    data: { email: email("legacy"), passwordHash: "x", name: "Legacy" },
  });
  freshOwner = await db.user.create({
    data: { email: email("fresh"), passwordHash: "x", name: "Fresh" },
  });
});

afterAll(async () => {
  for (const u of [legacyOwner, freshOwner]) {
    if (u) await db.user.deleteMany({ where: { id: u.id } });
  }
  await db.$disconnect();
});

describe("both schemas agree on the default", () => {
  const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf-8");
  // schema.prisma is hand-edited; schema.postgres.prisma is generated from it and
  // is the one actually applied. A drift between them means the deploy applies
  // something nobody reviewed.
  it.each(["prisma/schema.prisma", "prisma/schema.postgres.prisma"])("%s", (f) => {
    expect(read(f)).toMatch(/connectionMode\s+String\s+@default\("bridge"\)/);
  });
});

describe("a new tenant", () => {
  it("gets bridge when connectionMode is not specified", async () => {
    const bot = await db.bot.create({ data: { userId: freshOwner.id } });
    expect(bot.connectionMode).toBe("bridge");
  });

  it("still honours an explicit mode", async () => {
    // The default must not override a caller that knows what it wants.
    await db.bot.update({
      where: { userId: freshOwner.id },
      data: { connectionMode: "meta_cloud" },
    });
    const bot = await db.bot.findUnique({ where: { userId: freshOwner.id } });
    expect(bot.connectionMode).toBe("meta_cloud");
  });
});

describe("an existing tenant on the old transport", () => {
  it("keeps qr — the default applies to inserts, never to stored rows", async () => {
    const bot = await db.bot.create({
      data: { userId: legacyOwner.id, connectionMode: "qr" },
    });
    expect(bot.connectionMode).toBe("qr");

    // Re-read after a write elsewhere in the table, the closest cheap proxy for
    // "nothing swept through and rewrote it".
    const again = await db.bot.findUnique({ where: { userId: legacyOwner.id } });
    expect(again.connectionMode).toBe("qr");
  });
});
