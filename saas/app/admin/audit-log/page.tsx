/**
 * Cross-tenant Audit Log viewer — platform admin only.
 *
 * The per-workspace viewer (dashboard/audit-log) scopes to a single owner's
 * team activity. This is the platform-admin equivalent: every tenant's
 * AuditLog rows, filterable by workspace email or action. Gated by the
 * shared /admin layout (requireAdmin mirror) — no page-level check needed.
 *
 * Read-only. If the AuditLog table isn't migrated yet, renders empty instead
 * of erroring (mirrors the per-workspace viewer's contract).
 */

import { prisma } from "@/lib/db";
import { ScrollText, Filter } from "lucide-react";
import Link from "next/link";
import { AUDIT_ACTION_LABELS, auditBadgeColor } from "@/lib/audit/labels";
import AuditDiff from "./audit-diff";

export const dynamic = "force-dynamic";

const FILTER_TABS: { key?: string; label: string }[] = [
  { label: "الكل" },
  { key: "admin.", label: "إجراءات الأدمن" },
  { key: "team.", label: "الصلاحيات" },
  { key: "broadcast.", label: "الحملات" },
  { key: "integration.", label: "التكاملات" },
  { key: "whatsapp.", label: "واتساب" },
];

export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams?: { action?: string; workspace?: string; page?: string };
}) {
  const actionPrefix = searchParams?.action;
  const workspaceEmail = searchParams?.workspace?.trim();
  const page = Math.max(1, Number(searchParams?.page || 1));
  const take = 100;
  const skip = (page - 1) * take;

  const where: any = {};
  if (actionPrefix) where.action = { startsWith: actionPrefix };

  let ownerIds: string[] | null = null;
  if (workspaceEmail) {
    const owners = await prisma.user.findMany({
      where: { email: { contains: workspaceEmail } },
      select: { id: true },
      take: 50,
    });
    ownerIds = owners.map((o) => o.id);
    where.userId = { in: ownerIds.length ? ownerIds : ["__none__"] };
  }

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

  // Resolve owning workspace email for each row shown (small page, bounded lookup).
  const ownerEmails = new Map<string, string>();
  if (logs.length) {
    const ids = Array.from(new Set(logs.map((l) => l.userId)));
    const owners = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } });
    for (const o of owners) ownerEmails.set(o.id, o.email);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-gold-500 to-teal-500 shadow-lg shadow-gold-500/20">
          <ScrollText className="h-5 w-5 text-white" />
        </span>
        <div>
          <h1 className="page-title">سجل النشاط — كل التجّار</h1>
          <p className="text-sm text-slate-400">
            سجل غير قابل للتعديل لكل الإجراءات الحساسة عبر كل مساحات العمل — من فعل ماذا، متى، وفي أي حساب.
          </p>
        </div>
      </div>

      <form action="/admin/audit-log" method="get" className="flex flex-wrap items-center gap-2">
        {actionPrefix && <input type="hidden" name="action" value={actionPrefix} />}
        <input
          type="text"
          name="workspace"
          defaultValue={workspaceEmail || ""}
          placeholder="فلترة ببريد صاحب الحساب..."
          dir="ltr"
          className="w-64 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm outline-none"
        />
        <button type="submit" className="rounded-lg bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10">
          بحث
        </button>
        {workspaceEmail && (
          <Link href={actionPrefix ? `/admin/audit-log?action=${actionPrefix}` : "/admin/audit-log"} className="text-xs text-slate-500 hover:text-slate-300">
            مسح الفلتر
          </Link>
        )}
      </form>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Filter className="h-4 w-4 text-slate-500" />
        {FILTER_TABS.map((t) => {
          const active = t.key ? actionPrefix === t.key : !actionPrefix;
          const qs = new URLSearchParams();
          if (t.key) qs.set("action", t.key);
          if (workspaceEmail) qs.set("workspace", workspaceEmail);
          const href = `/admin/audit-log${qs.toString() ? `?${qs}` : ""}`;
          return (
            <Link
              key={t.label}
              href={href}
              className={
                "rounded-full px-3 py-1 transition " +
                (active ? "bg-gold-500/20 text-gold-200" : "bg-white/5 text-slate-400 hover:bg-white/10")
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
                <th className="p-3 text-right">مساحة العمل</th>
                <th className="p-3 text-right">الإجراء</th>
                <th className="p-3 text-right">المنفّذ</th>
                <th className="p-3 text-right">الصلاحية</th>
                <th className="p-3 text-right">الهدف</th>
                <th className="p-3 text-right">التغيير</th>
                <th className="p-3 text-right">IP</th>
                <th className="p-3 text-right">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500">
                    لا يوجد نشاط مطابق.
                  </td>
                </tr>
              )}
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="p-3 text-xs text-slate-300" dir="ltr">{ownerEmails.get(l.userId) || l.userId.slice(0, 8)}</td>
                  <td className="p-3">
                    <span className={`rounded px-2 py-0.5 text-xs ${auditBadgeColor(l.action)}`}>
                      {AUDIT_ACTION_LABELS[l.action] || l.action}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-slate-300">{l.actorEmail || "—"}</td>
                  <td className="p-3 text-xs text-slate-400">{l.actorRole || "—"}</td>
                  <td className="p-3 font-mono text-[11px] text-slate-400">
                    {l.targetType ? `${l.targetType}${l.targetId ? `:${String(l.targetId).slice(0, 8)}` : ""}` : "—"}
                  </td>
                  <td className="p-3 text-[11px]"><AuditDiff metadata={l.metadata || "{}"} /></td>
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
              href={`/admin/audit-log?${actionPrefix ? `action=${actionPrefix}&` : ""}${workspaceEmail ? `workspace=${workspaceEmail}&` : ""}page=${page - 1}`}
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
              href={`/admin/audit-log?${actionPrefix ? `action=${actionPrefix}&` : ""}${workspaceEmail ? `workspace=${workspaceEmail}&` : ""}page=${page + 1}`}
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
