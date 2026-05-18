// Kill Switch — emergency global shutoff for a bot. Triggered by:
//   * sustained mass send failures
//   * reconnect storms (WhatsApp keeps dropping us)
//   * risk score >= 95 (assess returns shouldKill)
//   * mass blocks reported by whatsapp-service
//   * external admin trigger
//
// When active, the safety engine refuses ALL outbound for the bot until
// an admin clears it. The reason + timestamp are preserved on SafetyState.
import { loadState, patchState, audit, logEvent } from "./store";
export interface KillTrigger {
  reason: string;
  detail?: string;
  payload?: any;
}

export async function engageKillSwitch(
  userId: string,
  trigger: KillTrigger
): Promise<void> {
  const state = await loadState(userId);
  if (state.killSwitchActive) return; // already on
  await patchState(userId, {
    killSwitchActive: true,
    killSwitchReason: trigger.reason,
    killSwitchAt: new Date(),
    cooldownUntil: new Date(Date.now() + 24 * 3_600_000),
  });
  await logEvent(userId, "kill", { payload: trigger });
  await audit("critical", "kill_switch", `تفعيل الإيقاف الطارئ: ${trigger.reason}`, {
    userId,
    detail: trigger.detail || "",
    payload: trigger.payload || {},
  });
  // Audit row above is the durable record. Dashboard surfaces it.
}

export async function clearKillSwitch(userId: string, by: string): Promise<void> {
  await patchState(userId, {
    killSwitchActive: false,
    killSwitchReason: null,
    killSwitchAt: null,
    cooldownUntil: null,
    riskScore: 0,
    recentFailures: 0,
    recentReconnects: 0,
  });
  await audit("warn", "kill_switch", "تم إلغاء الإيقاف الطارئ", {
    userId,
    detail: `بواسطة ${by}`,
  });
}

/**
 * Heuristic auto-trigger. Stage-aware so that mature accounts aren't killed
 * by transient infra issues, while brand-new ones stay strictly protected.
 * Only SPAM-like failures (block / rate_limit) count, not technical timeouts.
 */
export async function checkAutoKill(
  userId: string,
  signals: {
    spamFailures1Hour?: number;   // preferred
    recentFailures?: number;       // legacy fallback (mixed)
    reconnects10Min?: number;      // preferred
    recentReconnects?: number;     // legacy fallback
    riskScore: number;
    warmupStage?: string;
    massBlockSignal?: boolean;
  }
): Promise<boolean> {
  const reasons: string[] = [];
  // Stage-scaled spam-failure threshold.
  const stage = signals.warmupStage || "day1";
  const failThreshold =
    stage === "mature" ? 25 :
    stage === "week2"  ? 18 :
    stage === "day6_7" ? 14 :
    stage === "day4_5" ? 10 :
    8; // day1 / day2_3
  const spamFails = signals.spamFailures1Hour ?? signals.recentFailures ?? 0;
  if (spamFails >= failThreshold) reasons.push("mass_spam_failures");
  // Reconnect storm requires the *short* window, not just hourly count.
  const reconnects = signals.reconnects10Min ?? signals.recentReconnects ?? 0;
  if (reconnects >= 6) reasons.push("reconnect_storm");
  // Score-only kill is reserved for truly extreme situations.
  if (signals.riskScore >= 100) reasons.push("risk_score_critical");
  if (signals.massBlockSignal) reasons.push("mass_blocks");
  if (reasons.length === 0) return false;

  await engageKillSwitch(userId, {
    reason: reasons.join("|"),
    detail: `spam_fails=${spamFails} reconnects=${reconnects} risk=${signals.riskScore} stage=${stage}`,
    payload: signals,
  });
  return true;
}
