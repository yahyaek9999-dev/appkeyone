// Risk Engine V2 — 5-level rolling risk score with persistent state.
// Replaces the simpler scoring in lib/anti-ban.ts.
//
// Inputs come from store.aggregateRecent() + the bot's SafetyState row.
// Output drives the action: low → send normally; slow → +200% delays;
// cooldown → refuse for N min; emergency → block + audit; kill → off.
import type { SafetyStateRow, RecentSendsAggregate } from "./store";
import { getStageLimits } from "./warmup";

export type RiskLevel = "low" | "elevated" | "slow_mode" | "cooldown" | "emergency_stop" | "kill_all";

export interface RiskInput {
  state: SafetyStateRow;
  recent: RecentSendsAggregate;
  customerPhone: string;
  replyHash: string;
  /** Whether the inbound conversation came from the customer first. */
  customerInitiated: boolean;
  /** Customer-level trust 0-100 (from Customer.trustScore). */
  contactTrust: number;
}

export interface RiskAssessment {
  level: RiskLevel;
  score: number;
  reasons: string[];
  delayMultiplier: number;
  /** ms to refuse outbound. 0 = OK. */
  cooldownMs: number;
  /** When true the kill switch must engage. */
  shouldKill: boolean;
  /** Per-stage daily ceiling check. */
  exceededStageDaily: boolean;
}

const SHORT_INTERVAL_MS = 1500;

// Stage-aware threshold offset. Mature trusted accounts get more headroom
// before triggering cooldowns. Day-1 accounts use the original strict cuts.
function stageThresholdOffset(stage: string): number {
  switch (stage) {
    case "day1":   return 0;
    case "day2_3": return 3;
    case "day4_5": return 6;
    case "day6_7": return 8;
    case "week2":  return 10;
    case "mature": return 12;
    default:       return 0;
  }
}

export function assessRisk(input: RiskInput): RiskAssessment {
  const { state, recent, customerPhone, replyHash, customerInitiated, contactTrust } = input;
  const reasons: string[] = [];
  let score = state.riskScore; // start from rolling score (decayed)

  const stageLimits = getStageLimits(state.warmupStage);
  const offset = stageThresholdOffset(state.warmupStage);
  const isMature = state.warmupStage === "mature" || state.warmupStage === "week2";
  const trustyBot = state.trustScore >= 60 && isMature;

  // --- Stage caps -----------------------------------------------------------
  const exceededStageDaily = state.dailySends >= stageLimits.maxDaily;
  if (exceededStageDaily) {
    score += 40;
    reasons.push(`stage_daily_cap_${stageLimits.stage}`);
  } else if (state.dailySends >= stageLimits.maxDaily * 0.85) {
    score += 12;
    reasons.push("near_stage_daily_cap");
  }

  if (state.hourlySends >= stageLimits.maxHourly) {
    score += 25;
    reasons.push("hourly_cap_hit");
  }

  if (recent.uniqueRecipients10Min > stageLimits.maxNewChats10Min) {
    score += 22;
    reasons.push("fanout_too_wide");
  }

  // --- Burst detection (relaxed for mature; floor at 5/min so legit
  //     conversation bursts don't false-trigger). -------------------------
  const burstMinThreshold = Math.max(5, Math.floor(stageLimits.maxHourly / (isMature ? 3 : 4)));
  const nearBurstThreshold = Math.max(4, Math.floor(stageLimits.maxHourly / 6));
  if (recent.sends1Min >= burstMinThreshold) {
    score += isMature ? 20 : 30; reasons.push("burst_1min");
  } else if (recent.sends1Min >= nearBurstThreshold) {
    score += 8; reasons.push("near_burst_1min");
  }
  if (recent.sends10Min >= stageLimits.maxHourly * (isMature ? 2 : 1.5)) {
    score += 15; reasons.push("burst_10min");
  }

  // --- Same customer rapid fire --------------------------------------------
  const lastToCustomer = recent.lastSendToCustomerAt.get(customerPhone);
  if (lastToCustomer && Date.now() - lastToCustomer < SHORT_INTERVAL_MS) {
    score += 18; reasons.push("rapid_same_customer");
  }

  // --- Repetition detection (similarity). Relaxed: 1-on-1 chat replies
  //     can legitimately repeat short answers ("تمام", "حاضر"). ------------
  const dupCount = recent.recentReplyHashes.filter((h) => h === replyHash).length;
  if (dupCount >= 4) { score += 24; reasons.push("repeated_replies"); }
  else if (dupCount >= 3) { score += 10; reasons.push("near_repetition"); }

  // --- Cold outbound risk ---------------------------------------------------
  if (!customerInitiated && stageLimits.replyOnly) {
    // We must NOT cold-send during early warmup.
    score += 60;
    reasons.push("warmup_reply_only_violation");
  } else if (!customerInitiated && contactTrust < 30) {
    score += 14;
    reasons.push("cold_outbound_low_trust");
  }

  // --- Failure feedback. Use SPAM-LIKE failures (block / rate-limit), not
  //     technical ones (network timeout). Aggregate's spamFailures1Hour. --
  const spamFails = recent.spamFailures1Hour ?? 0;
  const techFails = recent.techFailures1Hour ?? 0;
  if (spamFails >= 6) { score += 35; reasons.push("many_spam_failures_1h"); }
  else if (spamFails >= 3) { score += 16; reasons.push("some_spam_failures_1h"); }
  // Tech failures barely move the needle; they signal infra, not policy.
  if (techFails >= 10) { score += 6; reasons.push("infra_unstable"); }

  // Reconnects: only the *short-window* burst counts as a storm.
  const reconnects10 = recent.reconnects10Min ?? 0;
  if (reconnects10 >= 4) { score += 25; reasons.push("reconnect_storm"); }
  else if (reconnects10 >= 3) { score += 8; reasons.push("frequent_reconnects"); }
  // Hourly count of 1-2 reconnects is normal; ignore.

  // --- Time of day. Only deep-night cold outbound is risky. Replies to
  //     incoming messages at any hour are fine. --------------------------
  const h = new Date().getHours();
  if (!customerInitiated && h >= 1 && h <= 5) {
    score += 8; reasons.push("late_night_cold");
  }

  // --- Healthy-conversation discount: bot is replying to engaged customers,
  //     not blasting cold outbound. Reduces risk for normal chat usage. ---
  const inbound1H = recent.inbound1Hour ?? 0;
  if (inbound1H > 0 && recent.sends1Hour > 0) {
    const ratio = inbound1H / recent.sends1Hour; // 1.0 = balanced
    if (ratio >= 0.7) { score -= 15; reasons.push("healthy_chat_balanced"); }
    else if (ratio >= 0.4) { score -= 8; reasons.push("healthy_chat_partial"); }
  }

  // --- Trust discount: mature + trusted bot earns headroom. ---------------
  if (trustyBot) {
    score -= Math.min(15, Math.floor(state.trustScore / 6));
    reasons.push("trust_discount");
  }
  // Per-customer trust also reduces same-customer / cold-outbound penalties.
  if (contactTrust >= 70) {
    score -= 5; reasons.push("contact_trusted");
  }

  // Direct reply to a customer-initiated chat is the safest action a bot can
  // take. Apply a small, additive discount so genuine conversations rarely
  // trip the cooldown threshold from volume alone.
  if (customerInitiated) {
    score -= 4;
    reasons.push("inbound_reply_discount");
  }

  // --- Already in cooldown? -------------------------------------------------
  const inCooldown = state.cooldownUntil && new Date(state.cooldownUntil).getTime() > Date.now();
  if (inCooldown) {
    return {
      level: "cooldown",
      score: Math.max(75, Math.min(100, score)),
      reasons: ["active_cooldown", ...reasons],
      delayMultiplier: 1,
      cooldownMs: new Date(state.cooldownUntil!).getTime() - Date.now(),
      shouldKill: false,
      exceededStageDaily,
    };
  }
  // Kill switch already engaged?
  if (state.killSwitchActive) {
    return {
      level: "kill_all", score: 100,
      reasons: ["kill_switch_active", ...reasons],
      delayMultiplier: 1, cooldownMs: 24 * 3_600_000,
      shouldKill: true, exceededStageDaily,
    };
  }

  // Clamp
  score = Math.max(0, Math.min(100, score));

  // --- Map score → level. Adaptive thresholds: mature/trusted accounts
  //     get more breathing room before each escalation step. Gradual
  //     escalation prevents jumping from "low" straight to "cooldown". --
  let level: RiskLevel = "low";
  let delayMultiplier = 1.0 + Math.random() * 0.15;
  let cooldownMs = 0;
  let shouldKill = false;

  const tKill      = 95 + offset;  // ~107 for mature → effectively unreachable without spam fails
  const tEmergency = 88 + offset;
  const tCooldown  = 78 + offset;
  const tSlow      = 62 + offset;
  const tElevated  = 40 + offset;

  if (score >= tKill) {
    level = "kill_all";
    shouldKill = true;
    cooldownMs = 6 * 3_600_000;
  } else if (score >= tEmergency && spamFails >= 3) {
    // Emergency stop now requires spam-like failures, not just score.
    level = "emergency_stop";
    cooldownMs = 20 * 60_000 + Math.floor(Math.random() * 20 * 60_000);
  } else if (score >= tCooldown) {
    // Gradual escalation: require corroborating signal before a real cooldown
    // (spam fails, burst, fanout, repetition, or stage cap). Otherwise stay
    // in slow_mode and let the rolling score decay naturally.
    const corroborated =
      spamFails >= 2 ||
      recent.sends1Min >= burstMinThreshold ||
      recent.uniqueRecipients10Min > stageLimits.maxNewChats10Min ||
      dupCount >= 4 ||
      exceededStageDaily ||
      state.hourlySends >= stageLimits.maxHourly;
    if (corroborated) {
      level = "cooldown";
      // Shorter cooldowns; auto-recovery handles the rest.
      cooldownMs = Math.min(stageLimits.cooldownAfterDailyMs / 6, 30 * 60_000) + Math.floor(Math.random() * 60_000);
    } else {
      level = "slow_mode";
      delayMultiplier = 2.6 + Math.random() * 0.8;
      reasons.push("slow_mode_uncorroborated");
    }
  } else if (score >= tSlow) {
    level = "slow_mode";
    delayMultiplier = 2.0 + Math.random() * 0.8;
  } else if (score >= tElevated) {
    level = "elevated";
    delayMultiplier = 1.4 + Math.random() * 0.3;
  }

  // Stage daily cap forces an immediate rest if exceeded.
  if (exceededStageDaily && cooldownMs === 0) {
    cooldownMs = stageLimits.cooldownAfterDailyMs;
    if (level === "low" || level === "elevated") level = "cooldown";
  }

  return { level, score, reasons, delayMultiplier, cooldownMs, shouldKill, exceededStageDaily };
}
