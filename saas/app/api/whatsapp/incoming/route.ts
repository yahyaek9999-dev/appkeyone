import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chat as llmChat, buildMessages, detectOrderIntent } from "@/lib/llm";
import { botProviderOverride } from "@/lib/providers/bot-provider";
import { getCached, setCached } from "@/lib/llm-cache";
import { transcribeAudio, describeImage } from "@/lib/media";
import { notifyMerchant, notifyAdmin, resolveNotifyPhone } from "@/lib/notify";
import {
  classify,
  scoreLead,
  matchQuickReply,
  inWorkingHours,
  looksLikeGap,
  questionSimilarity,
} from "@/lib/insights";
import { humanizeReply, pickTemperature, computeReadDelayMs, computeTypingDelayMs, type HumanizeConfig } from "@/lib/humanize";
import { loadMemory, buildMemoryBlock, triggerMemoryUpdate } from "@/lib/memory";
import { fuzzyMatchQuickReplies } from "@/lib/semantic-match";
import {
  detectSignals,
  classifyPsychology,
  chooseMode,
  buildSalesBlock,
  shouldRunSales,
  readNegotiation,
  applySignalsToNegotiation,
} from "@/lib/sales-engine";
import { assessOutbound } from "@/lib/anti-ban";
import { assessAndShape, recordInboundReply } from "@/lib/safety/engine";
import { onInbound } from "@/lib/safety/trust";
import { extractOrderFast } from "@/lib/order-extractor";
import { computePriority } from "@/lib/fast-path";
import { loadKnowledgeBaseCached, retrieveRelevantKb } from "@/lib/kb-cache";
import { applyRealism } from "@/lib/human-realism";
import { bump } from "@/lib/metrics";
import { extractPhone, extractName } from "@/lib/phone";

const SECRET = process.env.SAAS_INTERNAL_SECRET || "dev-internal-secret-change-me";

export async function POST(req: Request) {
  const provided = req.headers.get("x-internal-secret");
  if (provided !== SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !body.event) return NextResponse.json({ error: "bad body" }, { status: 400 });

  const { event, userId } = body;
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  if (event === "connected") {
    await prisma.bot
      .update({
        where: { userId },
        data: { whatsappStatus: "connected", whatsappPhone: body.phone || null },
      })
      .catch(() => {});
    return NextResponse.json({ ok: true });
  }
  if (event !== "incoming") {
    return NextResponse.json({ ok: true });
  }

  const { from, mediaType, text: rawText, mediaBase64, mimetype } = body as {
    from: { phone: string; name?: string | null };
    mediaType: "text" | "voice" | "image";
    text: string;
    mediaBase64?: string;
    mimetype?: string;
  };

  // ---- Load tenant ----------------------------------------------------------
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      bot: { include: { quickReplies: { where: { enabled: true } } } },
      subscription: { include: { plan: true } },
    },
  });
  if (!user || !user.bot) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }
  const bot: any = user.bot;

  // ---- Wave 5: build humanize config from bot row -------------------------
  const humanCfg: HumanizeConfig = {
    enabled: !!bot.humanizeReplies,
    typingSpeedCps: bot.typingSpeedCps ?? 25,
    preReplyDelayMs: bot.preReplyDelayMs ?? 800,
    dynamicEmojis: bot.dynamicEmojis !== false,
    replyVariations: bot.replyVariations !== false,
  };

  // ---- Suspension gate (membership foundation) -----------------------------
  // Soft-blocks suspended accounts at the very first runtime checkpoint.
  // Existing subscription-based gates below still run as a defense-in-depth.
  if ((user as any).suspended) {
    return NextResponse.json({ ok: true, reply: null, blocked: "suspended" });
  }

  // ---- Gate by subscription -------------------------------------------------
  const sub = user.subscription;
  if (!sub) return NextResponse.json({ ok: true, reply: null, blocked: "no_subscription" });
  if (sub.status !== "active")
    return NextResponse.json({ ok: true, reply: null, blocked: "inactive_status:" + sub.status });
  if (sub.expiresAt < new Date())
    return NextResponse.json({ ok: true, reply: null, blocked: "expired" });
  const monthlyCap = sub.plan?.monthlyMsgs ?? 0;
  if (monthlyCap > 0 && sub.msgsUsed >= monthlyCap)
    return NextResponse.json({ ok: true, reply: null, blocked: "quota_exhausted" });

  // ---- AI request cap (membership) ------------------------------------------
  // 0 in the plan field means unlimited. Quick-reply / fuzzy-match branches
  // are NOT blocked by this — only the LLM call is gated downstream by the
  // same numbers. We block here as a fast short-circuit when exhausted.
  const aiCap = (sub.plan as any)?.aiRequestsMonthly ?? 0;
  if (aiCap > 0 && ((sub as any).aiRequestsUsed ?? 0) >= aiCap) {
    return NextResponse.json({ ok: true, reply: null, blocked: "ai_quota_exhausted" });
  }

  // ---- Daily cap (Controlled Launch safety) -------------------------------
  // Rolls the counter when the stored reset day is older than today (UTC).
  // 0 disables the cap (falls back to the monthly plan limit only).
  const dailyCap = (bot as any).dailyMessageCap ?? 0;
  if (dailyCap > 0) {
    const utcStartOfToday = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
    const lastReset = new Date((bot as any).dailyMsgsResetAt || 0);
    if (lastReset < utcStartOfToday) {
      await prisma.bot
        .update({ where: { id: bot.id }, data: { dailyMsgsUsed: 0, dailyMsgsResetAt: new Date() } as any })
        .catch(() => {});
      (bot as any).dailyMsgsUsed = 0;
    }
    if (((bot as any).dailyMsgsUsed ?? 0) >= dailyCap) {
      bump("daily_cap_hit", userId);
      return NextResponse.json({ ok: true, reply: null, blocked: "daily_cap_exhausted" });
    }
  }

  // ---- Decode media into a textual representation --------------------------
  let messageText = rawText || "";
  if (mediaType === "voice" && mediaBase64) {
    messageText = await transcribeAudio(mediaBase64, mimetype || "audio/ogg");
  } else if (mediaType === "image" && mediaBase64) {
    const desc = await describeImage(mediaBase64, mimetype || "image/jpeg", rawText || "");
    messageText = `[العميل أرسل صورة]\nوصف الصورة: ${desc}` + (rawText ? `\nتعليق العميل: ${rawText}` : "");
  }
  if (!messageText.trim()) {
    return NextResponse.json({ ok: true, reply: null });
  }

  // ---- Upsert customer + conversation --------------------------------------
  let customer = await prisma.customer.upsert({
    where: { userId_phone: { userId, phone: from.phone } },
    update: { lastSeenAt: new Date(), name: from.name ?? undefined },
    create: { userId, phone: from.phone, name: from.name ?? undefined },
  });

  // ---- Trust accrual: this customer just sent us a message -----------------
  // Bumps trustScore + engagementScore + sets firstInboundAt if null.
  // Non-fatal on failure (DB hiccup shouldn't block the bot reply).
  onInbound(customer.id).catch((e) => console.error("[trust/onInbound]", e?.message));
  // Log to safety event stream so the engine can compute a real
  // inbound:outbound ratio and grant the healthy-conversation discount.
  recordInboundReply(userId, customer.id, customer.phone).catch(() => {});

  // ---- Auto-capture: harvest real phone + name from the message body -------
  // When the contact arrived as a LID (no real phone) the bot will ask for
  // their info. If they reply with it, we upgrade the row here so future
  // broadcasts can actually reach them. Non-fatal on any failure.
  try {
    const looksLikeLid =
      typeof customer.phone === "string" &&
      (customer.phone.startsWith("lid:") || customer.phone.includes("@lid"));

    const harvestedPhone = looksLikeLid ? extractPhone(messageText) : null;
    const harvestedName =
      !customer.name || !customer.name.trim() ? extractName(messageText) : null;

    if (harvestedPhone || harvestedName) {
      const data: any = {};
      if (harvestedName) data.name = harvestedName;

      if (harvestedPhone) {
        // Respect the @@unique([userId, phone]) constraint: if another row
        // already owns the harvested phone for this merchant, we leave the
        // current row's phone alone (we'll surface a merge tool later).
        const existing = await prisma.customer.findUnique({
          where: { userId_phone: { userId, phone: harvestedPhone } },
          select: { id: true },
        });
        if (!existing) {
          data.phone = harvestedPhone;
        } else {
          console.info(
            `[wa/incoming] harvested phone ${harvestedPhone} already used by customer ${existing.id}; keeping LID row`
          );
        }
      }

      if (Object.keys(data).length > 0) {
        customer = await prisma.customer.update({
          where: { id: customer.id },
          data,
        });
        console.info(
          `[wa/incoming] upgraded customer ${customer.id}: ${JSON.stringify(data)}`
        );
      }
    }
  } catch (e: any) {
    console.warn("[wa/incoming] contact capture failed:", e?.message || e);
  }

  let conv = await prisma.conversation.findUnique({
    where: { customerId: customer.id },
    include: { messages: { orderBy: { createdAt: "asc" }, take: 30 } },
  });
  if (!conv) {
    conv = await prisma.conversation.create({
      data: { customerId: customer.id },
      include: { messages: true },
    });
  }

  const isFirstMsg = conv.messages.length === 0;
  const flagged = detectOrderIntent(messageText, bot.orderKeywords);

  // Persist the inbound message immediately so the live inbox sees it
  await prisma.message.create({
    data: {
      conversationId: conv.id,
      role: "user",
      content: messageText,
      mediaType,
      flagged,
    },
  });

  // ---- Manual takeover: admin owns this conversation -----------------------
  if ((conv as any).botPaused) {
    // Still classify in the background so dashboards stay live
    classifyAndScore({ customerId: customer.id, conversationId: conv.id, text: messageText, flagged }).catch(() => {});
    return NextResponse.json({ ok: true, reply: null, blocked: "manual_takeover" });
  }

  // ---- Out of office -------------------------------------------------------
  // Working hours are evaluated in the merchant's own timezone (Bot.timezone)
  // so a "9 AM - 9 PM" window matches Cairo time even when the VPS runs UTC.
  if (bot.workingHoursEnabled && !inWorkingHours(bot.workingHours, new Date(), (bot as any).timezone || "Africa/Cairo")) {
    const ooo = bot.outOfHoursMessage || "نحن خارج ساعات العمل حالياً. سنرد عليك في أقرب وقت.";
    await prisma.message.create({
      data: { conversationId: conv.id, role: "assistant", content: ooo },
    });
    classifyAndScore({ customerId: customer.id, conversationId: conv.id, text: messageText, flagged }).catch(() => {});
    return NextResponse.json({
      ok: true, reply: ooo, mode: "ooo",
      preDelayMs: humanCfg.enabled ? computeReadDelayMs(humanCfg) : 0,
      typingDelayMs: humanCfg.enabled ? computeTypingDelayMs(ooo, humanCfg) : 0,
    });
  }

  // ---- Stage A: Quick-reply EXACT/substring match (skip LLM, ~0 ms) -------
  const quick = matchQuickReply(messageText, bot.quickReplies || []);
  if (quick) {
    bump("quick_reply_hit", userId);
    await prisma.quickReply
      .update({ where: { id: quick.id }, data: { hits: { increment: 1 } } })
      .catch(() => {});
    await prisma.message.create({
      data: { conversationId: conv.id, role: "assistant", content: quick.reply },
    });
    await prisma.subscription
      .update({ where: { userId }, data: { msgsUsed: { increment: 1 } } })
      .catch(() => {});
    classifyAndScore({ customerId: customer.id, conversationId: conv.id, text: messageText, flagged }).catch(() => {});
    return NextResponse.json({
      ok: true, reply: quick.reply, mode: "quick_reply",
      preDelayMs: humanCfg.enabled ? computeReadDelayMs(humanCfg) : 0,
      typingDelayMs: humanCfg.enabled ? computeTypingDelayMs(quick.reply, humanCfg) : 0,
    });
  }

  // ---- Stage B: Semantic FAQ match (fuzzy, typo + dialect tolerant) ------
  // Pure local cosine on QuickReply triggers. No LLM call, no embeddings.
  // Only triggers when the customer's wording is *very close* to an admin-
  // defined trigger — guarded by a high threshold (0.62) to avoid wrong
  // replies. Quality stays bounded by admin-curated content.
  const fuzzy = fuzzyMatchQuickReplies(messageText, bot.quickReplies || [], 0.62);
  if (fuzzy) {
    bump("semantic_hit", userId);
    await prisma.quickReply
      .update({ where: { id: fuzzy.id }, data: { hits: { increment: 1 } } })
      .catch(() => {});
    await prisma.message.create({
      data: { conversationId: conv.id, role: "assistant", content: fuzzy.reply },
    });
    await prisma.subscription
      .update({ where: { userId }, data: { msgsUsed: { increment: 1 } } })
      .catch(() => {});
    classifyAndScore({ customerId: customer.id, conversationId: conv.id, text: messageText, flagged }).catch(() => {});
    return NextResponse.json({
      ok: true, reply: fuzzy.reply, mode: "semantic_faq",
      preDelayMs: humanCfg.enabled ? computeReadDelayMs(humanCfg) : 0,
      typingDelayMs: humanCfg.enabled ? computeTypingDelayMs(fuzzy.reply, humanCfg) : 0,
    });
  }

  // ---- Audit fix #6: cache lookup BEFORE prompt assembly --------------------
  // Skip all the expensive prompt-build work if we already have a cached
  // verbatim reply. cacheCandidate guards keep behavior identical to before.
  const cacheCandidate =
    !isFirstMsg &&
    mediaType === "text" &&
    typeof messageText === "string" &&
    messageText.trim().length > 0;

  let reply: string = "";
  let fromCache = false;
  if (cacheCandidate) {
    try {
      const cached = await getCached(bot.id, !!bot.cacheEnabled, messageText);
      if (cached) {
        reply = cached;
        fromCache = true;
        bump("cache_hit", userId);
      }
    } catch {
      // fall through
    }
  }

  // ---- LLM reply (only when cache miss) ------------------------------------
  // Phase 1 + audit fix #5: load memory + retrieved KB chunks in parallel.
  // We no longer stuff the entire KB into the system prompt — instead we
  // chunk + score against the customer's question and inject only the top
  // relevant pieces. Falls back gracefully to head-of-KB for short messages.
  const [knowledgeBase, memorySnap] = await Promise.all([
    fromCache ? Promise.resolve("") : retrieveRelevantKb(userId, messageText, { k: 4, charBudget: 3500 }),
    fromCache ? Promise.resolve({ summary: "", facts: {}, hasSummary: false } as any) : loadMemory(customer.id),
  ]);
  const memoryBlock = fromCache ? "" : buildMemoryBlock(memorySnap);

  // ---- Phase 2: Sales Brain (local, ≤1 ms) ---------------------------------
  // Gated on lead score + intent + the persuasionEnabled flag. Adds ≤120
  // tokens to the prompt only when a persuasion mode is actually selected.
  let salesBlock = "";
  let salesMode: string = "none";
  // Note: shouldRunSales returns true ONLY when bot.persuasionEnabled,
  // leadScore >= 30, AND the last intent is buy/inquiry. Otherwise the
  // sales engine is silently skipped — bump a metric so we can see this
  // in dashboards without surprise.
  const salesGated = shouldRunSales({
    leadScore: (customer as any).leadScore || 0,
    lastIntent: (customer as any).lastIntent,
    messageText,
    persuasionEnabled: !!bot.persuasionEnabled,
  });
  if (salesGated) {
    const signals = detectSignals(messageText);
    const negotiation = readNegotiation(memorySnap.facts);
    const psy = classifyPsychology({
      leadScore: (customer as any).leadScore || 0,
      lastIntent: (customer as any).lastIntent,
      signals,
      facts: memorySnap.facts,
      negotiation,
    });
    salesMode = chooseMode(psy, signals);
    salesBlock = buildSalesBlock(salesMode as any);
    // Observability: tally how often each sales mode fires per merchant per
    // day. Visible from /admin/metrics. Cheap (single upsert) and gives the
    // merchant feedback that the AI sales engine is actually picking modes.
    if (salesMode && salesMode !== "none") {
      bump(`sales_mode_${salesMode}`, userId);
    }
    // Persist negotiation deltas in the background — never blocks the reply.
    persistNegotiationState({
      customerId: customer.id,
      prev: negotiation,
      signals,
    }).catch(() => {});
  } else {
    // gate skip — useful to see when persuasion is OFF or score too low
    bump("sales_skipped", userId);
  }

  // Audit fix #6: only assemble the full prompt + call the LLM on cache miss.
  if (!fromCache) {
    const messages = buildMessages({
      systemPrompt: bot.systemPrompt,
      botName: bot.name,
      persona: bot.persona,
      welcomeMessage: bot.welcomeMessage,
      knowledgeBase,
      history: conv.messages.map((m) => ({ role: m.role, content: m.content })),
      newUserMsg: messageText,
      customerName: customer.name,
      customerPhone: customer.phone,
      humanize: humanCfg.enabled,
      customerPreferences: (customer as any).preferences,
      customerLeadScore: (customer as any).leadScore,
      customerLastIntent: (customer as any).lastIntent,
      persuasionEnabled: !!bot.persuasionEnabled,
      negotiationEnabled: !!bot.negotiationEnabled,
      negotiationFloorPct: bot.negotiationFloorPct ?? 10,
      memoryBlock,
      salesBlock,
      // Issue #6: per-business mode (defaults to "store" if unset)
      businessMode: (bot as any).businessMode || "store",
      // Issue #11: merchant policy rules — verbatim into prompt
      policyRules: (bot as any).policyRules || "",
    });
    try {
      reply = await llmChat(messages, {
        temperature: pickTemperature(humanCfg),
        provider: botProviderOverride(bot),
        meterUserId: userId,
      });
    } catch (e: any) {
      console.error("[wa/incoming] llmChat failed:", e?.message || e);
      reply = "عذراً، يبدو أن هناك خلل تقني مؤقت. سأعود لك خلال لحظات.";
    }
    // Cache the LLM-generated reply (best-effort). Skip the fallback error
    // string so we never serve "خلل تقني" from cache.
    if (cacheCandidate && reply && !reply.startsWith("عذراً، يبدو أن هناك خلل")) {
      setCached(
        bot.id,
        !!bot.cacheEnabled,
        bot.cacheTtlHours ?? 24,
        messageText,
        reply
      ).catch(() => {});
    }
  }

  if (isFirstMsg && bot.welcomeMessage && !reply.includes(bot.welcomeMessage.slice(0, 10))) {
    reply = `${bot.welcomeMessage}\n\n${reply}`;
  }

  // Apply humanize transforms (variation + emoji) if enabled
  const humanized = humanizeReply(reply, humanCfg, {
    intent: (customer as any).lastIntent,
    sentiment: (customer as any).lastSentiment,
    isFirstMsg,
  });
  reply = humanized.text;

  // ---- Human Realism Layer (post-humanize, pre-persist) --------------------
  // Subtle anti-repetition + natural imperfections. Skips first-msg,
  // anger/negative, complaints, greetings, and disabled-humanize bots.
  // Also produces an `energy` tag we forward to anti-ban.
  const realism = applyRealism(reply, {
    customerId: customer.id,
    intent: (customer as any).lastIntent,
    sentiment: (customer as any).lastSentiment,
    salesMode: salesMode,
    customerTone: (memorySnap as any)?.facts?.tone,
    isFirstMsg,
    humanizeEnabled: humanCfg.enabled,
  });
  reply = realism.text;

  await prisma.message.create({
    data: { conversationId: conv.id, role: "assistant", content: reply },
  });

  // Phase 1: fire-and-forget memory update. Only runs the LLM extractor
  // once every N messages (background). Never blocks the request.
  triggerMemoryUpdate({ customerId: customer.id, conversationId: conv.id }).catch(() => {});

  // Membership counters: this branch ran a real LLM call, so bump both
  // monthly message counter AND the AI requests counter. Quick-reply and
  // fuzzy-match branches above only bump msgsUsed (no LLM cost).
  await prisma.subscription
    .update({ where: { userId }, data: { msgsUsed: { increment: 1 }, aiRequestsUsed: { increment: 1 } } as any })
    .catch(() => {});

  // Daily counter (Controlled Launch). Always bumped on a successful reply.
  if (dailyCap > 0) {
    await prisma.bot
      .update({ where: { id: bot.id }, data: { dailyMsgsUsed: { increment: 1 } } as any })
      .catch(() => {});
  }

  // Realism flag — counts whenever the merchant has humanize enabled AND the
  // reply actually went through the LLM (not a cache/quick hit, those
  // returned earlier above).
  if (humanCfg.enabled) bump("realism_active", userId);

  // Audit fix #2: never await the merchant notification on the hot path —
  // it sends a downstream WA message that can take 200-800 ms.
  // Phone fallback chain: notifyPhone -> whatsappPhone -> user.phone so the
  // merchant still gets alerts even before they explicitly set notifyPhone.
  if (flagged) {
    const alertTo = bot.notifyPhone || (bot as any).whatsappPhone || null;
    if (alertTo) {
      notifyMerchant({
        userId,
        toPhone: alertTo,
        fromCustomer: { name: customer.name, phone: customer.phone },
        text: messageText,
      }).catch(() => {});
    }
  }

  // ---- Orders System: lightweight auto-extraction --------------------------
  // Triggers in two cases:
  //  1. `flagged` — message hit a payment/order keyword (existing behavior).
  //  2. The recent conversation contains a clear product + price signal even
  //     without a payment keyword. We rely on extractOrderFast() returning
  //     confidence >= 50; this catches "عاوز المنتج ده" → "السعر 250" flows
  //     where the customer never says "اوردر" but the order is real.
  // Both still write `status=pending` so the merchant reviews.
  const orderHistory = [
    ...conv.messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: messageText },
    { role: "assistant", content: reply },
  ];
  extractAndStoreOrder({
    userId,
    customerId: customer.id,
    conversationId: conv.id,
    customerName: customer.name || null,
    customerPhone: customer.phone,
    historyTail: orderHistory,
    flagged,
  }).catch((e) => console.error("[orders] extract failed:", e?.message || e));

  // ---- Fire-and-forget intelligence pipeline -------------------------------
  classifyAndScore({
    customerId: customer.id,
    conversationId: conv.id,
    text: messageText,
    flagged,
    notifyPhone: bot.alertEnabled ? (bot.notifyPhone || (bot as any).whatsappPhone || null) : null,
    alertEnabled: !!bot.alertEnabled,
    customerLabel: customer.name || customer.phone,
    userId,
    followUpsEnabled: !!bot.followUpsEnabled,
    followUpHours: bot.followUpHours || 24,
  }).catch((e) => console.error("[insights] failed:", e?.message));

  // Knowledge-gap detection: if the bot's reply looks like an "I don't know",
  // log the customer's question so the admin can fill the gap.
  if (looksLikeGap(reply)) {
    recordKnowledgeGap({
      userId,
      customerId: customer.id,
      conversationId: conv.id,
      question: messageText,
    }).catch(() => {});
  }

  // ---- Anti-Ban gate: scale delays / enforce cooldown ----------------------
  // Runs AFTER humanize but BEFORE we return delays to whatsapp-service.
  // Audit fix #8: forward priority so hot leads / impulse buyers don't wait
  // 20+ seconds while the bot pretends to type. Conversion-critical replies
  // still respect anti-ban risk gating, just with shortened delays.
  const abPriority = computePriority({
    leadScore: (customer as any).leadScore || 0,
    hasBuyStrong: salesMode === "fast_close",
    inNegotiation: salesMode === "premium" || salesMode === "trust",
    urgent: salesMode === "scarcity",
  });
  // ---- Safety Engine V2 (persistent state, warmup, kill switch) -----------
  // Replaces the in-memory anti-ban call. The engine returns the same
  // shaped reply + delays, plus durable state in the SafetyState table.
  const safety = await assessAndShape({
    userId,
    customerId: customer.id,
    customerPhone: customer.phone,
    reply,
    basePreDelayMs: humanized.preDelayMs,
    baseTypingDelayMs: humanized.typingDelayMs,
    customerInitiated: !!(customer as any).firstInboundAt || true, // incoming msg => initiated
    contactTrust: (customer as any).trustScore ?? 50,
    inboundCount1H: undefined, // could be wired later from SafetyEvent reply rows
    workingHours: bot.workingHoursEnabled ? null : null, // TODO: parse bot.workingHours JSON
    vipShortcut: salesMode === "fast_close",
    inboundLen: messageText.length,
  });

  if (safety.blocked || safety.silentSkip) {
    bump("anti_ban_cooldown", userId);
    return NextResponse.json({
      ok: true,
      reply: null,
      blocked: safety.blockedReason || "safety_blocked",
      cooldownMs: safety.cooldownMs,
      risk: safety.risk,
      riskScore: safety.riskScore,
      warmupStage: safety.warmupStage,
    });
  }

  return NextResponse.json({
    ok: true,
    reply: safety.text,
    preDelayMs: safety.preDelayMs,
    typingDelayMs: safety.typingDelayMs,
    risk: safety.risk,
    riskScore: safety.riskScore,
    warmupStage: safety.warmupStage,
  });
}

async function recordKnowledgeGap(args: {
  userId: string;
  customerId: string;
  conversationId: string;
  question: string;
}) {
  // Look at last 30 days of unresolved gaps for this user; cluster duplicates.
  const recent = await prisma.knowledgeGap.findMany({
    where: {
      userId: args.userId,
      resolved: false,
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
    },
    take: 200,
    orderBy: { createdAt: "desc" },
  });
  for (const g of recent) {
    if (questionSimilarity(g.question, args.question) >= 0.6) {
      await prisma.knowledgeGap.update({
        where: { id: g.id },
        data: { occurrences: { increment: 1 } },
      });
      return;
    }
  }
  await prisma.knowledgeGap.create({
    data: {
      userId: args.userId,
      customerId: args.customerId,
      conversationId: args.conversationId,
      question: args.question.slice(0, 500),
    },
  });
}

// ---------------------------------------------------------------------------
// Background analytics: classify, score, save tags, anger-alert, schedule
// follow-up. Errors here never break the user reply.
// ---------------------------------------------------------------------------
async function classifyAndScore(args: {
  customerId: string;
  conversationId: string;
  text: string;
  flagged: boolean;
  notifyPhone?: string | null;
  alertEnabled?: boolean;
  customerLabel?: string | null;
  userId?: string;
  followUpsEnabled?: boolean;
  followUpHours?: number;
}) {
  const c = await classify(args.text);

  // Save sentiment + intent on the latest message we just inserted
  const latestUserMsg = await prisma.message.findFirst({
    where: { conversationId: args.conversationId, role: "user" },
    orderBy: { createdAt: "desc" },
  });
  if (latestUserMsg) {
    await prisma.message
      .update({
        where: { id: latestUserMsg.id },
        data: { intent: c.intent, sentiment: c.sentiment },
      })
      .catch(() => {});
  }

  // Aggregate for lead score
  const cust = await prisma.customer.findUnique({
    where: { id: args.customerId },
    include: {
      conversation: {
        select: {
          messages: { select: { flagged: true, createdAt: true, role: true } },
        },
      },
    },
  });
  if (!cust) return;

  const allMsgs = cust.conversation?.messages || [];
  const total = allMsgs.length;
  const firstAt = allMsgs[0]?.createdAt || cust.createdAt;
  const daysSinceFirst =
    Math.max(0, (Date.now() - new Date(firstAt).getTime()) / (1000 * 60 * 60 * 24));
  const flaggedHistorical = allMsgs.filter((m) => m.flagged).length;

  const score = scoreLead({
    totalMessages: total,
    daysSinceFirstContact: daysSinceFirst,
    lastMessageText: args.text,
    hasBuyIntent: c.intent === "buy",
    sentiment: c.sentiment,
    flaggedOrderMessages: flaggedHistorical,
  });

  // Merge new tags into existing (cap at 8)
  let existing: string[] = [];
  try {
    existing = JSON.parse((cust as any).tags || "[]");
  } catch {}
  const merged = Array.from(new Set([...existing, ...c.tags])).slice(0, 8);

  // Decide follow-up: schedule only if buyer-ish but didn't yet say "paid",
  // and feature is enabled, and they haven't gotten one queued/sent.
  let followUpAt: Date | null = null;
  if (
    args.followUpsEnabled &&
    (c.intent === "buy" || c.intent === "inquiry") &&
    !args.flagged &&
    !(cust as any).followUpSent
  ) {
    const hours = args.followUpHours && args.followUpHours > 0 ? args.followUpHours : 24;
    followUpAt = new Date(Date.now() + hours * 60 * 60 * 1000);
  }

  await prisma.customer
    .update({
      where: { id: args.customerId },
      data: {
        leadScore: score,
        lastIntent: c.intent,
        lastSentiment: c.sentiment,
        tags: JSON.stringify(merged),
        ...(followUpAt ? { followUpAt, followUpSent: false } : {}),
      } as any,
    })
    .catch(() => {});

  // ---- Anger / escalation alert -----------------------------------------
  // Falls through the phone-resolution chain when notifyPhone wasn't supplied
  // by the caller — keeps the alert from being lost when the merchant hasn't
  // yet configured a dedicated notification number. Every escalation (whether
  // delivered or not) writes a SafetyAudit row so the merchant can see the
  // event in /dashboard/safety even if the WhatsApp delivery failed.
  if (
    args.userId &&
    args.alertEnabled !== false &&
    (c.sentiment === "angry" || c.sentiment === "negative" || c.intent === "complaint")
  ) {
    const isAnger = c.sentiment === "angry";
    const isEscalation = isAnger || c.intent === "complaint";
    // Audit row first — never depends on WhatsApp delivery succeeding.
    await prisma.safetyAudit.create({
      data: {
        userId: args.userId,
        level: isAnger ? "critical" : "warn",
        category: "anger",
        title: isAnger ? "عميل غاضب — تنبيه فوري" : (isEscalation ? "شكوى/تصعيد" : "عميل غير راضٍ"),
        detail: `العميل: ${args.customerLabel || "غير معروف"} — "${args.text.slice(0, 200)}"`,
        payload: JSON.stringify({
          customerId: args.customerId,
          sentiment: c.sentiment,
          intent: c.intent,
          leadScore: score,
        }),
      },
    }).catch(() => {});

    const alertTo = args.notifyPhone || (await resolveNotifyPhone(args.userId));
    if (alertTo) {
      const head = isAnger
        ? "🚨 عميل غاضب — يحتاج تدخل فوري"
        : (isEscalation ? "⚠️ شكوى/تصعيد" : "⚠️ عميل غير راضٍ");
      const text =
        `${head}\n\n` +
        `العميل: ${args.customerLabel || "غير معروف"}\n` +
        `النية: ${c.intent}\n` +
        `الحالة: ${c.sentiment}\n` +
        `الرسالة:\n"${args.text.slice(0, 400)}"\n\n` +
        `Lead score: ${score}/100`;
      await notifyAdmin({
        userId: args.userId,
        toPhone: alertTo,
        text,
        category: "anger",
      }).catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// Phase 2 — persist negotiation deltas inside CustomerMemory.factsJson.
// Background only. Backward-compatible: if no memory row exists, create one
// with just the negotiation slice; otherwise merge into existing facts.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Orders System — fast regex extraction + persist. Background only.
// ---------------------------------------------------------------------------
async function extractAndStoreOrder(args: {
  userId: string;
  customerId: string;
  conversationId: string;
  customerName: string | null;
  customerPhone: string;
  historyTail: { role: string; content: string }[];
  flagged?: boolean;
}) {
  try {
    const draft = extractOrderFast({
      messages: args.historyTail,
      fallbackCustomerName: args.customerName,
      fallbackCustomerPhone: args.customerPhone,
    });

    // Confidence floor: a non-flagged extraction needs at least decent
    // signal (product name + price OR phone, e.g. >= 50). Flagged messages
    // get the old permissive path so payment-keyword flows still create a
    // pending order even with weak metadata.
    if (!args.flagged && draft.confidence < 50) {
      return;
    }

    // De-dup hardening — the previous version compared on `total` and a
    // 30-min window, but if the customer keeps elaborating the same order
    // ("ايوة موافق", "تمام ابعتها") the extracted total could drift slightly
    // and create multiple pending orders. Now we enforce: ONE pending order
    // per customer at a time, scoped to a 6-hour window. The merchant can
    // mark it confirmed/canceled to release the slot for a new one.
    const cutoff = new Date(Date.now() - 6 * 60 * 60_000); // 6h window
    const existing = await (prisma as any).order.findFirst({
      where: {
        userId: args.userId,
        customerId: args.customerId,
        status: "pending",
        createdAt: { gte: cutoff },
      },
      select: { id: true, total: true, discount: true, subtotal: true },
    });
    if (existing) {
      // If the draft uncovered a discount or a different price the existing
      // order doesn't have, update it in-place instead of creating a duplicate.
      // This keeps the merchant's view canonical and lets late-arriving
      // discount info land on the correct row.
      const needsUpdate =
        (draft.discount > 0 && draft.discount !== existing.discount) ||
        (draft.subtotal > 0 && draft.subtotal !== existing.subtotal) ||
        (draft.total > 0 && draft.total !== existing.total);
      if (needsUpdate) {
        await (prisma as any).order.update({
          where: { id: existing.id },
          data: {
            subtotal: draft.subtotal,
            discount: draft.discount,
            total: draft.total,
            paymentMethod: draft.paymentMethod || undefined,
            shippingAddress: draft.shippingAddress || undefined,
            timeline: {
              create: {
                kind: "ai_extracted",
                message: `تحديث تلقائي: ${draft.discount > 0 ? `خصم ${draft.discount} — ` : ""}الإجمالي ${draft.total}.`,
                payload: JSON.stringify({ confidence: draft.confidence, source: "merge" }),
              },
            },
          },
        }).catch(() => {});
      }
      return;
    }

    bump("order_extracted", args.userId);

    const order = await (prisma as any).order.create({
      data: {
        userId: args.userId,
        customerId: args.customerId,
        conversationId: args.conversationId,
        customerName: draft.customerName || args.customerName || null,
        customerPhone: draft.customerPhone || args.customerPhone,
        shippingAddress: draft.shippingAddress || null,
        subtotal: draft.subtotal,
        shipping: draft.shipping,
        discount: draft.discount,
        total: draft.total,
        currency: draft.currency,
        paymentMethod: draft.paymentMethod || null,
        status: "pending",
        fulfillmentStatus: "unfulfilled",
        aiConfidence: draft.confidence,
        aiNotes: draft.notes,
        source: "auto",
        items: {
          create: draft.items.map((it) => ({
            name: it.name,
            size: it.size || null,
            color: it.color || null,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            lineTotal: it.lineTotal,
          })),
        },
        timeline: {
          create: [
            { kind: "created",       message: "تم إنشاء الطلب تلقائياً من المحادثة." },
            { kind: "ai_extracted",  message: draft.notes, payload: JSON.stringify({ confidence: draft.confidence }) },
          ],
        },
      },
    });

    // Notify the merchant when the order looks confident enough.
    return order;
  } catch (e: any) {
    // Persist + log so the merchant can see in SafetyAudit why an order
    // wasn't created. Previously this was a silent `catch {}` and orders
    // could vanish without any signal.
    console.error("[orders] persist failed:", e?.message || e);
    try {
      await prisma.safetyAudit.create({
        data: {
          userId: args.userId,
          level: "warn",
          category: "orders",
          title: "تعذّر حفظ طلب تلقائي",
          detail: String(e?.message || e).slice(0, 400),
          payload: JSON.stringify({
            customerId: args.customerId,
            customerPhone: args.customerPhone,
          }),
        },
      });
    } catch { /* swallow audit failure */ }
  }
}

async function persistNegotiationState(args: {
  customerId: string;
  prev: import("@/lib/sales-engine").NegotiationState;
  signals: import("@/lib/sales-engine").SalesSignals;
}) {
  const next = applySignalsToNegotiation(args.prev, args.signals);

  try {
    const row = await (prisma as any).customerMemory.findUnique({
      where: { customerId: args.customerId },
    });
    let facts: any = {};
    if (row?.factsJson) {
      try { facts = JSON.parse(row.factsJson); } catch {}
    }
    facts.negotiation = next;
    const factsJson = JSON.stringify(facts);

    if (!row) {
      await (prisma as any).customerMemory.create({
        data: { customerId: args.customerId, factsJson, summary: "" },
      });
    } else {
      await (prisma as any).customerMemory.update({
        where: { customerId: args.customerId },
        data: { factsJson },
      });
    }
  } catch {
    // best-effort; never throw on the hot path
  }
}
