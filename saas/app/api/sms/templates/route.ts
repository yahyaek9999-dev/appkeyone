// GET  /api/sms/templates   → list templates
// POST /api/sms/templates   → create template
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const CreateBody = z.object({
  name: z.string().min(1).max(100),
  purpose: z.enum(["order_confirmation", "order_status", "otp", "custom"]).default("custom"),
  statusTrigger: z.string().max(50).optional(),
  body: z.string().min(1).max(1600),
  language: z.enum(["ar", "en"]).default("ar"),
  variables: z.array(z.string()).default([]),
});

function countSegments(body: string): number {
  return body.length <= 160 ? 1 : Math.ceil(body.length / 153);
}

export async function GET(req: Request) {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const purpose = new URL(req.url).searchParams.get("purpose") || undefined;
  const templates = await (prisma as any).smsTemplate.findMany({
    where: { userId: uid, ...(purpose ? { purpose } : {}) },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ ok: true, templates });
}

export async function POST(req: Request) {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limited = enforceRateLimit(req, { name: "sms-template-create", identifier: uid, ...RATE_LIMITS.api });
  if (limited) return limited;

  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body", issues: parsed.error.issues }, { status: 400 });
  const d = parsed.data;

  const t = await (prisma as any).smsTemplate.create({
    data: {
      userId: uid,
      name: d.name,
      purpose: d.purpose,
      statusTrigger: d.statusTrigger ?? null,
      body: d.body,
      language: d.language,
      variables: JSON.stringify(d.variables),
      charCount: d.body.length,
      segCount: countSegments(d.body),
    },
  });

  return NextResponse.json({ ok: true, template: t });
}
