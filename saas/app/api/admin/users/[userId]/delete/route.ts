import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export async function POST(req: Request, props: { params: Promise<{ userId: string }> }) {
  const params = await props.params;
  let admin;
  try { admin = await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const { userId } = params;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });

  // Never delete a platform-admin (incl. yourself) — a hard delete of the last
  // admin locks the whole platform out of its admin panel (recoverable only via
  // /api/admin/init). Mirrors the guard already present on the suspend endpoint.
  if ((user as any).role === "admin") {
    return NextResponse.json({ error: "cannot_delete_admin" }, { status: 400 });
  }
  if (userId === (admin as any).id) {
    return NextResponse.json({ error: "cannot_delete_self" }, { status: 400 });
  }

  await prisma.user.delete({ where: { id: userId } });
  return NextResponse.json({ ok: true });
}
