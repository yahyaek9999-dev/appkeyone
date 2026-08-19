// GET /api/admin/finance/gateways — gateway health from real signals.
// Admin-only. Returns SAFE metadata only: `credentialsConfigured` /
// `webhookConfigured` booleans, never the encrypted values or secrets.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getGatewayHealth } from "@/lib/admin/finance";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const days = Number(new URL(req.url).searchParams.get("days")) || 30;
  const gateways = await getGatewayHealth(days);
  return NextResponse.json({ ok: true, gateways });
}
