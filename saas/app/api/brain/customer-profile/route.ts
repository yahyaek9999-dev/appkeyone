/**
 * POST /api/brain/customer-profile — read a customer's Brain profile (Phase 6).
 * RBAC: smart_assistant. Read-only (no credit consumption).
 */
import { NextResponse } from "next/server";
import { apiGate } from "@/lib/membership/gate";
import { getCustomerBrainProfile } from "@/lib/brain";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const gate = await apiGate("smart_assistant");
  if (gate.response) return gate.response;
  const uid = gate.uid!;

  let body: any = {};
  try { body = await req.json(); } catch {}
  const customerId = body.customerId ? String(body.customerId) : null;
  if (!customerId) return NextResponse.json({ error: "customerId_required" }, { status: 400 });

  const data = await getCustomerBrainProfile(uid, customerId);
  return NextResponse.json({ ok: true, profile: data.profile, memory: data.memory, insights: data.insights });
}
