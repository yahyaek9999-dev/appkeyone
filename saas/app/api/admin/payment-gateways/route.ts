/**
 * Admin: payment gateway configuration.
 *   GET  /api/admin/payment-gateways — list all gateways (credentials masked)
 *   POST /api/admin/payment-gateways — add a new gateway
 *
 * Credentials are encrypted at rest using encryptSecret().
 * The decrypted value is NEVER returned in API responses.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit/log";
import { encryptSecret } from "@/lib/crypto-util";

export const dynamic = "force-dynamic";

const SUPPORTED_ADAPTERS = ["stripe", "paypal", "hyperpay", "tap", "moyasar", "paytabs", "custom"] as const;

function maskGateway(gw: any) {
  const { credentialsEnc, webhookSecretEnc, ...rest } = gw;
  return {
    ...rest,
    hasCredentials: Boolean(credentialsEnc),
    hasWebhookSecret: Boolean(webhookSecretEnc),
  };
}

export async function GET() {
  try { await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const gateways = await (prisma as any).paymentGateway.findMany({
    orderBy: { createdAt: "asc" },
  }).catch(() => []);

  return NextResponse.json({ ok: true, gateways: gateways.map(maskGateway) });
}

export async function POST(req: Request) {
  let admin: any;
  try { admin = await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  let body: any = {};
  try { body = await req.json(); } catch {}

  const adapter = String(body.adapter || "").toLowerCase();
  if (!SUPPORTED_ADAPTERS.includes(adapter as any)) {
    return NextResponse.json({ error: "unsupported_adapter", supported: SUPPORTED_ADAPTERS }, { status: 400 });
  }

  const name = String(body.name || adapter).trim();
  const rawCreds = body.credentials ? JSON.stringify(body.credentials) : null;
  const rawWebhook = body.webhookSecret ? String(body.webhookSecret) : null;

  const credentialsEnc = rawCreds ? encryptSecret(rawCreds) : null;
  const webhookSecretEnc = rawWebhook ? encryptSecret(rawWebhook) : null;

  let currencies: string[] = [];
  try { currencies = JSON.parse(body.currencies || "[]"); } catch {}
  let methods: string[] = [];
  try { methods = JSON.parse(body.methods || "[]"); } catch {}

  const gw = await (prisma as any).paymentGateway.create({
    data: {
      adapter,
      name,
      credentialsEnc,
      webhookSecretEnc,
      currencies: JSON.stringify(currencies),
      methods: JSON.stringify(methods),
      health: "unknown",
      isDefault: false,
      isFallback: false,
      testMode: Boolean(body.testMode),
    },
  });

  await audit({
    userId: admin?.id || "admin",
    action: "admin.payment_gateway_added",
    actorId: admin?.id || null,
    actorEmail: admin?.email || "admin",
    actorRole: "admin",
    targetType: "PaymentGateway",
    targetId: gw.id,
    metadata: { adapter, name, testMode: gw.testMode },
    req,
  });

  return NextResponse.json({ ok: true, gateway: maskGateway(gw) }, { status: 201 });
}
