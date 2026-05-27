import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export async function POST(req: Request, { params }: { params: { userId: string } }) {
  try { await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const { userId } = params;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });

  await prisma.user.delete({ where: { id: userId } });
  return NextResponse.json({ ok: true });
}
