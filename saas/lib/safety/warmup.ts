// Warmup Engine. Caps a brand-new account's outbound volume so WhatsApp
// doesn't flag it for sudden activity spikes. Operates in 5 stages keyed
// off the warmupStartedAt timestamp on SafetyState.
//
// Every stage advance is logged to the audit table for the dashboard.
import { loadState, patchState, audit, type WarmupStage, type SafetyStateRow } from "./store";

const DAY_MS = 24 * 3_600_000;

export interface StageLimits {
  stage: WarmupStage;
  maxDaily: number;
  maxHourly: number;
  maxNewChats10Min: number;
  replyOnly: boolean;        // bot must NOT initiate cold outbound
  cooldownAfterDailyMs: number;  // forced cooldown when daily cap hit
  description: string;
}

const STAGES: StageLimits[] = [
  { stage: "day1",   maxDaily: 20,  maxHourly: 6,  maxNewChats10Min: 3,  replyOnly: true,  cooldownAfterDailyMs: 12 * 3_600_000, description: "اليوم الأول — وضع آمن جداً، الرد فقط على الرسائل الواردة، حد أقصى 20 رسالة" },
  { stage: "day2_3", maxDaily: 40,  maxHourly: 10, maxNewChats10Min: 5,  replyOnly: true,  cooldownAfterDailyMs: 8  * 3_600_000, description: "اليوم 2-3 — رد فقط، الحد 40/يوم" },
  { stage: "day4_5", maxDaily: 80,  maxHourly: 14, maxNewChats10Min: 8,  replyOnly: false, cooldownAfterDailyMs: 6  * 3_600_000, description: "اليوم 4-5 — يسمح ببعض البث المحدود، 80/يوم" },
  { stage: "day6_7", maxDaily: 150, maxHourly: 20, maxNewChats10Min: 12, replyOnly: false, cooldownAfterDailyMs: 4  * 3_600_000, description: "اليوم 6-7 — تدرّج للسعة الكاملة، 150/يوم" },
  { stage: "week2",  maxDaily: 300, maxHourly: 35, maxNewChats10Min: 20, replyOnly: false, cooldownAfterDailyMs: 2  * 3_600_000, description: "الأسبوع الثاني — 300/يوم" },
  { stage: "mature", maxDaily: 600, maxHourly: 50, maxNewChats10Min: 25, replyOnly: false, cooldownAfterDailyMs: 1  * 3_600_000, description: "ناضج — حدود كاملة 600/يوم" },
];

export function getStageLimits(stage: WarmupStage): StageLimits {
  return STAGES.find((s) => s.stage === stage) || STAGES[0];
}

/** Compute what stage this account SHOULD be in based on age + trust. */
function computeTargetStage(state: SafetyStateRow): WarmupStage {
  const ageMs = Date.now() - new Date(state.warmupStartedAt).getTime();
  const days = ageMs / DAY_MS;
  // Bots with high trust + zero kill-switch can accelerate slightly. But
  // we never skip more than one stage at a time even for trusted ones.
  const trustBoost = state.trustScore >= 70 && !state.killSwitchActive ? 0.5 : 0;
  const effective = days + trustBoost;
  if (effective < 1) return "day1";
  if (effective < 3) return "day2_3";
  if (effective < 5) return "day4_5";
  if (effective < 7) return "day6_7";
  if (effective < 14) return "week2";
  return "mature";
}

/**
 * Advance the warmup stage if the account is ready. Called on every send.
 * Returns the *current* effective limits. Cheap when no advance happens.
 */
export async function checkWarmup(userId: string): Promise<{
  state: SafetyStateRow;
  limits: StageLimits;
  advanced: boolean;
}> {
  const state = await loadState(userId);
  const target = computeTargetStage(state);
  let advanced = false;

  if (target !== state.warmupStage) {
    // Block automatic regression — once you reach a stage, you stay there.
    const order: WarmupStage[] = ["day1", "day2_3", "day4_5", "day6_7", "week2", "mature"];
    const curIdx = order.indexOf(state.warmupStage);
    const tgtIdx = order.indexOf(target);
    if (tgtIdx > curIdx) {
      const newStage = order[curIdx + 1] as WarmupStage;
      const newLimits = getStageLimits(newStage);
      await patchState(userId, {
        warmupStage: newStage,
        warmupReplyOnly: newLimits.replyOnly,
      });
      state.warmupStage = newStage;
      state.warmupReplyOnly = newLimits.replyOnly;
      advanced = true;
      await audit("info", "warmup", `تم ترقية البوت إلى مرحلة ${newStage}`, {
        userId,
        detail: newLimits.description,
        payload: { from: order[curIdx], to: newStage, trustScore: state.trustScore },
      });
    }
  }

  return { state, limits: getStageLimits(state.warmupStage), advanced };
}

/** Reset warmup — used when the merchant connects a new WhatsApp number. */
export async function resetWarmup(userId: string, reason = "wa_reconnected"): Promise<void> {
  const now = new Date();
  await patchState(userId, {
    warmupStartedAt: now,
    warmupStage: "day1",
    warmupReplyOnly: true,
    riskScore: 0,
    cooldownUntil: null,
    killSwitchActive: false,
    killSwitchReason: null,
    killSwitchAt: null,
    recentFailures: 0,
    recentReconnects: 0,
  });
  await audit("warn", "warmup", "تمت إعادة الإحماء من البداية", {
    userId,
    detail: `السبب: ${reason}`,
    payload: { reason },
  });
}

export const WARMUP_STAGES = STAGES;
