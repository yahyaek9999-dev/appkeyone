// Safety Engine — single entry point for the WhatsApp incoming/outgoing
// hot path. Replaces the call to lib/anti-ban.ts:assessOutbound().
//
// Flow:
//   1. checkWarmup() to ensure stage is correct
//   2. aggregateRecent() builds the rolling-window stats from SafetyEvent
//   3. detectPatterns() returns extra risk weight from spam-bot tells
//   4. assessRisk() maps everything to a level + cooldown + delay multiplier
//   5. applyHumanizeV2() final-shapes text + delays
//   6. checkAutoKill() may engage the global kill switch
//   7. logEvent("send"|"failure") persists the action
//
// Fail-open: any DB hiccup falls back to "low risk + small delay" so the
// bot never goes silent because of an internal error.
import {
  loadState, patchState, incrementCounters,
  aggregateRecent, hashReply, logEvent, audit,
} from "./store";
import { checkWarmup } from "./warmup";
import { assessRisk, type RiskLevel } from "./risk";
import { detectPatterns, totalPatternWeight } from "./patterns";
import { applyHumanizeV2 } from "./humanize-v2";
import { checkAutoKill } from "./kill-switch";

export interface AssessInput {
  userId: string;
  customerId?: string | null;
  customerPhone: string;
  reply: string;
  basePreDelayMs: number;
  baseTypingDelayMs: number;
  /** True if this customer sent us a message first (recommended majority case). */
  customerInitiated: boolean;
  /** 0-100, from Customer row. */
  contactTrust: number;
  /** Inbound count over the last hour for this user (for imbalance detection). */
  inboundCount1H?: number;
  /** Customer's local hour if we know it; else undefined. */
  customerLocalHour?: number;
  /** Bot's working hours (server-local) if configured. */
  workingHours?: { from: number; to: number } | null;
  /** True if VIP / hot lead — softens delays. */
  vipShortcut?: boolean;
  /** Length of the inbound msg, used for response-length variability. */
  inboundLen?: number;
}

export interface AssessOutput {
  text: string;
  preDelayMs: number;
  typingDelayMs: number;
  blocked: boolean;
  blockedReason?: string;
  cooldownMs: number;
  risk: RiskLevel;
  riskScore: number;
  reasons: string[];
  warmupStage: string;
  silentSkip: boolean;
}

const FALLBACK: Pick<AssessOutput, "text" | "preDelayMs" | "typingDelayMs" | "blocked" | "cooldownMs" | "risk" | "riskScore" | "reasons" | "warmupStage" | "silentSkip"> = {
  text: "",
  preDelayMs: 800,
  typingDelayMs: 1500,
  blocked: false,
  cooldownMs: 0,
  risk: "low",
  riskScore: 0,
  reasons: ["fallback_engine_error"],
  warmupStage: "day1",
  silentSkip: false,
};

export async function assessAndShape(i: AssessInput): Promise<AssessOutput> {
  try {
    const { state, limits } = await checkWarmup(i.userId);

    // --- Hard blocks first ----------------------------------------------------
    if (state.killSwitchActive) {
      return {
        ...FALLBACK,
        text: i.reply,
        blocked: true,
        blockedReason: "kill_switch_active:" + (state.killSwitchReason || ""),
        cooldownMs: 24 * 3_600_000,
        risk: "kill_all",
        riskScore: 100,
        reasons: ["kill_switch_active"],
        warmupStage: state.warmupStage,
      };
    }
    if (state.cooldownUntil && new Date(state.cooldownUntil).getTime() > Date.now()) {
      return {
        ...FALLBACK,
        text: i.reply,
        blocked: true,
        blockedReason: "cooldown_active",
        cooldownMs: new Date(state.cooldownUntil).getTime() - Date.now(),
        risk: "cooldown",
        riskScore: 80,
        reasons: ["cooldown_active"],
        warmupStage: state.warmupStage,
      };
    }
    // Warmup stage forbids cold outbound but customer didn't initiate? Block.
    if (limits.replyOnly && !i.customerInitiated) {
      await audit("warn", "warmup", "محاولة إرسال بارد محجوبة (وضع الإحماء)", {
        userId: i.userId,
        detail: `المرحلة ${limits.stage} تسمح فقط بالردود على الرسائل الواردة`,
      });
      return {
        ...FALLBACK,
        text: i.reply,
        blocked: true,
        blockedReason: "warmup_reply_only",
        cooldownMs: 0,
        risk: "elevated",
        riskScore: 50,
        reasons: ["warmup_reply_only"],
        warmupStage: state.warmupStage,
      };
    }

    // --- Gather recent stats -------------------------------------------------
    const recent = await aggregateRecent(i.userId, [i.customerPhone]);
    const replyHash = hashReply(i.reply);

    // --- Smart recovery: if a cooldown JUST ended, give the bot credit
    //     (gentle score reduction + reset failure counters). This prevents
    //     the system from immediately re-cooling on the first send post-rest.
    if (
      state.cooldownUntil &&
      new Date(state.cooldownUntil).getTime() <= Date.now() &&
      state.riskScore >= 50
    ) {
      const newScore = Math.max(20, state.riskScore - 25);
      await patchState(i.userId, {
        riskScore: newScore,
        riskUpdatedAt: new Date(),
        cooldownUntil: null,
        recentFailures: Math.max(0, state.recentFailures - 3),
      } as any);
      state.riskScore = newScore;
      state.cooldownUntil = null;
    }

    // --- Pattern detection adds weight to risk ------------------------------
    //     Pulls REAL inbound count from the aggregate instead of trusting
    //     the caller (which historically passed 0 → false outbound_imbalance).
    const patternHits = detectPatterns({
      recentReplyHashes: recent.recentReplyHashes,
      currentReplyHash: replyHash,
      sends1Min: recent.sends1Min,
      sends10Min: recent.sends10Min,
      sends1Hour: recent.sends1Hour,
      inboundCount1H: recent.inbound1Hour,
      outboundCount1H: recent.sends1Hour,
      uniqueRecipients10Min: recent.uniqueRecipients10Min,
      hourOfDay: new Date().getHours(),
    });
    const patternWeight = totalPatternWeight(patternHits);

    // --- Risk assessment -----------------------------------------------------
    const risk = assessRisk({
      state: { ...state, riskScore: state.riskScore + patternWeight },
      recent,
      customerPhone: i.customerPhone,
      replyHash,
      customerInitiated: i.customerInitiated,
      contactTrust: i.contactTrust,
    });
    const allReasons = [...risk.reasons, ...patternHits.map((p) => p.name)];

    // --- Soft-cooldown for healthy customer replies -------------------------
    //     If the only thing pushing us into "cooldown" is volume/burst and the
    //     current event is a REPLY to a customer with no spam-like failures,
    //     downgrade to slow_mode (heavy delay) instead of hard-blocking. This
    //     prevents the bot from going silent on real conversations and keeps
    //     customer response times reasonable. Never softens emergency/kill.
    const softenable =
      risk.level === "cooldown" &&
      i.customerInitiated &&
      (recent.spamFailures1Hour ?? 0) < 2 &&
      !risk.exceededStageDaily &&
      !risk.shouldKill;
    if (softenable) {
      await audit("info", "anti_ban", "تخفيف التبريد لرد على عميل نشط", {
        userId: i.userId,
        detail: `score=${risk.score} reasons=${allReasons.slice(0, 4).join(",")}`,
        payload: { score: risk.score, reasons: allReasons.slice(0, 6) },
      });
      // Treat as slow_mode: keep score, skip DB cooldown, add heavy delay.
      risk.cooldownMs = 0;
      risk.level = "slow_mode";
      risk.delayMultiplier = Math.max(risk.delayMultiplier, 3.2);
      allReasons.push("cooldown_softened_for_inbound");
    }

    // --- Cooldown / emergency stop ------------------------------------------
    if (risk.cooldownMs > 0) {
      const cooldownUntil = new Date(Date.now() + risk.cooldownMs);
      await patchState(i.userId, {
        cooldownUntil,
        riskScore: risk.score,
        riskUpdatedAt: new Date(),
        totalCooldowns: { increment: 1 } as any,
      } as any);
      await logEvent(i.userId, "cooldown", {
        customerId: i.customerId,
        phone: i.customerPhone,
        riskScore: risk.score,
        payload: { reasons: allReasons, ms: risk.cooldownMs, level: risk.level },
      });
      if (risk.level === "emergency_stop" || risk.level === "kill_all") {
        await audit("critical", "anti_ban", `إيقاف طارئ — مستوى ${risk.level}`, {
          userId: i.userId,
          detail: allReasons.slice(0, 6).join(", "),
          payload: { score: risk.score },
        });
      }
      // Engage kill switch automatically on extreme conditions. Now uses
      // spam-only failure count + 10-min reconnect window + stage.
      await checkAutoKill(i.userId, {
        spamFailures1Hour: recent.spamFailures1Hour,
        reconnects10Min: recent.reconnects10Min,
        riskScore: risk.score,
        warmupStage: state.warmupStage,
      });
      return {
        text: i.reply,
        preDelayMs: 0,
        typingDelayMs: 0,
        blocked: true,
        blockedReason: `cooldown:${risk.level}`,
        cooldownMs: risk.cooldownMs,
        risk: risk.level,
        riskScore: risk.score,
        reasons: allReasons,
        warmupStage: state.warmupStage,
        silentSkip: false,
      };
    }

    // --- Apply Humanize V2 ---------------------------------------------------
    const shaped = applyHumanizeV2(i.reply, i.basePreDelayMs, i.baseTypingDelayMs, {
      localHour: i.customerLocalHour,
      vipShortcut: i.vipShortcut,
      inboundLen: i.inboundLen,
      casualness: 0.2,
      workingHours: i.workingHours,
      customerInitiated: i.customerInitiated,
    });

    if (shaped.silentSkip) {
      return {
        text: i.reply,
        preDelayMs: 0,
        typingDelayMs: 0,
        blocked: true,
        blockedReason: "silent:" + (shaped.reason || ""),
        cooldownMs: 0,
        risk: risk.level,
        riskScore: risk.score,
        reasons: [...allReasons, "silent_" + (shaped.reason || "")],
        warmupStage: state.warmupStage,
        silentSkip: true,
      };
    }

    // Apply risk multiplier on top of humanize-v2 delays
    const preDelay = Math.min(15_000, Math.round(shaped.preDelayMs * risk.delayMultiplier));
    const typingDelay = Math.min(20_000, Math.round(shaped.typingDelayMs * risk.delayMultiplier));

    // --- Commit state --------------------------------------------------------
    await incrementCounters(
      i.userId,
      {
        dailySends: 1, hourlySends: 1, totalSends: 1,
        // Risk score: keep highest of decayed-existing vs new-assessed
      },
      {
        riskScore: Math.max(state.riskScore, risk.score),
        riskUpdatedAt: new Date(),
        lastSendAt: new Date(),
      } as any
    );
    await logEvent(i.userId, "send", {
      customerId: i.customerId,
      phone: i.customerPhone,
      replyHash,
      riskScore: risk.score,
      payload: { reasons: allReasons.slice(0, 6), level: risk.level },
    });

    return {
      text: shaped.text,
      preDelayMs: preDelay,
      typingDelayMs: typingDelay,
      blocked: false,
      cooldownMs: 0,
      risk: risk.level,
      riskScore: risk.score,
      reasons: allReasons,
      warmupStage: state.warmupStage,
      silentSkip: false,
    };
  } catch (err: any) {
    console.error("[safety/engine] error, falling back open:", err?.message || err);
    return { ...FALLBACK, text: i.reply };
  }
}

/** Classify a raw error string into a category the engine understands. */
function classifyFailure(reason: string): "blocked" | "rate_limit" | "not_registered" | "technical" {
  const r = (reason || "").toLowerCase();
  if (r.includes("block") || r.includes("forbidden")) return "blocked";
  if (r.includes("rate") || r.includes("429") || r.includes("too many")) return "rate_limit";
  if (r.includes("not registered") || r.includes("invalid") || r.includes("unknown")) return "not_registered";
  return "technical";
}

/**
 * Called by whatsapp-service when a send fails. The kind argument lets the
 * engine distinguish technical infra hiccups (timeouts, ECONNRESET) from
 * spam-like signals (blocks, rate-limits) so it doesn't punish legit accounts
 * during a network blip.
 */
export async function recordFailure(
  userId: string,
  customerId: string | null,
  phone: string,
  reason: string,
  kindOverride?: "blocked" | "rate_limit" | "not_registered" | "technical"
): Promise<void> {
  try {
    const kind = kindOverride || classifyFailure(reason);
    const isSpamLike = kind === "blocked" || kind === "rate_limit";
    // Tech failures bump risk by only 2; spam-like by 8.
    const riskBump = isSpamLike ? 8 : 2;
    await incrementCounters(userId, {
      totalFailures: 1,
      recentFailures: 1,
      riskScore: riskBump,
    });
    await logEvent(userId, "failure", {
      customerId,
      phone,
      payload: {
        reason,
        kind: isSpamLike ? "spam" : (kind === "not_registered" ? "not_registered" : "technical"),
      },
    });
    if (isSpamLike) {
      const state = await loadState(userId);
      const recent = await aggregateRecent(userId);
      await checkAutoKill(userId, {
        spamFailures1Hour: recent.spamFailures1Hour,
        reconnects10Min: recent.reconnects10Min,
        riskScore: state.riskScore,
        warmupStage: state.warmupStage,
      });
    }
  } catch (e) {
    console.error("[safety/engine] recordFailure", e);
  }
}

/**
 * Called by whatsapp-service on a reconnect cycle. Healthy WhatsApp sessions
 * legitimately reconnect every few hours; we only react to *bursts* of
 * reconnects (3+ in 10 minutes), not to isolated ones.
 */
export async function recordReconnect(userId: string): Promise<void> {
  try {
    // Don't bump risk score for normal reconnects; the storm is detected
    // through the 10-min event window.
    await incrementCounters(userId, { recentReconnects: 1 });
    await logEvent(userId, "reconnect", {});
    const recent = await aggregateRecent(userId);
    if ((recent.reconnects10Min || 0) >= 4) {
      const state = await loadState(userId);
      await checkAutoKill(userId, {
        spamFailures1Hour: recent.spamFailures1Hour,
        reconnects10Min: recent.reconnects10Min,
        riskScore: state.riskScore,
        warmupStage: state.warmupStage,
      });
    }
  } catch {}
}

/** Called when an inbound customer message arrives. Used by the imbalance
 *  check + healthy-conversation discount. Cheap append-only log. */
export async function recordInboundReply(
  userId: string,
  customerId: string | null,
  phone: string
): Promise<void> {
  try {
    await logEvent(userId, "reply", { customerId, phone });
  } catch {}
}
