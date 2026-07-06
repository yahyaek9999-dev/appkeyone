/**
 * Broadcast-credit campaigns (owner side).
 *   GET  /api/broadcast-credits/campaigns — this user's credit-funded campaigns,
 *        each enriched with its QR slot job status + queue position.
 *   POST /api/broadcast-credits/campaigns — create a credit-funded campaign.
 *
 * Creation flow (mirrors app/api/broadcasts/route.ts audience resolution, then
 * layers credit reservation + QR-pool enqueue on top):
 *   1. Resolve recipients from the audience (segment: or buildAudienceWhere),
 *      filtering out unreachable WhatsApp LIDs — identical to the existing send.
 *   2. reserve = creditsForRecipients(recipients, perRecipient).
 *   3. Create a Broadcast with status "credit_queued" (intentionally INVISIBLE to
 *      the existing drain cron) + viaCredits + creditsReserved + BroadcastItems.
 *   4. Debit the credit wallet for the reservation (idempotent per broadcast).
 *      On insufficient credits (when enforced) → roll back the broadcast, 402.
 *   5. Enqueue a QR slot job and stamp broadcast.qrJobId. The scheduler later
 *      wakes a session and promotes the campaign into the existing drain.
 *
 * Owner-only via the "broadcasts" permission + capability gate.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiGate } from "@/lib/membership/gate";
import { getAuthContext } from "@/lib/auth";
import { auditCtx } from "@/lib/audit/log";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { buildAudienceWhere } from "@/lib/broadcasts/audience";
import { resolveSegmentCustomers } from "@/lib/analytics/segments";
import { creditsForRecipients } from "@/lib/credits/credits-core";
import { creditFlags } from "@/lib/credits/flags";
import { debit } from "@/lib/credits/credits";
import { enqueueJob, queuePosition } from "@/lib/qr-pool/scheduler";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await apiGate("broadcasts", "broadcasts");
  if (g.response) return g.response;
  const uid = g.uid!;

  const items = await prisma.broadcast.findMany({
    where: { userId: uid, viaCredits: true } as any,
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Enrich each campaign with its QR slot job (status + live queue position).
  const jobIds = items.map((b) => (b as any).qrJobId).filter(Boolean) as string[];
  const jobs = jobIds.length
    ? await prisma.qrSlotJob.findMany({ where: { id: { in: jobIds } } })
    : [];
  const jobById = new Map(jobs.map((j) => [j.id, j]));

  const enriched = await Promise.all(
    items.map(async (b) => {
      const jobId = (b as any).qrJobId as string | null;
      const job = jobId ? jobById.get(jobId) : null;
      const position = job && job.status === "queued" ? await queuePosition(job.id) : 0;
      return {
        id: b.id,
        title: b.title,
        audience: b.audience,
        status: b.status,
        total: b.total,
        sent: b.sent,
        failed: b.failed,
        creditsReserved: (b as any).creditsReserved ?? 0,
        createdAt: b.createdAt,
        startedAt: (b as any).startedAt ?? null,
        finishedAt: (b as any).finishedAt ?? null,
        job: job
          ? { id: job.id, status: job.status, position, attempts: job.attempts, error: job.error }
          : null,
      };
    }),
  );

  return NextResponse.json({ ok: true, items: enriched });
}

const isReachable = (ph: string | null | undefined) => {
  const v = (ph || "").trim();
  if (!v) return false;
  if (v.startsWith("lid:")) return false;
  if (v.includes("@lid")) return false;
  const digits = v.replace(/^\+/, "").replace(/[^\d]/g, "");
  return digits.length >= 8 && digits.length <= 13;
};

export async function POST(req: Request) {
  const g = await apiGate("broadcasts", "broadcasts");
  if (g.response) return g.response;
  const uid = g.uid!;

  // Burst guard, same as the standard broadcast-create route.
  const limited = enforceRateLimit(req, { name: "broadcast-credit-campaign", identifier: uid, ...RATE_LIMITS.api });
  if (limited) return limited;

  let body: any = {};
  try { body = await req.json(); } catch {}

  const title = String(body.title || "حملة بدون عنوان").trim().slice(0, 120);
  const template = String(body.template || "").trim();
  const audience = String(body.audience || "all");
  const personalize = body.personalize === true;
  const couponCode = body.couponCode ? String(body.couponCode).trim().slice(0, 60) : null;
  const imageUrl =
    typeof body.imageUrl === "string" && /^https?:\/\/\S+$/i.test(body.imageUrl.trim())
      ? body.imageUrl.trim().slice(0, 500)
      : null;
  const audienceOpts = {
    inactiveDays: body.inactiveDays != null ? Number(body.inactiveDays) : undefined,
    from: body.from || null,
    to: body.to || null,
  };

  if (!template) {
    return NextResponse.json({ error: "نص الرسالة مطلوب" }, { status: 400 });
  }

  // ---- Resolve recipients (mirror app/api/broadcasts/route.ts exactly) -------
  let allMatched: { id: string; phone: string | null; name: string | null }[];
  if (audience.startsWith("segment:")) {
    allMatched = await resolveSegmentCustomers(uid, audience.slice("segment:".length), { reachableOnly: false });
  } else {
    const where: any = buildAudienceWhere(uid, audience, audienceOpts);
    allMatched = await prisma.customer.findMany({ where, select: { id: true, phone: true, name: true } });
  }
  const customers = allMatched.filter((c) => isReachable(c.phone));
  const skipped = allMatched.length - customers.length;

  if (customers.length === 0) {
    return NextResponse.json(
      {
        error:
          allMatched.length === 0
            ? "لا يوجد عملاء يطابقون هذه الجمهور"
            : `كل العملاء (${skipped}) لا يملكون رقم هاتف يمكن المراسلة عليه (معرّفات واتساب فقط).`,
      },
      { status: 400 },
    );
  }

  const recipients = customers.length;
  const reserve = creditsForRecipients(recipients, creditFlags.perRecipient);

  // ---- Step 3: create the credit_queued Broadcast + items --------------------
  // Status "credit_queued" is intentionally invisible to the existing drain
  // cron; the QR scheduler promotes it to "queued" when a slot is booked.
  const bc = await prisma.broadcast.create({
    data: {
      userId: uid,
      title,
      template: template.slice(0, 4000),
      audience,
      personalize,
      couponCode,
      imageUrl,
      status: "credit_queued",
      viaCredits: true,
      creditsReserved: reserve,
      total: recipients,
      items: {
        create: customers.map((c) => ({ customerId: c.id, phone: c.phone, name: c.name })),
      },
    } as any,
  });

  // ---- Step 4: reserve credits (idempotent per broadcast) --------------------
  const debited = await debit({
    userId: uid,
    kind: "campaign",
    amount: reserve,
    source: "broadcast",
    reason: "campaign_reserve",
    idempotencyKey: `campaign-reserve:${bc.id}`,
    refId: bc.id,
  });

  if (!debited.ok && debited.reason === "insufficient_credits" && creditFlags.enforce) {
    // Roll back the just-created campaign so no orphan credit_queued row remains.
    await prisma.broadcastItem.deleteMany({ where: { broadcastId: bc.id } }).catch(() => {});
    await prisma.broadcast.delete({ where: { id: bc.id } }).catch(() => {});
    return NextResponse.json(
      { error: "insufficient_credits", shortfall: debited.shortfall, required: reserve },
      { status: 402 },
    );
  }

  // ---- Step 5: enqueue the QR slot job + stamp qrJobId -----------------------
  const job = await enqueueJob({ userId: uid, type: "broadcast", refId: bc.id });
  await prisma.broadcast.update({ where: { id: bc.id }, data: { qrJobId: job.id } as any });
  const position = await queuePosition(job.id);

  void auditCtx(await getAuthContext(), "broadcast_credit.campaign_created", {
    userId: uid,
    targetType: "broadcast",
    targetId: bc.id,
    metadata: { title, audience, recipients, reserved: reserve, jobId: job.id },
    req,
  });

  return NextResponse.json({
    ok: true,
    broadcastId: bc.id,
    reserved: reserve,
    queuePosition: position,
    skipped,
  });
}
