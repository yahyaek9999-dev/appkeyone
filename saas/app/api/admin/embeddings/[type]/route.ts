// PATCH /api/admin/embeddings/[type] — enable/disable + priority.
import { authErrorStatus } from "@/lib/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

const Body = z.object({
  enabled: z.boolean().optional(),
  priority: z.number().int().min(1).max(999).optional(),
});

export async function PATCH(req: Request, { params }: { params: { type: string } }) {
  try {
    await requireAdmin();
  } catch (e) {
    return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });
  const upd = await prisma.embeddingProvider.updateMany({
    where: { type: params.type },
    data: parsed.data,
  });
  if (upd.count === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
