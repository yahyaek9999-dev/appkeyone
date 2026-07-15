/**
 * Admin Meta rate-card editor.
 *   GET /api/admin/meta-rates — list the rate card (lazily seeds defaults)
 *   PUT /api/admin/meta-rates — upsert one rate { country, category, rateUsd, metaCostUsd, active?, note? }
 * Admin-only; PUT is audited.
 */
import { authErrorStatus } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit/log";
import { roundUsd } from "@/lib/wallet/money";
import { seedRateCard, META_CATEGORIES } from "@/lib/wallet/meta-rates";

export const dynamic = "force-dynamic";

export async function GET() {
  let admin: any;
  try { admin = await requireAdmin(); }
  catch (e) { return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) }); }

  // Lazily seed defaults on first visit so the editor is never empty.
  const count = await prisma.metaRateCard.count().catch(() => 0);
  if (count === 0) await seedRateCard(admin?.email || "system").catch(() => {});

  const items = await prisma.metaRateCard.findMany({
    orderBy: [{ country: "asc" }, { category: "asc" }],
  }).catch(() => []);
  return NextResponse.json({ ok: true, items });
}

export async function PUT(req: Request) {
  let admin: any;
  try { admin = await requireAdmin(); }
  catch (e) { return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) }); }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const country = String(body.country || "").toUpperCase().slice(0, 4) || "*";
  const category = String(body.category || "");
  if (!META_CATEGORIES.includes(category as any)) return NextResponse.json({ error: "invalid_category" }, { status: 400 });
  const rateUsd = roundUsd(Math.max(0, Number(body.rateUsd) || 0));
  const metaCostUsd = roundUsd(Math.max(0, Number(body.metaCostUsd) || 0));
  const active = body.active === undefined ? true : !!body.active;
  const note = body.note ? String(body.note).slice(0, 200) : "";
  const adminEmail = admin?.email || "admin";

  try {
    const row = await prisma.metaRateCard.upsert({
      where: { country_category: { country, category } },
      update: { rateUsd, metaCostUsd, active, note, updatedBy: adminEmail },
      create: { country, category, rateUsd, metaCostUsd, active, note, updatedBy: adminEmail },
    });
    await audit({ userId: admin?.id || "platform", action: "wallet.rate_updated", actorId: admin?.id || null, actorEmail: adminEmail, actorRole: "admin", targetType: "meta_rate", targetId: `${country}:${category}`, metadata: { country, category, rateUsd, metaCostUsd, active } });
    return NextResponse.json({ ok: true, item: row });
  } catch (e: any) {
    return NextResponse.json({ error: "update_failed", detail: String(e?.message || e) }, { status: 500 });
  }
}
