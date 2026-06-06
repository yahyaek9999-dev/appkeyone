import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getEntitlements } from "@/lib/membership/entitlements";
import { getUsageSnapshot } from "@/lib/membership/limits";

export const dynamic = "force-dynamic";

/**
 * Client data source for upgrade modals / locked-feature UI.
 * Returns the user's capability entitlements + live usage counters.
 */
export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [entitlements, usage] = await Promise.all([
    getEntitlements(user.id),
    getUsageSnapshot(user.id).catch(() => null),
  ]);

  // Coerce any BigInt-ish counters to plain numbers (NextResponse.json safety).
  const counters = usage
    ? {
        messages: { used: Number(usage.counters.messages.used), cap: Number(usage.counters.messages.cap) },
        ai: { used: Number(usage.counters.ai.used), cap: Number(usage.counters.ai.cap) },
        broadcast: { used: Number(usage.counters.broadcast.used), cap: Number(usage.counters.broadcast.cap) },
        resetAt: usage.resetAt,
      }
    : null;

  return NextResponse.json({ ok: true, entitlements, usage: counters });
}
