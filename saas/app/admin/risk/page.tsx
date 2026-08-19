// /admin/risk — Tenant Risk Center. Deterministic, explainable risk from real
// signals (lib/admin/tenant-risk). Enterprise composition: metric band + table.
import Link from "next/link";
import { getTenantRiskList, riskLevelMeta } from "@/lib/admin/tenant-risk";
import { PageHeader, MetricBand, TableShell, Empty, StatusPill, type PillTone } from "../_ui/primitives";

export const dynamic = "force-dynamic";

const TONE: Record<string, PillTone> = { critical: "bad", high: "warn", medium: "warn", low: "ok" };

export default async function AdminRiskPage() {
  const { rows, cohort, windowDays } = await getTenantRiskList({ minScore: 20, take: 300 });
  const critical = rows.filter((r) => r.level === "critical").length;
  const high = rows.filter((r) => r.level === "high").length;

  return (
    <div>
      <PageHeader
        eyebrow="ذكاء التشغيل"
        title="مخاطر التجّار"
        subtitle="درجات خطر حتمية مبنية على إشارات فعلية — كل نقطة موثّقة في الكود."
      />

      <MetricBand
        items={[
          { label: "حرج", value: critical },
          { label: "مرتفع", value: high },
          { label: "بحاجة مراجعة", value: rows.length },
          { label: "الكوهورت المُقيَّم", value: cohort, sub: `نافذة ${windowDays} يوم` },
        ]}
      />

      <div style={{ marginTop: 20 }}>
        {rows.length === 0 ? (
          <Empty>لا تجّار بمخاطر تُذكر — كل الحسابات ضمن الحدود.</Empty>
        ) : (
          <TableShell
            head={
              <tr>
                <th style={{ width: 64 }}>الدرجة</th>
                <th>التاجر</th>
                <th>الإشارات المُساهِمة</th>
                <th>الإجراء المقترح</th>
              </tr>
            }
          >
            {rows.map((r) => {
              const m = riskLevelMeta(r.level);
              return (
                <tr key={r.userId}>
                  <td className="num">
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 17, fontWeight: 700, color: "var(--adm-text)" }}>{r.score}</span>
                      <StatusPill tone={TONE[r.level]} dot={false}>{m.label}</StatusPill>
                    </div>
                  </td>
                  <td>
                    <Link href={`/admin/tenants/${r.userId}`} className="adm-link" style={{ fontWeight: 600, color: "var(--adm-text)" }}>
                      {r.name || r.email || r.userId}
                    </Link>
                    {r.email && r.name && <div className="adm-mono" style={{ color: "var(--adm-text-4)" }} dir="ltr">{r.email}</div>}
                  </td>
                  <td>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {r.reasons.map((reason, i) => (
                        <span key={i} className="adm-pill adm-pill-neutral">
                          {reason.label}<span style={{ color: "#fda4af", marginInlineStart: 4 }}>+{reason.points}</span>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="adm-note" style={{ color: "var(--adm-text-3)" }}>{r.recommendedAction}</td>
                </tr>
              );
            })}
          </TableShell>
        )}
      </div>
    </div>
  );
}
