/**
 * Paymob payment webhook/callback. Public (HMAC-SHA512 signed and verified
 * inside the engine — waived in lib/route-permissions.ts; do NOT add a session
 * gate). Paymob may deliver the transaction callback by POST (server-to-server)
 * or by GET (browser redirect/response callback), so both are handled.
 */
import { NextResponse } from "next/server";
import { handleWebhook } from "@/lib/payments";

export const dynamic = "force-dynamic";

async function handle(req: Request) {
  const raw = await req.text();
  const out = await handleWebhook("paymob", raw, req.headers, new URL(req.url));
  return NextResponse.json(
    { ok: out.ok, handled: out.handled, credited: out.credited, reason: out.reason },
    { status: out.status }
  );
}

export async function POST(req: Request) { return handle(req); }
export async function GET(req: Request) { return handle(req); }
