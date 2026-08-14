// GET  /api/sms/credits  → balance + ledger
// POST /api/sms/credits  → admin topup / refund (admin only)
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";
import { getSmsBalance, creditSmsCredits } from "@/lib/sms/send";

export const dynamic = "force-dynamic";

const AdjustBody = z.object({
  targetUserId: z.string().min(1),
  type: z.enum(["topup", "refund", "adjustment"]),
  amount: z.number().int().positive().max(1_000_000_00),
  note: z.string().max(200).optional(),
});

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const uid = ctx.user.id;

  const page = Math.max(0, parseInt(new URL(req.url).searchParams.get("page") || "0"));
  const take = 50;

  const [balance, ledger, total] = await Promise.all([
    getSmsBalance(uid),
    (prisma as any).smsCreditLedger.findMany({
      where: { userId: uid },
      orderBy: { createdAt: "desc" },
      take,
      skip: page * take,
    }),
    (prisma as any).smsCreditLedger.count({ where: { userId: uid } }),
  ]);

  return NextResponse.json({ ok: true, balance, ledger, total, page });
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx || ctx.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = AdjustBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });
  const d = parsed.data;

  await creditSmsCredits(d.targetUserId, d.amount, d.type, undefined, d.note, ctx.principalEmail);
  const newBalance = await getSmsBalance(d.targetUserId);

  return NextResponse.json({ ok: true, newBalance });
}
