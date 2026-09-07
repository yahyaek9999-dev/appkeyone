/**
 * QR-only capabilities must refuse non-QR tenants BEFORE they cost anything.
 *
 * Two features read a linked whatsapp-web.js session through the QR slot pool:
 * the one-time contact import (wa.exportData) and credit broadcast campaigns
 * (wa.wake + the drain). Neither has a Bridge or Meta equivalent — the
 * Cloud<->Bridge protocol has no verb for either, and Meta exposes no
 * contact-list or session-send endpoint.
 *
 * Both used to enqueue every tenant into the QR pool regardless of transport. A
 * Bridge tenant's timeline then read "تم إدخاله في طابور QR" → "تم إيقاظ جلسة
 * QR" → failure, on a loop: waking a session they do not have and blaming the
 * result on the operation.
 *
 * ORDERING IS THE POINT, not merely the presence of a check. The campaigns route
 * debits credits (Step 4) before it enqueues (Step 5), so a guard placed at the
 * enqueue would take a Bridge tenant's money for a campaign that can never run.
 * That is what these assertions pin.
 *
 * Static: reads source, no DB, no network.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf-8");

const CAMPAIGNS = "app/api/broadcast-credits/campaigns/route.ts";
const IMPORT_ENGINE = "lib/import/import-engine.ts";
const HANDLER = "lib/credits/broadcast-handler.ts";

describe("the guard uses the canonical transport source", () => {
  it.each([CAMPAIGNS, IMPORT_ENGINE, HANDLER])("%s resolves via normalizeConnectionMode", (f) => {
    const src = read(f);
    // Bot.connectionMode through the shared normalizer — the same resolver the
    // send path and /api/whatsapp/status use. No second mode field, no
    // per-tenant special case, no inferring mode from UI text.
    expect(src).toMatch(/normalizeConnectionMode/);
    expect(src).toMatch(/connectionMode/);
  });
});

describe("credit campaigns refuse a non-QR tenant before spending anything", () => {
  const src = read(CAMPAIGNS);
  const guardAt = src.indexOf('mode !== "qr"');
  const debitAt = src.indexOf("campaign_reserve");
  const enqueueAt = src.indexOf("enqueueJob(");

  it("has the guard at all", () => {
    expect(guardAt).toBeGreaterThan(-1);
  });

  it("guards BEFORE the credit reservation", () => {
    // If this inverts, a Bridge tenant pays for a campaign that cannot run.
    expect(debitAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(debitAt);
  });

  it("guards BEFORE the QR slot job is enqueued", () => {
    expect(enqueueAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(enqueueAt);
  });

  it("answers with a code the client can branch on, and Arabic a merchant can read", () => {
    expect(src).toMatch(/campaign_unsupported_on_transport/);
    // broadcasts-pro-client renders `j.detail || j.error`; anything else shows
    // the raw English code on an Arabic RTL screen.
    expect(src).toMatch(/detail:/);
  });
});

describe("the one-time import refuses a non-QR tenant before queueing", () => {
  const src = read(IMPORT_ENGINE);
  const guardAt = src.indexOf('mode !== "qr"');
  const enqueueAt = src.indexOf("enqueueJob(");

  it("guards BEFORE the QR slot job is enqueued", () => {
    expect(guardAt).toBeGreaterThan(-1);
    expect(enqueueAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(enqueueAt);
  });

  it("records a transport-specific reason rather than a generic failure", () => {
    expect(src).toMatch(/import_unsupported_on_/);
  });
});

describe("the slot handler does not wake a session the tenant does not have", () => {
  const src = read(HANDLER);

  it("checks the transport before wa.wake()", () => {
    const guardAt = src.indexOf("normalizeConnectionMode");
    const wakeAt = src.indexOf("wa.wake(");
    expect(guardAt).toBeGreaterThan(-1);
    expect(wakeAt).toBeGreaterThan(-1);
    // connectionMode can change AFTER a job is queued — the inbound webhook
    // flips a tenant to "bridge" when their Bridge reports connected, which has
    // already happened in production. This is the second line of defence.
    expect(guardAt).toBeLessThan(wakeAt);
  });
});

describe("QR tenants keep the existing behaviour", () => {
  it("still enqueues and still says so", () => {
    const src = read(IMPORT_ENGINE);
    expect(src).toMatch(/enqueueJob\(/);
    expect(src).toContain("تم طلب الاستيراد وإدخاله في طابور QR");
  });

  it("campaigns still reach the reserve + enqueue path", () => {
    const src = read(CAMPAIGNS);
    expect(src).toMatch(/campaign_reserve/);
    expect(src).toMatch(/enqueueJob\(/);
  });
});
