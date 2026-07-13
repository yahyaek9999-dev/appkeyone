/**
 * Shared "resolve audience + create a Broadcast" logic — used by both
 * POST /api/broadcasts (new campaign) and the "duplicate" action on
 * PATCH /api/broadcasts/[id] (re-run the same settings against the CURRENT
 * audience, not a snapshot of the old recipient list). Every gate that
 * applies to a fresh campaign (membership cap, wallet balance) applies
 * identically to a duplicate — it's a real new campaign that will really
 * send messages, not a free bypass of quota.
 */
import { prisma } from "@/lib/db";
import { buildAudienceWhere } from "@/lib/broadcasts/audience";
import { resolveSegmentCustomers } from "@/lib/analytics/segments";
import { checkLimit, incrementUsage } from "@/lib/membership/limits";
import { enforceWalletForSend, blockedSendMessage } from "@/lib/wallet/enforce";

export interface BroadcastSettings {
  title: string;
  template: string;
  audience: string;
  personalize: boolean;
  couponCode: string | null;
  imageUrl: string | null;
  scheduledAt: Date | null;
  audienceOpts?: { inactiveDays?: number; from?: string | null; to?: string | null };
}

export type CreateBroadcastResult =
  | { ok: true; broadcast: any; skipped: number }
  | { ok: false; status: number; error: string; reason?: string; used?: number; cap?: number; balance?: number };

export async function createBroadcastFromSettings(
  uid: string,
  s: BroadcastSettings,
): Promise<CreateBroadcastResult> {
  if (!s.template.trim()) {
    return { ok: false, status: 400, error: "نص الرسالة مطلوب" };
  }

  const decision = await checkLimit(uid, "broadcast");
  if (!decision.allowed) {
    return {
      ok: false,
      status: 403,
      error:
        decision.reason === "suspended" ? "الحساب معلّق"
        : decision.reason === "expired" ? "اشتراكك منتهي — قم بالتجديد"
        : decision.reason === "feature_disabled" ? "البث الجماعي غير متاح في باقتك الحالية"
        : decision.reason === "exhausted" ? `استنفدت حد البث الشهري (${decision.cap}) — يتجدد ${decision.resetAt?.toLocaleDateString("ar-EG")}`
        : "البث غير متاح حالياً",
      reason: decision.reason,
      used: decision.used,
      cap: decision.cap,
    };
  }

  const walletGate = await enforceWalletForSend(uid, "broadcast");
  if (!walletGate.allowed) {
    return {
      ok: false,
      status: 402,
      error: blockedSendMessage(walletGate.reason, walletGate.balance),
      reason: walletGate.reason,
      balance: walletGate.balance,
    };
  }

  let allMatched: { id: string; phone: string | null; name: string | null }[];
  if (s.audience.startsWith("segment:")) {
    allMatched = await resolveSegmentCustomers(uid, s.audience.slice("segment:".length), { reachableOnly: false });
  } else {
    const where: any = buildAudienceWhere(uid, s.audience, s.audienceOpts || {});
    allMatched = await prisma.customer.findMany({ where, select: { id: true, phone: true, name: true } });
  }

  const isReachable = (ph: string | null | undefined) => {
    const v = (ph || "").trim();
    if (!v) return false;
    if (v.startsWith("lid:")) return false;
    if (v.includes("@lid")) return false;
    const digits = v.replace(/^\+/, "").replace(/[^\d]/g, "");
    return digits.length >= 8 && digits.length <= 13;
  };
  const customers = allMatched.filter((c) => isReachable(c.phone));
  const skipped = allMatched.length - customers.length;

  if (customers.length === 0) {
    return {
      ok: false,
      status: 400,
      error:
        allMatched.length === 0
          ? "لا يوجد عملاء يطابقون هذه الجمهور"
          : `كل العملاء (${skipped}) لا يملكون رقم هاتف يمكن المراسلة عليه (معرّفات واتساب فقط).`,
    };
  }

  const bc = await prisma.broadcast.create({
    data: {
      userId: uid,
      title: s.title,
      template: s.template.slice(0, 4000),
      audience: s.audience,
      personalize: s.personalize,
      couponCode: s.couponCode,
      imageUrl: s.imageUrl,
      scheduledAt: s.scheduledAt,
      total: customers.length,
      items: {
        create: customers.map((c) => ({ customerId: c.id, phone: c.phone, name: c.name })),
      },
    } as any,
  });

  await incrementUsage(uid, "broadcast", 1);

  return { ok: true, broadcast: bc, skipped };
}
