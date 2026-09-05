/**
 * lib/import/import-engine.ts — One-Time QR Import (Phase 3).
 *
 * Imports a tenant's existing WhatsApp contacts + recent chat history ONCE into
 * permanent CRM records (Customer) and AI memory (CustomerMemory). One-time is
 * enforced by ImportSession.userId being @unique — a completed/closed session is
 * never reopened.
 *
 * Activation semantics (honored): imported customers are flagged
 * `historicalImported=true` and do NOT get `keyoneActivatedAt` — historical data
 * is visible but does not start billing/safety/warmup until the first LIVE
 * inbound, exactly like the existing import-awareness fields expect.
 *
 * The slot handler (`runImportJob`) wakes the booked session, pulls data via the
 * additive whatsapp-service export endpoint (wa.exportData — read-only, never the
 * send pipeline), then runs the pure builders. `importData` is callable directly
 * with data for testing.
 */

import { prisma } from "@/lib/db";
import { wa } from "@/lib/wa";
import { audit } from "@/lib/audit/log";
import { completeJob, failJob } from "@/lib/qr-pool/scheduler";
import { normalizeConnectionMode } from "@/lib/messaging/mode";

export interface ImportContact { phone: string; name?: string | null }
export interface ImportMessage { fromMe?: boolean; body?: string; ts?: number }
export interface ImportChat { phone: string; name?: string | null; messages?: ImportMessage[] }
export interface ImportData { contacts?: ImportContact[]; chats?: ImportChat[] }

const REOPENABLE = new Set(["failed"]);

/** Normalize a WhatsApp id/phone to a CRM phone key (digits, optional leading +). */
function normPhone(raw: string): string {
  const cleaned = String(raw || "").replace(/@c\.us|@s\.whatsapp\.net|@g\.us/gi, "").trim();
  const digits = cleaned.replace(/[^\d]/g, "");
  if (!digits) return "";
  return cleaned.startsWith("+") ? "+" + digits : digits;
}

/**
 * BUG2: reject WhatsApp system channels that are NOT real customers — Status /
 * stories (status@broadcast), broadcast lists (@broadcast), and channels /
 * newsletters (@newsletter). Defense-in-depth: the export endpoint already keeps
 * only c.us chats, but importData is also called directly (tests / paste import).
 */
function isSystemChannel(raw: string): boolean {
  const s = String(raw || "").toLowerCase();
  return /status@broadcast|@broadcast|@newsletter|\bbroadcast\b|\bnewsletter\b|^status$/.test(s);
}

export async function getImportSession(userId: string) {
  return prisma.importSession.findUnique({ where: { userId } });
}

/**
 * Request the one-time import. Idempotent: returns the existing session unless it
 * previously failed (then it is reset + re-queued). Throws nothing.
 */
export async function requestImport(userId: string): Promise<{ session: any; alreadyExists: boolean }> {
  const existing = await prisma.importSession.findUnique({ where: { userId } });
  if (existing && !REOPENABLE.has(existing.status)) {
    return { session: existing, alreadyExists: true };
  }

  // TRANSPORT GATE — must precede any queue write.
  //
  // Import reads the tenant's existing contacts and chat history, which is only
  // possible from a linked whatsapp-web.js session: wa.exportData() against the
  // co-located QR service. The other two transports genuinely cannot do it —
  // this is a capability fact, not a missing feature flag:
  //
  //   bridge      The Cloud<->Bridge protocol has no verb for it. The Bridge
  //               accepts control actions disconnect|logout|reconnect|restart|
  //               start_qr|update and nothing else, and bridge-node never calls
  //               getContacts()/getChats(). Adding one means a new frame type
  //               shipped to every installed Bridge.
  //   meta_cloud  The Cloud API exposes no contact-list or history endpoint at
  //               all; it delivers messages only from the moment a webhook
  //               subscription exists.
  //
  // Without this gate every tenant was enqueued into the QR pool regardless of
  // transport. A Bridge tenant's timeline then read "تم طلب الاستيراد وإدخاله
  // في طابور QR" → "تم إيقاظ جلسة QR" → export_unavailable, retrying forever:
  // three lies in a row, because it was waking a QR session the tenant does not
  // have and blaming the export for a queue it should never have entered.
  //
  // Failing closed here is the honest outcome. Silently falling back to QR is
  // what produced the misleading timeline in the first place.
  const bot = await prisma.bot
    .findUnique({ where: { userId }, select: { connectionMode: true } as any })
    .catch(() => null);
  const mode = normalizeConnectionMode((bot as any)?.connectionMode);
  if (mode !== "qr") {
    const session = existing
      ? await prisma.importSession.update({
          where: { userId },
          data: { status: "failed", error: `import_unsupported_on_${mode}`, requestedAt: new Date() },
        })
      : await prisma.importSession.create({
          data: { userId, status: "failed", error: `import_unsupported_on_${mode}` },
        });
    await log(
      userId,
      session.id,
      "warn",
      mode === "bridge"
        ? "الاستيراد غير متاح على KEYONE Bridge — بيحتاج جلسة QR متصلة."
        : "الاستيراد غير متاح على قناة Meta الرسمية — بيحتاج جلسة QR متصلة.",
    );
    void audit({
      userId,
      action: "import.unsupported_transport",
      targetType: "import_session",
      targetId: session.id,
      metadata: { mode },
    });
    return { session, alreadyExists: false };
  }

  const session = existing
    ? await prisma.importSession.update({ where: { userId }, data: { status: "queued", error: null, requestedAt: new Date() } })
    : await prisma.importSession.create({ data: { userId, status: "queued" } });

  const { enqueueJob } = await import("@/lib/qr-pool/scheduler");
  const job = await enqueueJob({ userId, type: "import", refId: session.id, priority: 5 });
  await prisma.importSession.update({ where: { id: session.id }, data: { qrJobId: job.id } });
  await log(userId, session.id, "info", "تم طلب الاستيراد وإدخاله في طابور QR");
  void audit({ userId, action: "import.requested", targetType: "import_session", targetId: session.id });
  return { session, alreadyExists: false };
}

/** Append an import log line (best-effort). */
export async function log(userId: string, importSessionId: string, level: "info" | "warn" | "error", message: string, payload?: Record<string, unknown>) {
  await prisma.importLog.create({ data: { userId, importSessionId, level, message: message.slice(0, 500), payload: safeJson(payload) } }).catch(() => {});
}

/**
 * PURE-ish builder: turn export data into permanent CRM + AI-memory records.
 * Idempotent per (userId, phone): re-running updates instead of duplicating.
 * Returns counters. Used by the slot handler and directly by tests.
 */
export async function importData(userId: string, sessionId: string, data: ImportData): Promise<{
  contactsFound: number; contactsImported: number; conversationsImported: number; messagesImported: number; customersCreated: number; memoriesBuilt: number;
}> {
  const contacts = Array.isArray(data.contacts) ? data.contacts : [];
  const chats = Array.isArray(data.chats) ? data.chats : [];
  let contactsImported = 0, conversationsImported = 0, messagesImported = 0, customersCreated = 0, memoriesBuilt = 0;

  // Contacts are used ONLY as a name lookup. BUG1: a saved phone number with no
  // conversation is NOT a customer — we import ONLY chats that contain messages.
  const nameByPhone = new Map<string, string>();
  for (const c of contacts) {
    const phone = normPhone(c.phone);
    if (phone && c.name) nameByPhone.set(phone, c.name);
  }

  // Chats → ensure Customer + build AI memory from message history.
  // BUG1: skip empty conversations (no messages). BUG2: skip WhatsApp system
  // channels (status/stories/broadcast/newsletter) — never real customers.
  for (const chat of chats) {
    if (isSystemChannel(chat.phone) || isSystemChannel(chat.name || "")) continue;
    const phone = normPhone(chat.phone);
    if (!phone) continue;
    const msgs = Array.isArray(chat.messages) ? chat.messages : [];
    if (msgs.length === 0) continue; // empty conversation → not a customer
    const name = chat.name || nameByPhone.get(phone) || null;

    let customer = await prisma.customer.findUnique({ where: { userId_phone: { userId, phone } } }).catch(() => null);
    if (!customer) {
      customer = await prisma.customer.create({ data: { userId, phone, name, historicalImported: true } }).catch(() => null);
      if (customer) customersCreated++;
    } else if (name && !customer.name) {
      await prisma.customer.update({ where: { id: customer.id }, data: { name, historicalImported: true } }).catch(() => {});
    }
    if (!customer) continue;
    contactsImported++;      // number of REAL customers imported (= conversations)
    conversationsImported++;
    messagesImported += msgs.length;

    const summary = buildMemorySummary(name || phone, msgs);
    const facts = buildFacts(msgs);
    await prisma.customerMemory.upsert({
      where: { customerId: customer.id },
      create: { customerId: customer.id, summary, factsJson: safeJson(facts), messageCount: msgs.length },
      update: { summary, factsJson: safeJson(facts), messageCount: msgs.length },
    }).catch(() => {});
    memoriesBuilt++;

    // Stamp inbound counters from historical inbound messages (no activation).
    const inbound = msgs.filter((m) => !m.fromMe).length;
    if (inbound > 0) {
      await prisma.customer.update({ where: { id: customer.id }, data: { inboundCount: { increment: inbound }, historicalImported: true } }).catch(() => {});
    }
  }

  // contactsFound = raw phone book size (for the "ignored contacts" report),
  // conversationsImported = the REAL customers created from chats-with-messages.
  await prisma.importSession.update({
    where: { id: sessionId },
    data: { contactsFound: contacts.length, contactsImported, conversationsImported, messagesImported, customersCreated, memoriesBuilt },
  }).catch(() => {});

  return { contactsFound: contacts.length, contactsImported, conversationsImported, messagesImported, customersCreated, memoriesBuilt };
}

/** Slot handler: wake the session, export data, build CRM + memory, close. */
export async function runImportJob(job: { id: string; userId: string; refId: string }): Promise<{ done?: boolean; error?: string }> {
  const session = await prisma.importSession.findUnique({ where: { id: job.refId } });
  if (!session) { await completeJob(job.id, { error: "session_not_found" }); return { done: true, error: "session_not_found" }; }
  if (session.status === "completed" || session.status === "closed") { await completeJob(job.id, { skipped: true }); return { done: true }; }

  try {
    await prisma.importSession.update({ where: { id: session.id }, data: { status: "scanning", startedAt: session.startedAt || new Date() } });
    await wa.wake(job.userId).catch(() => {});
    // The import QR session is TEMPORARY: flag it so it never auto-reconnects or
    // survives a restart, and self-destructs on the gateway TTL if we somehow
    // don't reach the explicit teardown below.
    await wa.markEphemeral(job.userId).catch(() => {});
    await log(job.userId, session.id, "info", "تم إيقاظ جلسة QR، جاري سحب البيانات");

    const exp = await wa.exportData(job.userId, { chatLimit: 500, msgLimit: 50 });
    if (!exp.ok) {
      await log(job.userId, session.id, "error", "تعذّر سحب بيانات الواتساب", { status: exp.status });
      await prisma.importSession.update({ where: { id: session.id }, data: { status: "failed", error: "export_unavailable" } });
      await failJob(job.id, "export_unavailable", { retry: true });
      return { done: false, error: "export_unavailable" };
    }

    await prisma.importSession.update({ where: { id: session.id }, data: { status: "importing" } });
    const data = (exp.data || {}) as ImportData;
    const counts = await importData(job.userId, session.id, data);
    await log(job.userId, session.id, "info", "اكتمل الاستيراد", counts as any);

    // One-time: complete + close forever.
    await prisma.importSession.update({ where: { id: session.id }, data: { status: "closed", completedAt: new Date(), closedAt: new Date() } });
    await completeJob(job.id, counts);
    // TEMPORARY-QR LIFECYCLE: the one-time import is finished — disconnect the QR
    // transport, destroy the client, and wipe its auth so it goes OFFLINE and
    // never reconnects. Only Meta Cloud (if configured) remains active.
    await wa.logout(job.userId).catch(() => {});
    await log(job.userId, session.id, "info", "تم فصل جلسة QR المؤقتة نهائيًا بعد اكتمال الاستيراد");
    void audit({ userId: job.userId, action: "import.completed", targetType: "import_session", targetId: session.id, metadata: counts });
    return { done: true };
  } catch (e: any) {
    await prisma.importSession.update({ where: { id: session.id }, data: { status: "failed", error: String(e?.message || e).slice(0, 300) } }).catch(() => {});
    await failJob(job.id, String(e?.message || e), { retry: true });
    return { done: false, error: String(e?.message || e) };
  }
}

// ── memory builders (heuristic, no LLM tokens) ───────────────────────────────
function buildMemorySummary(who: string, msgs: ImportMessage[]): string {
  const inbound = msgs.filter((m) => !m.fromMe).length;
  const outbound = msgs.length - inbound;
  const lastTexts = msgs.slice(-6).map((m) => `${m.fromMe ? "نحن" : "العميل"}: ${String(m.body || "").slice(0, 80)}`).join(" | ");
  return `سجل مستورد لـ ${who}: ${msgs.length} رسالة (${inbound} واردة، ${outbound} صادرة). آخر الرسائل — ${lastTexts}`.slice(0, 1000);
}

function buildFacts(msgs: ImportMessage[]): Record<string, unknown> {
  const texts = msgs.map((m) => String(m.body || "")).join(" ").toLowerCase();
  const topics: string[] = [];
  for (const [kw, tag] of [["سعر", "price"], ["شحن", "shipping"], ["مقاس", "size"], ["لون", "color"], ["خصم", "discount"]] as const) {
    if (texts.includes(kw)) topics.push(tag);
  }
  return { imported: true, messageCount: msgs.length, firstTs: msgs[0]?.ts || null, lastTs: msgs[msgs.length - 1]?.ts || null, topics };
}

function safeJson(v: unknown): string { try { return JSON.stringify(v || {}); } catch { return "{}"; } }
