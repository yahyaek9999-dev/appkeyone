/**
 * Admin: populate the new Plan fields with sane defaults for existing slugs.
 *
 * Safe to run multiple times (idempotent). Use after pushing the membership
 * schema changes to production. Does NOT touch monthlyMsgs / pricing / any
 * already-set field other than the membership additions.
 *
 * POST /api/admin/membership/seed-defaults  → { updated, skipped }
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { seedMembershipDefaults } from "@/lib/membership/seed-defaults";

export const dynamic = "force-dynamic";

export async function POST() {
  try { await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const r = await seedMembershipDefaults();
  return NextResponse.json({ ok: true, ...r });
}
