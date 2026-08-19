import React from "react";
import { prisma } from "@/lib/db";
import { CheckCircle2, ChevronLeft } from "lucide-react";
import Link from "next/link";
import PlatformHealthStrip from "./platform-health-strip";
import { getFinanceAttentionSignals } from "@/lib/admin/finance-reconcile";
import { getOpsAttentionSignals } from "@/lib/admin/attention";
import { PageHeader, Section, MetricBand } from "./_ui/primitives";

export const dynamic = "force-dynamic";

/**
 * Owner Daily Check (J7). Decision-first, NOT a stat grid. Answers in one glance:
 * is everything okay — and if not, exactly what to do. Five areas only
 * (revenue / WhatsApp / subscriptions / customers / required action); each item
 * is an ACTION with a CTA. Passive numbers are demoted to a small strip below.
 */
async function getDaily() {
  const now = Date.now();
  const soon = new Date(now + 3 * 24 * 60 * 60 * 1000);
  const [activeSubsList, pendingSubs, expiredSubs, totalUsers, totalMessages, activeFeatures, activeReleases] = await Promise.all([
    prisma.subscription.findMany({ where: { status: "active" }, include: { plan: true } }),
    prisma.subscription.count({ where: { status: "pending" } }),
    prisma.subscription.count({ where: { status: "expired" } }),
    prisma.user.count({ where: { role: "user" } as any }),
    prisma.message.count(),
    (prisma as any).featureControl?.count({ where: { status: "enabled", killSwitch: false } }).catch(() => null as null | number),
    (prisma as any).featureRelease?.count({ where: { status: "active" } }).catch(() => null as null | number),
  ]);
  const activeUserIds = activeSubsList.map((s: any) => s.userId);

  const [pendingProofs, disconnected, expiringSoon, openIncidents] = await Promise.all([
    (prisma as any).paymentProof.count({ where: { status: { in: ["pending", "under_review"] } } }).catch(() => 0),
    activeUserIds.length
      ? prisma.bot.count({ where: { userId: { in: activeUserIds }, whatsappStatus: { not: "connected" } } as any }).catch(() => 0)
      : Promise.resolve(0),
    prisma.subscription.count({ where: { status: "active", expiresAt: { lte: soon, gt: new Date() } } }).catch(() => 0),
    (prisma as any).incident.count({ where: { status: { in: ["open", "assigned"] } } }).catch(() => 0),
  ]);

  const mrrUsd = activeSubsList.reduce((sum: number, s: any) => {
    const price = s.billingCycle === "yearly" ? Math.round((s.plan.yearlyUsd || s.plan.priceUsd * 10) / 12) : s.plan.priceUsd;
    return sum + price;
  }, 0);

  return { activeSubs: activeSubsList.length, pendingSubs, expiredSubs, totalUsers, totalMessages, pendingProofs, disconnected, expiringSoon, openIncidents, mrrUsd, activeFeatures, activeReleases };
}

type Action = { area: string; problem: string; cta: string; href: string; urgent: boolean };

export default async function AdminHome() {
  const [s, finance, ops] = await Promise.all([
    getDaily(),
    getFinanceAttentionSignals().catch(() => []),
    getOpsAttentionSignals().catch(() => []),
  ]);

  // Build the action list — ONE line per real problem, ordered urgent-first.
  const actions: Action[] = [];

  // Finance + ops/security/SLA/risk/customer-success signals feed the SAME
  // attention list (no duplicate dashboard architecture).
  for (const f of finance) {
    actions.push({ area: f.area, problem: f.problem, cta: f.cta, href: f.href, urgent: f.severity === "critical" });
  }
  for (const o of ops) {
    actions.push({ area: o.area, problem: o.problem, cta: o.cta, href: o.href, urgent: o.severity === "critical" });
  }
  if (s.pendingProofs > 0) actions.push({ area: "الإيرادات", problem: `${s.pendingProofs} دفعة بانتظار مراجعتك`, cta: "راجع المدفوعات", href: "/admin/payment-reviews", urgent: true });
  if (s.disconnected > 0) actions.push({ area: "واتساب", problem: `${s.disconnected} تاجر مشترك واتسابه غير متصل`, cta: "حالة واتساب", href: "/admin/whatsapp", urgent: true });
  if (s.openIncidents > 0) actions.push({ area: "العملاء", problem: `${s.openIncidents} حادثة مفتوحة تحتاج حلاً`, cta: "الحوادث", href: "/admin/incidents", urgent: true });
  if (s.expiredSubs > 0) actions.push({ area: "الاشتراكات", problem: `${s.expiredSubs} اشتراك منتهٍ`, cta: "تابع التجديد", href: "/admin/users", urgent: false });
  if (s.expiringSoon > 0) actions.push({ area: "الاشتراكات", problem: `${s.expiringSoon} اشتراك يقترب من الانتهاء (٣ أيام)`, cta: "تابع", href: "/admin/users", urgent: false });
  if (s.pendingSubs > 0) actions.push({ area: "العملاء", problem: `${s.pendingSubs} عميل بانتظار التفعيل`, cta: "فعّل", href: "/admin/users", urgent: false });
  actions.sort((a, b) => Number(b.urgent) - Number(a.urgent));

  const allClear = actions.length === 0;

  const critical = actions.filter((a) => a.urgent).length;

  return (
    <div>
      <PageHeader
        eyebrow="مركز التحكّم"
        title="فحص اليوم"
        subtitle={allClear ? "كل الأنظمة مستقرّة — لا إجراءات عاجلة الآن." : "ما يحتاج قراراً منك الآن، مرتّباً حسب الأهمية."}
      />

      {/* State band */}
      <MetricBand
        items={[
          { label: "بحاجة إجراء", value: actions.length, sub: `${critical} حرج` },
          { label: "الإيراد الشهري (MRR)", value: `$${s.mrrUsd.toLocaleString("en-US")}` },
          { label: "اشتراكات نشطة", value: s.activeSubs.toLocaleString() },
          { label: "إجمالي العملاء", value: s.totalUsers.toLocaleString() },
          { label: "إجمالي الرسائل", value: s.totalMessages.toLocaleString() },
        ]}
      />

      {/* Attention — the decision list */}
      <Section title="ما يحتاج انتباهك">
        {allClear ? (
          <div className="adm-panel adm-panel-pad" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <CheckCircle2 className="h-6 w-6 shrink-0" style={{ color: "var(--adm-brand)" }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--adm-text)" }}>لا عناصر عاجلة</div>
              <div className="adm-note">لا مدفوعات معلّقة، ولا انقطاع واتساب، ولا حوادث، ولا اشتراكات تحتاج انتباهك.</div>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {actions.map((a, i) => (
              <Link key={i} href={a.href} className={`adm-attn ${a.urgent ? "crit" : "warn"}`}>
                <span className="adm-attn-index">{i + 1}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="adm-note" style={{ marginBottom: 2 }}>{a.area}</div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--adm-text)" }}>{a.problem}</div>
                </div>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--adm-text-2)" }}>
                  {a.cta} <ChevronLeft className="h-3.5 w-3.5" />
                </span>
              </Link>
            ))}
          </div>
        )}
      </Section>

      {/* Platform health */}
      <Section title="صحة المنصّة" action={<Link href="/admin/system-health" className="adm-link" style={{ fontSize: 12 }}>التفاصيل ←</Link>}>
        <PlatformHealthStrip />
      </Section>

      {/* Product status */}
      {(s.activeFeatures !== null || s.activeReleases !== null) && (
        <Section title="المنتج">
          <div className="adm-band">
            {s.activeFeatures !== null && (
              <Link href="/admin/feature-control?status=enabled" className="adm-metric" style={{ display: "block" }}>
                <div className="adm-metric-label">ميزات مفعّلة</div>
                <div className="adm-metric-value">{s.activeFeatures}</div>
              </Link>
            )}
            {s.activeReleases !== null && (
              <Link href="/admin/releases" className="adm-metric" style={{ display: "block" }}>
                <div className="adm-metric-label">إصدارات نشطة</div>
                <div className="adm-metric-value">{s.activeReleases}</div>
              </Link>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}
