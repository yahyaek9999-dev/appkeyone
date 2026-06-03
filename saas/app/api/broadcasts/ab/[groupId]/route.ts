// Advanced Broadcast AI — A/B comparison + winner.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";
import { computeBroadcastAnalytics } from "@/lib/broadcasts/analytics";
import { evaluateAbSignificance } from "@/lib/intelligence/self-learning";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { groupId: string } }) {
  const uid = await getUserIdForPermission("broadcasts");
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

  // Winner: a two-proportion z-test gates the call so we NEVER declare a winner
  // on a tiny/noisy sample (the old code picked the higher rate even at 1-vs-0).
  // Conversions are the primary success metric; we fall back to replies only when
  // no conversions have landed yet so early tests still get an honest read. A
  // winner requires ≥95% confidence AND ≥20 sent per variant (see self-learning).
  let winner: string | null = null;
  let decided = false;
  let significance:
    | (ReturnType<typeof evaluateAbSignificance> & { metric: "conversion" | "reply" })
    | null = null;

  if (variants.length >= 2) {
    // Stable A-then-B ordering by variant label.
    const [va, vb] = [...variants].sort((a, b) =>
      String(a.variant).localeCompare(String(b.variant)),
    );
    const useReplies = (va.conversion || 0) + (vb.conversion || 0) === 0;
    const sig = evaluateAbSignificance(
      {
        variant: String(va.variant),
        sent: va.sent || 0,
        successes: useReplies ? va.replied || 0 : va.conversion || 0,
      },
      {
        variant: String(vb.variant),
        sent: vb.sent || 0,
        successes: useReplies ? vb.replied || 0 : vb.conversion || 0,
      },
    );
    significance = { ...sig, metric: useReplies ? "reply" : "conversion" };
    winner = sig.winner;
    decided = sig.significant;
  }

  return NextResponse.json({ groupId: params.groupId, variants, winner, decided, significance });
}
