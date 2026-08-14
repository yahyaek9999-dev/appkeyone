// GET  /api/numbers/:id/settings  → fetch number settings
// PATCH /api/numbers/:id/settings → update number settings
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

const PatchBody = z.object({
  businessName: z.string().max(80).optional(),
  businessCategory: z.string().max(80).optional(),
  greetingMessage: z.string().max(1000).optional(),
  awayMessage: z.string().max(1000).optional(),
  workingHours: z.record(z.any()).optional(),
  timezone: z.string().max(60).optional(),
  defaultLanguage: z.string().max(10).optional(),
  botEnabled: z.boolean().optional(),
  botFlowId: z.string().optional().nullable(),
  defaultTeam: z.string().optional().nullable(),
  routingStrategy: z.enum(["round_robin", "least_loaded", "manual"]).optional(),
  defaultAssigneeId: z.string().optional().nullable(),
  notifyOnOrders: z.boolean().optional(),
  notifyOnShipping: z.boolean().optional(),
  notifyOnOtp: z.boolean().optional(),
  maxConcurrentConvs: z.number().int().min(0).optional(),
  waDescription: z.string().max(256).optional(),
  waEmail: z.string().max(100).optional(),
  waWebsite: z.string().max(200).optional(),
  waAddress: z.string().max(256).optional(),
});

async function verifyOwnership(uid: string, numberId: string) {
  return (prisma as any).whatsAppNumber.findFirst({ where: { id: numberId, userId: uid }, select: { id: true } });
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.isOwner) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!await verifyOwnership(ctx.user.id, params.id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const settings = await (prisma as any).numberSettings.findUnique({ where: { numberId: params.id } });
  return NextResponse.json({ ok: true, settings });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.isOwner) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!await verifyOwnership(ctx.user.id, params.id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body", issues: parsed.error.issues }, { status: 400 });

  const { workingHours, ...rest } = parsed.data;
  const data: any = { ...rest, updatedAt: new Date() };
  if (workingHours !== undefined) data.workingHours = JSON.stringify(workingHours);

  const settings = await (prisma as any).numberSettings.upsert({
    where: { numberId: params.id },
    update: data,
    create: { numberId: params.id, ...data },
  });

  return NextResponse.json({ ok: true, settings });
}
