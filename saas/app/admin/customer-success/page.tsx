// /admin/customer-success — actionable Admin queue from real signals.
// Enterprise composition: metric band + table, each row links to Tenant 360.
import Link from "next/link";
import { getCustomerSuccessQueue, csCategoryLabel, type CsCategory } from "@/lib/admin/customer-success";
import { PageHeader, MetricBand, TableShell, Empty, StatusPill, type PillTone } from "../_ui/primitives";

export const dynamic = "force-dynamic";

const URGENCY_TONE: Record<string, PillTone> = { high: "bad", medium: "warn", low: "neutral" };
const URGENCY_LABEL: Record<string, string> = { high: "عاجل", medium: "متوسط", low: "منخفض" };

export default async function CustomerSuccessPage() {
  const { items, counts } = await getCustomerSuccessQueue({ take: 300 });
  const cats = Object.keys(counts) as CsCategory[];
  const high = items.filter((i) => i.urgency === "high").length;

  return (
    <div>
      <PageHeader
        eyebrow="عمليات العملاء"
        title="نجاح العملاء"
        subtitle="من تحتاج التواصل معه، ولماذا، وما الخطوة التالية — مشتقّة من بيانات فعلية."
      />

      <MetricBand
        items={[
          { label: "إجمالي العناصر", value: items.length },
          { label: "عاجل", value: high },
          ...cats.slice(0, 3).map((c) => ({ label: csCategoryLabel(c), value: counts[c] })),
        ]}
      />

      <div style={{ marginTop: 20 }}>
        {items.length === 0 ? (
          <Empty>لا عناصر متابعة حالياً.</Empty>
        ) : (
          <TableShell
            head={
              <tr>
                <th style={{ width: 90 }}>الأولوية</th>
                <th>التصنيف</th>
                <th>التاجر</th>
                <th>السبب / الإجراء</th>
                <th style={{ width: 90 }}></th>
              </tr>
            }
          >
            {items.map((it, i) => (
              <tr key={`${it.userId}-${it.category}-${i}`}>
                <td><StatusPill tone={URGENCY_TONE[it.urgency]} dot={false}>{URGENCY_LABEL[it.urgency]}</StatusPill></td>
                <td className="adm-note" style={{ color: "var(--adm-text-2)" }}>{csCategoryLabel(it.category)}</td>
                <td>
                  <span style={{ color: "var(--adm-text)", fontWeight: 500 }}>{it.name || it.email || it.userId}</span>
                  {it.data && <div className="adm-note" style={{ color: "var(--adm-text-4)" }}>{it.data}</div>}
                </td>
                <td>
                  <div style={{ color: "var(--adm-text-2)", fontSize: 13 }}>{it.reason}</div>
                  <div className="adm-note" style={{ color: "var(--adm-text-4)" }}>→ {it.recommendedAction}</div>
                </td>
                <td style={{ textAlign: "end" }}>
                  <Link href={`/admin/tenants/${it.userId}`} className="adm-link" style={{ fontSize: 12 }}>عرض 360°</Link>
                </td>
              </tr>
            ))}
          </TableShell>
        )}
      </div>
    </div>
  );
}
