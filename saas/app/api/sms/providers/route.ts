// GET  /api/sms/providers   → list tenant's SMS providers
// POST /api/sms/providers   → create a provider
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto-util";
import { apiGate } from "@/lib/membership/gate";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getAdapter } from "@/lib/sms/adapters";

export const dynamic = "force-dynamic";

const SMS_PROVIDER_TYPES = ["twilio", "vonage", "unifonic", "msegat", "clicksend", "custom"];

const CreateBody = z.object({
  name: z.string().min(1).max(80),
  type: z.enum(["twilio", "vonage", "unifonic", "msegat", "clicksend", "custom"]),
  apiKey: z.string().max(500).optional(),
  apiSecret: z.string().max(500).optional(),
  senderId: z.string().max(20).optional(),
  endpoint: z.string().url().optional().or(z.literal("")),
  isDefault: z.boolean().default(false),
});

export async function GET(req: Request) {
  const gate = await apiGate("k1sms", "settings");
  if (gate.response) return gate.response;
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const providers = await (prisma as any).smsProvider.findMany({
    where: { OR: [{ userId: uid }, { userId: null }] },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: {
      id: true, name: true, type: true, enabled: true,
      isDefault: true, health: true, lastTestAt: true, lastTestOk: true,
      userId: true, endpoint: true,
    },
  });

  return NextResponse.json({ ok: true, providers });
}

export async function POST(req: Request) {
  const gate = await apiGate("k1sms", "settings");
  if (gate.response) return gate.response;
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limited = enforceRateLimit(req, { name: "sms-provider-create", identifier: uid, ...RATE_LIMITS.api });
  if (limited) return limited;

  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body", issues: parsed.error.issues }, { status: 400 });
  const d = parsed.data;

  const enc = (v?: string) => (v?.trim() ? encryptSecret(v.trim()) : undefined);

  // If setting as default, clear other defaults for this tenant
  if (d.isDefault) {
    await (prisma as any).smsProvider.updateMany({ where: { userId: uid }, data: { isDefault: false } });
  }

  const p = await (prisma as any).smsProvider.create({
    data: {
      userId: uid,
      name: d.name,
      type: d.type,
      apiKeyEnc: enc(d.apiKey) ?? null,
      apiSecretEnc: enc(d.apiSecret) ?? null,
      senderIdEnc: enc(d.senderId) ?? null,
      endpoint: d.endpoint?.trim() || null,
      isDefault: d.isDefault,
    },
    select: { id: true, name: true, type: true, enabled: true, isDefault: true },
  });

  return NextResponse.json({ ok: true, provider: p });
}
