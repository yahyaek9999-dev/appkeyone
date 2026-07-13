/**
 * Stripe payment webhook. Public (Stripe-Signature HMAC-SHA256 verified inside
 * the engine — waived in lib/route-permissions.ts; do NOT add a session gate).
 * The raw body is required for signature verification, so it is read verbatim.
 */
import { NextResponse } from "next/server";
import { handleWebhook } from "@/lib/payments";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const limited = enforceRateLimit(req, { name: "stripe-webhook-ip", ...RATE_LIMITS.whatsapp });
  if (limited) return limited;

  const raw = await req.text();
  const out = await handleWebhook("stripe", raw, req.headers);
  return NextResponse.json(
    { ok: out.ok, handled: out.handled, credited: out.credited, reason: out.reason },
    { status: out.status }
  );
}
