/**
 * POST /api/admin/brain/credits/[userId] — admin grant/deduct Brain credits (Phase 7).
 * Admin-only. Idempotent per action timestamp.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { credit, adjust, getOrCreateBrainWallet } from "@/lib/brain/credits";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { userId: string } }) {
  let admin: any;
  try { admin = await requireAdmin(); }
  catch { return NextResponse.json({ error: "forbidden" }, { status: 403 }); }

  const userId = String(params.userId || "");
  if (!userId) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const action = String(body.action || "");
  if (!["grant", "deduct"].includes(action)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const amount = Math.round(Number(body.amount) || 0);
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  const reason = body.reason ? String(body.reason).slice(0, 300) : action;
  const idem = `brain-admin-${action}:${userId}:${Date.now()}`;

  const res = action === "grant"
    ? await credit({ userId, kind: "adjustment", amount, source: "admin", reason, idempotencyKey: idem, actorId: admin?.id || null, actorEmail: admin?.email || "admin" })
    : await adjust({ userId, kind: "adjustment", amount: -amount, source: "admin", reason, idempotencyKey: idem, actorId: admin?.id || null, actorEmail: admin?.email || "admin" });

  const wallet = await getOrCreateBrainWallet(userId);
  return NextResponse.json({ ok: res.ok, balance: wallet.balance, recorded: res.recorded, reason: res.reason });
}
