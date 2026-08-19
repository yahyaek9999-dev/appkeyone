// GET /api/admin/search?q=...  → grouped, RBAC-gated global admin search.
//
// Server-side search over REAL admin entities (tenants, plans, features,
// incidents, orders). Admin-only. Each group is bounded (take: 6) so a broad
// query can never pull large tables into the browser. No fabricated results —
// every row links to an existing admin destination.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type SearchHit = { id: string; title: string; subtitle?: string; href: string };
export type SearchGroup = { key: string; label: string; hits: SearchHit[] };

const TAKE = 6;
const ci = (q: string) => ({ contains: q, mode: "insensitive" as const });

export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ groups: [] as SearchGroup[] });

  const [users, plans, features, incidents, orders] = await Promise.all([
    prisma.user
      .findMany({
        where: {
          role: "user" as any,
          OR: [{ email: ci(q) }, { name: ci(q) }, { phone: ci(q) }],
        },
        select: { id: true, email: true, name: true },
        take: TAKE,
        orderBy: { createdAt: "desc" },
      })
      .catch(() => []),
    prisma.plan
      .findMany({ where: { OR: [{ name: ci(q) }, { slug: ci(q) }] }, select: { id: true, name: true, slug: true }, take: TAKE })
      .catch(() => []),
    (prisma as any).featureControl
      ?.findMany({ where: { OR: [{ name: ci(q) }, { featureId: ci(q) }] }, select: { featureId: true, name: true, status: true }, take: TAKE })
      .catch(() => []) ?? [],
    (prisma as any).incident
      ?.findMany({ where: { title: ci(q) }, select: { id: true, title: true, status: true, severity: true }, take: TAKE, orderBy: { createdAt: "desc" } })
      .catch(() => []) ?? [],
    // Orders: match by id prefix (admins paste an order id to jump to it).
    prisma.order
      .findMany({ where: { id: { startsWith: q } }, select: { id: true, total: true, currency: true, status: true }, take: TAKE })
      .catch(() => []),
  ]);

  const groups: SearchGroup[] = [];

  if (users.length)
    groups.push({
      key: "tenants",
      label: "التجّار",
      hits: users.map((u: any) => ({ id: u.id, title: u.name || u.email, subtitle: u.name ? u.email : undefined, href: `/admin/tenants/${u.id}` })),
    });

  if (plans.length)
    groups.push({
      key: "plans",
      label: "الباقات",
      hits: plans.map((p: any) => ({ id: p.id, title: p.name, subtitle: p.slug, href: `/admin/plans` })),
    });

  if (features.length)
    groups.push({
      key: "features",
      label: "الميزات",
      hits: features.map((f: any) => ({ id: f.featureId, title: f.name, subtitle: `${f.featureId} · ${f.status}`, href: `/admin/feature-control` })),
    });

  if (incidents.length)
    groups.push({
      key: "incidents",
      label: "الحوادث",
      hits: incidents.map((i: any) => ({ id: i.id, title: i.title, subtitle: `${i.severity} · ${i.status}`, href: `/admin/incidents` })),
    });

  if (orders.length)
    groups.push({
      key: "orders",
      label: "الطلبات",
      hits: orders.map((o: any) => ({ id: o.id, title: `طلب ${o.id.slice(0, 8)}`, subtitle: `${o.total} ${o.currency} · ${o.status}`, href: `/admin/orders` })),
    });

  return NextResponse.json({ groups });
}
