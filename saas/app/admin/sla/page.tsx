// /admin/sla — SLA Center. Only metrics the app actually records; honest about
// missing history / data. Enterprise composition: table of measured metrics.
import { getSlaMetrics, type SlaStatus } from "@/lib/admin/sla";
import { PageHeader, TableShell, StatusPill, type PillTone } from "../_ui/primitives";

export const dynamic = "force-dynamic";

const TONE: Record<SlaStatus, PillTone> = { healthy: "ok", at_risk: "warn", breached: "bad", unavailable: "neutral" };
const LABEL: Record<SlaStatus, string> = { healthy: "سليم", at_risk: "معرّض", breached: "متجاوَز", unavailable: "غير متاح" };

export default async function AdminSlaPage() {
  const { metrics, windowDays } = await getSlaMetrics(7);
  return (
    <div>
      <PageHeader
        eyebrow="التشغيل"
        title="مستوى الخدمة (SLA)"
        subtitle={`قياسات فعلية على آخر ${windowDays} أيام من البيانات المُسجّلة. الأهداف افتراضية متحفّظة (غير تعاقدية).`}
      />

      <TableShell
        head={
          <tr>
            <th>المقياس</th>
            <th className="num">الحالي</th>
            <th className="num">الهدف</th>
            <th className="num">العيّنة</th>
            <th>الحالة</th>
            <th>ملاحظة</th>
          </tr>
        }
      >
        {metrics.map((m) => (
          <tr key={m.key}>
            <td style={{ fontWeight: 600, color: "var(--adm-text)" }}>{m.label}</td>
            <td className="num" style={{ color: "var(--adm-text)", fontWeight: 600 }}>
              {m.current != null ? `${m.current.toLocaleString()}${m.unit}` : "—"}
            </td>
            <td className="num" style={{ color: "var(--adm-text-3)" }}>{m.target}{m.unit}</td>
            <td className="num" style={{ color: "var(--adm-text-3)" }}>{m.sampleSize > 0 ? m.sampleSize.toLocaleString() : "—"}</td>
            <td><StatusPill tone={TONE[m.status]}>{LABEL[m.status]}</StatusPill></td>
            <td className="adm-note" style={{ color: "var(--adm-text-4)" }}>
              {m.note}{!m.historical && m.current != null ? " · لا سجل تاريخي" : ""}
            </td>
          </tr>
        ))}
      </TableShell>
    </div>
  );
}
