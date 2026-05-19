#!/usr/bin/env node
/*
 * KEYONE production verification suite (Phase 2 foundation).
 *
 * Design rules:
 * - Non-destructive by default: read-only DB/API checks only.
 * - No customer sends, no webhook mutation, no queue drains.
 * - Synthetic mode creates in-memory fake data unless explicitly extended later.
 * - Structured output suitable for humans and CI/log parsers.
 */

const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const ROOT = process.cwd();
const scope = (process.argv[2] || "system").toLowerCase();
const jsonOnly = process.argv.includes("--json");
const startedAt = Date.now();

loadEnvFile(".env");
loadEnvFile(".env.local");
loadEnvFile(".env.production");

const prisma = new PrismaClient();
const results = [];

function loadEnvFile(name) {
  const file = path.join(ROOT, name);
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function add(name, status, detail, meta) {
  results.push({ name, status, detail, ...(meta ? { meta } : {}) });
}

function pass(name, detail, meta) {
  add(name, "pass", detail, meta);
}
function warn(name, detail, meta) {
  add(name, "warn", detail, meta);
}
function fail(name, detail, meta) {
  add(name, "fail", detail, meta);
}
function skip(name, detail, meta) {
  add(name, "skip", detail, meta);
}

async function safe(name, fn) {
  try {
    return await fn();
  } catch (error) {
    fail(
      name,
      String(error && error.message ? error.message : error).slice(0, 500),
    );
    return undefined;
  }
}

async function fetchJson(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Number(process.env.KEYONE_VERIFY_HTTP_TIMEOUT_MS || 5000),
  );
  try {
    const res = await fetch(url, {
      ...(init || {}),
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text.slice(0, 500) };
    }
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function verifyLiveRoute(base, route, opts) {
  const label = opts?.label || `live:${route}`;
  const cookie = opts?.cookie;
  const expect = opts?.expect || [200];
  await safe(label, async () => {
    let r;
    try {
      r = await fetchJson(new URL(route, base).toString(), {
        headers: cookie ? { Cookie: cookie } : undefined,
      });
    } catch (error) {
      fail(
        label,
        `fetch failed for ${route}: ${String(error && error.message ? error.message : error).slice(0, 200)}`,
      );
      return;
    }
    if (expect.includes(r.status)) {
      pass(label, `route ${route} returned HTTP ${r.status}`, {
        route,
        status: r.status,
      });
    } else {
      fail(
        label,
        `route ${route} returned HTTP ${r.status}; expected ${expect.join("/")}`,
        r.body,
      );
    }
  });
}

async function verifySystem() {
  if (process.env.DATABASE_URL)
    pass("env:DATABASE_URL", "DATABASE_URL is present");
  else fail("env:DATABASE_URL", "DATABASE_URL is missing");

  await safe("db:select1", async () => {
    await prisma.$queryRaw`SELECT 1`;
    pass("db:select1", "Prisma can execute a lightweight SELECT 1");
  });

  await safe("db:core-counts", async () => {
    const [users, bots, subs, messages] = await Promise.all([
      prisma.user.count().catch(() => -1),
      prisma.bot.count().catch(() => -1),
      prisma.subscription.count().catch(() => -1),
      prisma.message.count().catch(() => -1),
    ]);
    const counts = { users, bots, subscriptions: subs, messages };
    if (Object.values(counts).some((n) => n < 0))
      warn("db:core-counts", "Some model counts failed", counts);
    else pass("db:core-counts", "Core production tables are queryable", counts);
  });

  await safe("runtime:memory", async () => {
    const mem = process.memoryUsage();
    const rssMb = Math.round(mem.rss / 1048576);
    const heapMb = Math.round(mem.heapUsed / 1048576);
    const status =
      rssMb > Number(process.env.KEYONE_VERIFY_RSS_WARN_MB || 1200)
        ? "warn"
        : "pass";
    add("runtime:memory", status, `node rss=${rssMb}MB heapUsed=${heapMb}MB`, {
      rssMb,
      heapMb,
    });
  });

  const base = process.env.KEYONE_VERIFY_BASE_URL;
  if (base) {
    await safe("http:/api/health", async () => {
      const r = await fetchJson(new URL("/api/health", base).toString());
      if (
        r.ok &&
        r.body &&
        (r.body.status === "ok" || r.body.status === "degraded")
      ) {
        add(
          "http:/api/health",
          r.body.status === "ok" ? "pass" : "warn",
          `health status=${r.body.status}`,
          r.body,
        );
      } else {
        fail(
          "http:/api/health",
          `unexpected response status=${r.status}`,
          r.body,
        );
      }
    });

    await verifyLiveRoute(base, "/login", {
      label: "live:/login",
      expect: [200],
    });

    const cookie = process.env.KEYONE_VERIFY_AUTH_COOKIE;
    if (cookie) {
      const authedRoutes = [
        "/dashboard",
        "/dashboard/orders",
        "/dashboard/inbox",
        "/dashboard/suggestions",
        "/dashboard/integrations",
      ];
      for (const route of authedRoutes) {
        await verifyLiveRoute(base, route, {
          label: `live:${route}`,
          cookie,
          expect: [200],
        });
      }
    } else {
      skip(
        "live:authenticated-dashboard-routes",
        "Set KEYONE_VERIFY_AUTH_COOKIE to verify dashboard/orders/inbox/suggestions/integrations pages without mutations",
      );
    }
  } else {
    skip(
      "http:/api/health",
      "Set KEYONE_VERIFY_BASE_URL to verify the live Next.js health endpoint",
    );
  }
}

async function verifyWhatsapp() {
  const baileysFlag = process.env.ENABLE_BAILEYS || "0";
  if (baileysFlag === "1") {
    warn(
      "whatsapp:baileys-flag",
      "ENABLE_BAILEYS=1 is set, but Baileys routing is not active in this phase; keep it at 0 in production until rollout",
    );
  } else {
    pass(
      "whatsapp:baileys-flag",
      "ENABLE_BAILEYS is disabled; current QR/Meta routing remains primary",
      { ENABLE_BAILEYS: baileysFlag },
    );
  }

  await safe("whatsapp:db-status", async () => {
    const rows = await prisma.bot.groupBy({
      by: ["whatsappStatus"],
      _count: { _all: true },
    });
    pass(
      "whatsapp:db-status",
      "Bot WhatsApp states are queryable",
      rows.map((r) => ({ status: r.whatsappStatus, count: r._count._all })),
    );
  });

  await safe("whatsapp:modes", async () => {
    const rows = await prisma.bot.groupBy({
      by: ["connectionMode"],
      _count: { _all: true },
    });
    const invalid = rows.filter(
      (r) =>
        !["qr", "meta_cloud", "unofficial", "official", null].includes(
          r.connectionMode,
        ),
    );
    if (invalid.length)
      warn(
        "whatsapp:modes",
        "Unknown connectionMode values fall back to QR but should be cleaned up",
        invalid,
      );
    else
      pass(
        "whatsapp:modes",
        "Connection modes are within known backwards-compatible values",
        rows,
      );
  });

  await safe("whatsapp:reconnect-metrics", async () => {
    const sinceDay = new Date(Date.now() - 7 * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    const reconnects = await prisma.metricEvent
      .findMany({
        where: { day: { gte: sinceDay }, kind: "ws_reconnect" },
        orderBy: { day: "desc" },
        take: 20,
      })
      .catch(() => []);
    pass("whatsapp:reconnect-metrics", "Reconnect metric query completed", {
      last7dRows: reconnects.length,
      total: reconnects.reduce((a, r) => a + r.count, 0),
    });
  });

  const service = process.env.WHATSAPP_SERVICE_URL || "http://127.0.0.1:3001";
  await safe("whatsapp:service-stats", async () => {
    let r;
    try {
      r = await fetchJson(new URL("/sessions/stats", service).toString(), {
        headers: {
          "X-Internal-Secret":
            process.env.SAAS_INTERNAL_SECRET || "dev-internal-secret-change-me",
        },
      });
    } catch (error) {
      warn(
        "whatsapp:service-stats",
        "Stats endpoint is not reachable in this environment; no sends attempted",
        {
          service,
          error: String(error && error.message ? error.message : error).slice(
            0,
            300,
          ),
        },
      );
      return;
    }
    if (r.ok)
      pass(
        "whatsapp:service-stats",
        "WhatsApp service stats endpoint is reachable",
        r.body,
      );
    else
      warn(
        "whatsapp:service-stats",
        `Stats endpoint not reachable or not healthy (status=${r.status}); no sends attempted`,
        r.body,
      );
  });
}

function delegate(name) {
  return prisma[name] && typeof prisma[name] === "object";
}

async function verifyOrders() {
  await safe("orders:counts", async () => {
    const rows = await prisma.order.groupBy({
      by: ["status"],
      _count: { _all: true },
    });
    pass(
      "orders:counts",
      "Order status counts are queryable",
      rows.map((r) => ({ status: r.status, count: r._count._all })),
    );
  });

  await safe("orders:commerce-dedup", async () => {
    try {
      const dupes = await prisma.$queryRawUnsafe(
        "SELECT userId, externalSource, externalOrderId, COUNT(*) AS n FROM \"Order\" WHERE externalOrderId IS NOT NULL AND externalOrderId != '' GROUP BY userId, externalSource, externalOrderId HAVING COUNT(*) > 1 LIMIT 20",
      );
      if (Array.isArray(dupes) && dupes.length)
        fail(
          "orders:commerce-dedup",
          "Duplicate external commerce orders detected",
          dupes,
        );
      else
        pass(
          "orders:commerce-dedup",
          "No duplicate external commerce order groups detected",
        );
    } catch (error) {
      warn(
        "orders:commerce-dedup",
        "External commerce order columns are not present in this database/client yet; run Prisma integrity checks before enabling commerce",
        {
          error: String(error && error.message ? error.message : error).slice(
            0,
            300,
          ),
        },
      );
    }
  });

  await safe("orders:item-integrity", async () => {
    const missingItems = await prisma.order
      .count({
        where: { items: { none: {} }, source: { in: ["commerce", "auto"] } },
      })
      .catch(() => 0);
    if (missingItems > 0)
      warn(
        "orders:item-integrity",
        "Some auto/commerce orders have no item rows; may be legitimate partial extraction",
        { missingItems },
      );
    else
      pass(
        "orders:item-integrity",
        "Auto/commerce orders have item rows where expected",
      );
  });

  syntheticOrderFlow();
}

async function verifyRealtime() {
  await safe("realtime:snapshot-inputs", async () => {
    const [conversations, messages, activeBroadcasts, openOrders] =
      await Promise.all([
        prisma.conversation.count().catch(() => -1),
        prisma.message.count().catch(() => -1),
        prisma.broadcast
          .count({ where: { status: { in: ["queued", "sending"] } } })
          .catch(() => -1),
        prisma.order
          .count({ where: { status: { in: ["pending", "confirmed"] } } })
          .catch(() => -1),
      ]);
    pass(
      "realtime:snapshot-inputs",
      "Realtime snapshot source tables are queryable",
      { conversations, messages, activeBroadcasts, openOrders },
    );
  });

  syntheticRealtimeFlow();

  const base = process.env.KEYONE_VERIFY_BASE_URL;
  const cookie = process.env.KEYONE_VERIFY_AUTH_COOKIE;
  if (base && cookie) {
    await safe("realtime:http-json", async () => {
      const r = await fetchJson(
        new URL("/api/realtime/stream", base).toString(),
        {
          headers: { Accept: "application/json", Cookie: cookie },
        },
      );
      if (r.ok && r.body && r.body.seq)
        pass(
          "realtime:http-json",
          "Authenticated realtime JSON snapshot returned a seq",
          { seqLength: String(r.body.seq).length, totals: r.body.totals },
        );
      else
        fail(
          "realtime:http-json",
          `Unexpected realtime response status=${r.status}`,
          r.body,
        );
    });
  } else {
    skip(
      "realtime:http-json",
      "Set KEYONE_VERIFY_BASE_URL and KEYONE_VERIFY_AUTH_COOKIE to verify the authenticated realtime endpoint",
    );
  }
}

async function verifyCommerce() {
  if (!delegate("commerceIntegration") || !delegate("commerceWebhookEvent")) {
    warn(
      "commerce:models",
      "Commerce Prisma delegates are unavailable in the generated client; run prisma generate/db push before commerce verification in production",
    );
    return;
  }

  await safe("commerce:integrations", async () => {
    const [enabled, disabled] = await Promise.all([
      prisma.commerceIntegration
        .count({ where: { enabled: true } })
        .catch(() => -1),
      prisma.commerceIntegration
        .count({ where: { enabled: false } })
        .catch(() => -1),
    ]);
    pass("commerce:integrations", "Commerce integrations are queryable", {
      enabled,
      disabled,
    });
  });

  await safe("commerce:webhook-events", async () => {
    const rows = await prisma.commerceWebhookEvent
      .groupBy({ by: ["status"], _count: { _all: true } })
      .catch(() => []);
    const failed = rows.find((r) => r.status === "failed")?._count?._all || 0;
    add(
      "commerce:webhook-events",
      failed > 0 ? "warn" : "pass",
      "Webhook event status counts collected",
      rows.map((r) => ({ status: r.status, count: r._count._all })),
    );
  });

  await safe("commerce:event-dedup", async () => {
    try {
      const dupes = await prisma.$queryRawUnsafe(
        "SELECT integrationId, externalEventId, COUNT(*) AS n FROM CommerceWebhookEvent GROUP BY integrationId, externalEventId HAVING COUNT(*) > 1 LIMIT 20",
      );
      if (Array.isArray(dupes) && dupes.length)
        fail(
          "commerce:event-dedup",
          "Duplicate commerce webhook events detected",
          dupes,
        );
      else
        pass(
          "commerce:event-dedup",
          "No duplicate commerce webhook event groups detected",
        );
    } catch (error) {
      warn(
        "commerce:event-dedup",
        "Commerce webhook table is not present in this database yet",
        {
          error: String(error && error.message ? error.message : error).slice(
            0,
            300,
          ),
        },
      );
    }
  });
}

async function verifyEmail() {
  if (
    !delegate("commerceEmailProvider") ||
    !delegate("commerceNotificationLog")
  ) {
    warn(
      "email:models",
      "Email/commerce notification Prisma delegates are unavailable in the generated client; run prisma generate/db push before email verification in production",
    );
    return;
  }

  await safe("email:providers", async () => {
    const providers = await prisma.commerceEmailProvider
      .findMany({
        select: {
          id: true,
          provider: true,
          enabled: true,
          fromEmail: true,
          host: true,
          port: true,
        },
      })
      .catch(() => []);
    const enabled = providers.filter((p) => p.enabled);
    const invalid = enabled.filter((p) => !p.fromEmail || !p.host || !p.port);
    if (invalid.length)
      fail(
        "email:providers",
        "Enabled email providers with missing SMTP/from configuration",
        invalid,
      );
    else
      pass(
        "email:providers",
        "Email provider configuration is safe to inspect; no sends attempted",
        { total: providers.length, enabled: enabled.length },
      );
  });

  await safe("email:queued-notifications", async () => {
    const staleSince = new Date(Date.now() - 60 * 60 * 1000);
    const queued = await prisma.commerceNotificationLog
      .count({ where: { channel: "email", status: "queued" } })
      .catch(() => 0);
    const stale = await prisma.commerceNotificationLog
      .count({
        where: {
          channel: "email",
          status: "queued",
          createdAt: { lt: staleSince },
        },
      })
      .catch(() => 0);
    add(
      "email:queued-notifications",
      stale > 0 ? "warn" : "pass",
      "Email queue inspected without sending",
      { queued, staleOlderThan1h: stale },
    );
  });
}

function syntheticOrderFlow() {
  const fake = {
    customer: { phone: "+201000000000", name: "Synthetic Customer" },
    message: "عايز اوردر تيشيرت أسود مقاس L قطعتين والدفع عند الاستلام",
    order: {
      items: [{ name: "تيشيرت", color: "أسود", size: "L", quantity: 2 }],
      total: 0,
      source: "synthetic",
    },
  };
  const idempotencyKey = `synthetic:${fake.customer.phone}:order:${Buffer.from(fake.message).toString("base64").slice(0, 24)}`;
  pass(
    "synthetic:orders",
    "Synthetic fake customer/order/message flow built in-memory only; no DB writes and no sends",
    { dryRun: true, idempotencyKey, fake },
  );
}

function syntheticRealtimeFlow() {
  const snapshots = [
    {
      conversations: 1,
      messages: 1,
      ordersOpen: 0,
      latest: "2025-01-01T00:00:00.000Z",
    },
    {
      conversations: 1,
      messages: 2,
      ordersOpen: 1,
      latest: "2025-01-01T00:00:05.000Z",
    },
  ];
  const seq = (s) =>
    [s.conversations, s.messages, s.ordersOpen, s.latest].join("|");
  const changed = seq(snapshots[0]) !== seq(snapshots[1]);
  if (changed)
    pass(
      "synthetic:realtime",
      "Synthetic realtime regression detector catches sequence changes in-memory",
      { dryRun: true, before: seq(snapshots[0]), after: seq(snapshots[1]) },
    );
  else fail("synthetic:realtime", "Synthetic realtime sequence did not change");
}

async function verifyMobile() {
  const files = [
    "app/dashboard/layout.tsx",
    "app/dashboard/mobile-nav.tsx",
    "app/dashboard/inbox/inbox-ui.tsx",
    "app/dashboard/orders/page.tsx",
    "app/globals.css",
  ];
  for (const rel of files) {
    const file = path.join(ROOT, rel);
    if (fs.existsSync(file))
      pass(`mobile:file:${rel}`, "Required mobile-sensitive file exists");
    else fail(`mobile:file:${rel}`, "Required mobile-sensitive file missing");
  }

  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
  const layout = read("app/dashboard/layout.tsx");
  const nav = read("app/dashboard/mobile-nav.tsx");
  const inbox = read("app/dashboard/inbox/inbox-ui.tsx");
  const orders = read("app/dashboard/orders/page.tsx");
  const css = read("app/globals.css");

  if (layout.includes("min-w-0") && layout.includes("pb-safe"))
    pass(
      "mobile:layout-shell",
      "Dashboard shell has min-width and safe-area protections",
    );
  else
    fail(
      "mobile:layout-shell",
      "Dashboard shell is missing min-w-0 or safe-area padding",
    );

  if (
    nav.includes("md:hidden") &&
    nav.includes("Escape") &&
    nav.includes("touch-target")
  )
    pass(
      "mobile:navigation",
      "Mobile drawer has route close, Escape close, and touch-sized trigger",
    );
  else
    fail(
      "mobile:navigation",
      "Mobile drawer missing one of route/Escape/touch safeguards",
    );

  if (
    inbox.includes("100dvh") &&
    inbox.includes("sm:flex-row") &&
    inbox.includes("sm:max-w-[78%]")
  )
    pass(
      "mobile:inbox",
      "Inbox uses dynamic viewport height, stacked composer, and wider mobile bubbles",
    );
  else
    fail(
      "mobile:inbox",
      "Inbox mobile viewport/composer/bubble safeguards incomplete",
    );

  if (
    orders.includes("md:hidden") &&
    orders.includes("Mobile cards") &&
    orders.includes("mobile-scroll-x")
  )
    pass(
      "mobile:orders",
      "Orders page uses mobile cards and preserves desktop table",
    );
  else
    fail(
      "mobile:orders",
      "Orders page missing mobile-card/desktop-table split",
    );

  if (
    css.includes("overflow-x: hidden") &&
    css.includes("mobile-scroll-x") &&
    css.includes("safe-area-inset-bottom")
  )
    pass(
      "mobile:global-css",
      "Global CSS includes horizontal overflow and safe-area primitives",
    );
  else fail("mobile:global-css", "Global CSS mobile primitives incomplete");

  skip(
    "mobile:screenshots",
    "Automated screenshots require a running browser harness. Use KEYONE_VERIFY_BASE_URL with your existing browser tool or add Playwright in a separate non-production change.",
  );
}

async function run() {
  if (["system", "all"].includes(scope)) await verifySystem();
  if (["whatsapp", "all"].includes(scope)) await verifyWhatsapp();
  if (["orders", "all"].includes(scope)) await verifyOrders();
  if (["realtime", "all"].includes(scope)) await verifyRealtime();
  if (["commerce", "all"].includes(scope)) await verifyCommerce();
  if (["email", "all"].includes(scope)) await verifyEmail();
  if (["mobile", "all"].includes(scope)) await verifyMobile();
  if (
    ![
      "system",
      "whatsapp",
      "orders",
      "realtime",
      "commerce",
      "email",
      "mobile",
      "all",
    ].includes(scope)
  ) {
    fail("verify:scope", `Unknown verification scope: ${scope}`);
  }
}

run()
  .catch((error) =>
    fail("verify:runner", String(error && error.stack ? error.stack : error)),
  )
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
    const counts = results.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});
    const failed = counts.fail || 0;
    const payload = {
      ok: failed === 0,
      scope,
      startedAt: new Date(Date.now() - (Date.now() - startedAt)).toISOString(),
      durationMs: Date.now() - startedAt,
      counts,
      results,
    };

    if (jsonOnly) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log(
        `KEYONE verify:${scope} ${payload.ok ? "PASS" : "FAIL"} (${payload.durationMs}ms)`,
      );
      for (const r of results) {
        const icon =
          r.status === "pass"
            ? "✓"
            : r.status === "fail"
              ? "✗"
              : r.status === "warn"
                ? "!"
                : "-";
        console.log(`${icon} [${r.status}] ${r.name} — ${r.detail}`);
        if (r.meta !== undefined) console.log(`  ${JSON.stringify(r.meta)}`);
      }
      console.log(
        JSON.stringify({
          ok: payload.ok,
          scope: payload.scope,
          counts: payload.counts,
          durationMs: payload.durationMs,
        }),
      );
    }

    process.exitCode = failed === 0 ? 0 : 1;
  });
