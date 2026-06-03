import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { authErrorStatus } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Platform-admin controls for the Knowledge Brain feature flag per tenant.
// Read-only GET lists tenants with their flag + document usage; POST toggles
// the per-user `knowledgeBrainEnabled` column. Admin-gated via requireAdmin().
// The column is provisioned by the orchestrator — `as any` keeps tsc happy.

export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) });
  }

  try {
    const users = await prisma.user.findMany({
      where: { role: "user" } as any,
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { documents: true } } },
    });

    return NextResponse.json({
      users: users.map((u: any) => ({
        id: u.id,
        email: u.email,
        name: u.name ?? null,
        knowledgeBrainEnabled: (u as any).knowledgeBrainEnabled ?? false,
        docCount: u._count.documents,
      })),
    });
  } catch {
    return NextResponse.json({ error: "تعذر تحميل البيانات" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }

  const userId = String(body?.userId || "").trim();
  const enabled = body?.enabled === true;

  if (!userId) {
    return NextResponse.json({ error: "معرّف المستخدم مطلوب" }, { status: 400 });
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { knowledgeBrainEnabled: enabled } as any,
    });
    return NextResponse.json({ ok: true, userId, enabled });
  } catch {
    return NextResponse.json({ error: "تعذر تحديث الحالة" }, { status: 500 });
  }
}
