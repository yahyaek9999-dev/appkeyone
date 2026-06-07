/**
 * Workspace Audit Log viewer (Agent 5 — Enterprise & Security).
 *
 * Shows the append-only history of sensitive actions taken inside this
 * workspace — who did what, when, from where. Gated by the "team" permission
 * (owner + admin role); sales/support/viewer never see this page.
 *
 * Read-only. Metadata was already redacted at write time (no secrets). If the
 * AuditLog table doesn't exist yet (pre `prisma db push`), the page renders an
 * empty state instead of erroring.
 */

import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ScrollText, Filter } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

const ACTION_LABELS: Record<string, string> = {
  "team.member_invited": "دعوة عضو",
  "team.role_changed": "تغيير صلاحية",
  "team.member_removed": "إزالة عضو",
  "order.updated": "تعديل طلب",
  "order.deleted": "حذف طلب",
  "broadcast.created": "إنشاء حملة",
  "integration.connected": "ربط تكامل",
  "integration.deleted": "حذف تكامل",
  "integration.key_rotated": "تدوير مفتاح",
  "settings.ai_provider_changed": "تغيير مزود الذكاء",
  "settings.meta_cloud_changed": "تغيير Meta Cloud",
  "settings.bot_updated": "تعديل إعدادات البوت",
  "whatsapp.connected": "ربط واتساب",
  "whatsapp.disconnected": "فصل واتساب",
  "safety.kill_switch_cleared": "إلغاء مفتاح الإيقاف",
};

const FILTER_TABS: { key?: string; label: string }[] = [
  { label: "الكل" },
  { key: "team.role_changed", label: "الصلاحيات" },
  { key: "broadcast.created", label: "الحملات" },
  { key: "integration.connected", label: "التكاملات" },
  { key: "whatsapp.connected", label: "واتساب" },
  { key: "order.updated", label: "الطلبات" },
];

function badgeColor(action: string): string {
  if (action.startsWith("team.")) return "bg-gold-500/15 text-gold-300";
  if (action.startsWith("whatsapp.")) return "bg-emerald-500/15 text-emerald-300";
  if (action.startsWith("broadcast.")) return "bg-amber-500/15 text-amber-300";
  if (action.startsWith("integration.")) return "bg-sky-500/15 text-sky-300";
  if (action.startsWith("safety.")) return "bg-rose-500/15 text-rose-300";
  return "bg-slate-500/15 text-slate-300";
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams?: { action?: string; page?: string };
}) {
  const { user } = await requirePagePermission("team");

  const action = searchParams?.action;
  const page = Math.max(1, Number(searchParams?.page || 1));
  const take = 100;
  const skip = (page - 1) * take;

  const where: any = { userId: user.id };
  if (action) where.action = action;

  let logs: any[] = [];
  let total = 0;
  try {
    [logs, total] = await Promise.all([
      (prisma as any).auditLog.findMany({ where, orderBy: { at: "desc" }, take, skip }),
      (prisma as any).auditLog.count({ where }),
    ]);
  } catch {
    // Table not migrated yet — render empty state.
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-gold-500 to-teal-500 shadow-lg shadow-gold-500/20">
          <ScrollText className="h-5 w-5 text-white" />
        </span>
        <div>
          <h1 className="text-2xl font-bold">سجل النشاط</h1>
          <p className="text-sm text-slate-400">
            سجل غير قابل للتعديل لكل الإجراءات الحساسة داخل مساحة العمل — من فعل ماذا ومتى.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Filter className="h-4 w-4 text-slate-500" />
        {FILTER_TABS.map((t) => {
          const active = t.key ? action === t.key : !action;
          const href = t.key ? `/dashboard/audit-log?action=${t.key}` : "/dashboard/audit-log";
          return (
            <Link
              key={t.label}
              href={href}
              className={
                "rounded-full px-3 py-1 transition " +
                (active
                  ? "bg-gold-500/20 text-gold-200"
                  : "bg-white/5 text-slate-400 hover:bg-white/10")
              }
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        <div className="border-b border-white/10 p-4 text-sm font-bold">
          آخر {take} حدث {total > 0 ? `(الإجمالي ${total})` : ""}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-slate-400">
              <tr>
                <th className="p-3 text-right">الإجراء</th>
                <th className="p-3 text-right">المنفّذ</th>
                <th className="p-3 text-right">الصلاحية</th>
                <th className="p-3 text-right">الهدف</th>
                <th className="p-3 text-right">التفاصيل</th>
                <th className="p-3 text-right">IP</th>
                <th className="p-3 text-right">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    لا يوجد نشاط مسجّل بعد.
                  </td>
                </tr>
              )}
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="p-3">
                    <span className={`rounded px-2 py-0.5 text-xs ${badgeColor(l.action)}`}>
                      {ACTION_LABELS[l.action] || l.action}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-slate-300">{l.actorEmail || "—"}</td>
                  <td className="p-3 text-xs text-slate-400">{l.actorRole || "—"}</td>
                  <td className="p-3 font-mono text-[11px] text-slate-400">
                    {l.targetType ? `${l.targetType}${l.targetId ? `:${String(l.targetId).slice(0, 8)}` : ""}` : "—"}
                  </td>
                  <td className="max-w-[220px] truncate p-3 text-xs text-slate-500" dir="ltr">
                    {l.metadata && l.metadata !== "{}" ? l.metadata : "—"}
                  </td>
                  <td className="p-3 font-mono text-[11px] text-slate-500" dir="ltr">{l.ip || "—"}</td>
                  <td className="p-3 text-xs text-slate-400">
                    {new Date(l.at).toLocaleString("ar-EG")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {(page > 1 || logs.length === take) && (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link
              href={`/dashboard/audit-log?${action ? `action=${action}&` : ""}page=${page - 1}`}
              className="rounded-lg bg-white/5 px-4 py-2 hover:bg-white/10"
            >
              السابق
            </Link>
          ) : (
            <span />
          )}
          <span className="text-slate-500">صفحة {page}</span>
          {logs.length === take ? (
            <Link
              href={`/dashboard/audit-log?${action ? `action=${action}&` : ""}page=${page + 1}`}
              className="rounded-lg bg-white/5 px-4 py-2 hover:bg-white/10"
            >
              التالي
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
