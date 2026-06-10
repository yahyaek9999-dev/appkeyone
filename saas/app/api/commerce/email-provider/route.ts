import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptSecret, maskSecret, decryptSecret } from "@/lib/crypto-util";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { assertSmtpHostPublic } from "@/lib/commerce/email";

export const dynamic = "force-dynamic";

const PutBody = z.object({
  provider: z.enum(["smtp", "resend", "brevo"]),
  enabled: z.boolean().default(false),
  fromName: z.string().max(100).optional(),
  fromEmail: z.string().email().or(z.literal("")).optional(),
  host: z.string().max(200).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  username: z.string().max(200).optional(),
  secret: z.string().max(2000).optional(),
  configJson: z.record(z.unknown()).optional(),
});

function maskProvider(row: any) {
  let secretMask = "";
  let hasSecret = false;
  if (row?.secretEnc) {
    hasSecret = true;
    try { secretMask = maskSecret(decryptSecret(row.secretEnc)); }
    catch { secretMask = "•••• (decrypt error)"; }
  }
  return {
    id: row.id,
    provider: row.provider,
    enabled: row.enabled,
    fromName: row.fromName,
    fromEmail: row.fromEmail,
    host: row.host,
    port: row.port,
    username: row.username,
    hasSecret,
    secretMask,
    updatedAt: row.updatedAt,
  };
}

export async function GET() {
  let user;
  try { user = await requirePermission("settings"); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  const rows = await (prisma as any).commerceEmailProvider.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" } });
  return NextResponse.json({ ok: true, items: rows.map(maskProvider) });
}

export async function PUT(req: Request) {
  let user;
  try { user = await requirePermission("settings"); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  const limited = enforceRateLimit(req, { name: "commerce-email-provider", identifier: user.id, ...RATE_LIMITS.api });
  if (limited) return limited;

  const parsed = PutBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });

  // Reject private/internal SMTP hosts at save time so they never reach the DB
  // (defense-in-depth with the guard in connectSmtp). Only relevant for SMTP.
  if (parsed.data.provider === "smtp" && parsed.data.host && parsed.data.host.trim()) {
    try { await assertSmtpHostPublic(parsed.data.host.trim()); }
    catch { return NextResponse.json({ error: "invalid_smtp_host" }, { status: 400 }); }
  }

  const data: any = {
    enabled: parsed.data.enabled,
    fromName: parsed.data.fromName || "",
    fromEmail: parsed.data.fromEmail || "",
    host: parsed.data.host || "",
    port: parsed.data.port || 587,
    username: parsed.data.username || "",
    configJson: JSON.stringify(parsed.data.configJson || {}).slice(0, 10000),
  };
  if (parsed.data.secret && parsed.data.secret.trim()) data.secretEnc = encryptSecret(parsed.data.secret.trim());

  const row = await (prisma as any).commerceEmailProvider.upsert({
    where: { userId_provider: { userId: user.id, provider: parsed.data.provider } },
    create: { userId: user.id, provider: parsed.data.provider, ...data },
    update: data,
  });

  return NextResponse.json({ ok: true, provider: maskProvider(row) });
}
