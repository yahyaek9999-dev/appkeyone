// POST /api/customers/import  (Area 7 — bulk customer import)
//
// Accepts rows [{ phone, name? }], validates phone numbers, de-dupes against
// existing customers (unique [userId, phone]) and creates the new ones. Records
// a CustomerImport batch for success tracking and returns the counts.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const Body = z.object({
  rows: z.array(z.object({ phone: z.string(), name: z.string().optional() })).max(5000),
  source: z.enum(["paste", "csv"]).optional(),
});

/** Normalize to digits (keep leading +). Valid when 8–20 digits. */
function normalizePhone(raw: string): string | null {
  const s = String(raw || "").trim();
  const plus = s.startsWith("+");
  const digits = s.replace(/[^\d]/g, "");
  if (digits.length < 8 || digits.length > 20) return null;
  return (plus ? "+" : "") + digits;
}

export async function POST(req: Request) {
  const uid = await getUserIdForPermission("customers");
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limited = enforceRateLimit(req, {
    name: "customers-import",
    identifier: uid,
    ...RATE_LIMITS.api,
  });
  if (limited) return limited;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });

  const total = parsed.data.rows.length;
  let invalid = 0;
  // De-dupe within the payload + normalize.
  const byPhone = new Map<string, string | null>();
  for (const row of parsed.data.rows) {
    const phone = normalizePhone(row.phone);
    if (!phone) {
      invalid++;
      continue;
    }
    if (!byPhone.has(phone)) byPhone.set(phone, (row.name || "").trim().slice(0, 120) || null);
  }

  const phones = [...byPhone.keys()];
  // Existing customers for this owner (skip those).
  const existing = phones.length
    ? await prisma.customer.findMany({
        where: { userId: uid, phone: { in: phones } },
        select: { phone: true },
      })
    : [];
  const existingSet = new Set(existing.map((c) => c.phone));

  let created = 0;
  const toCreate = phones.filter((p) => !existingSet.has(p));
  // Chunked createMany for efficiency; idempotent via unique [userId, phone].
  for (let i = 0; i < toCreate.length; i += 500) {
    const chunk = toCreate
      .slice(i, i + 500)
      .map((phone) => ({ userId: uid, phone, name: byPhone.get(phone) || null }));
    const res = await prisma.customer.createMany({ data: chunk }).catch(() => ({ count: 0 }));
    created += res.count;
  }
  const skipped = phones.length - created; // already-existing duplicates

  await prisma.customerImport
    .create({
      data: {
        userId: uid,
        total,
        created,
        skipped,
        invalid,
        source: parsed.data.source || "paste",
      },
    })
    .catch(() => {});

  return NextResponse.json({ ok: true, total, created, skipped, invalid });
}
