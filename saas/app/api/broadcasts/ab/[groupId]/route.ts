// Advanced Broadcast AI — A/B comparison + winner.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { computeBroadcastAnalytics } from "@/lib/broadcasts/analytics";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { groupId: string } }) {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const rows: any[] = await prisma.broadcast.findMany({
    where: { userId: uid, abGroupId: params.groupId } as any,
    orderBy: { abVariant: "asc" } as any,
  });
  if (rows.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const variants = await Promise.all(
    rows.map(async (bc) => {
      const stats = await computeBroadcastAnalytics(uid, bc.id);
      const base = stats || {
        id: bc.id,
        status: bc.status,
        total: bc.total || 0,
        sent: bc.sent || 0,
        failed: bc.failed || 0,
        replied: 0,
        conversion: 0,
        replyRatePct: 0,
        convRatePct: 0,
      };
      return { ...base, variant: bc.abVariant || "?", title: bc.title, template: bc.template };
    }),
  );

  // Winner: highest conversion rate, tiebreak on reply rate. Only "decided"
  // once both variants have actually sent to someone.
  let winner: string | null = null;
  let decided = false;
  const sentBoth = variants.every((v) => (v.sent || 0) > 0);
  if (sentBoth && variants.length >= 2) {
    const sorted = [...variants].sort((a, b) => b.convRatePct - a.convRatePct || b.replyRatePct - a.replyRatePct);
    if (sorted[0].convRatePct !== sorted[1].convRatePct || sorted[0].replyRatePct !== sorted[1].replyRatePct) {
      winner = sorted[0].variant;
      decided = true;
    }
  }

  return NextResponse.json({ groupId: params.groupId, variants, winner, decided });
}
