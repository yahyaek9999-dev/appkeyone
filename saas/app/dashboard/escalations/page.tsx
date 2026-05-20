import { redirect } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  MessageSquareWarning,
} from "lucide-react";
import { getUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import EscalationActions from "@/app/dashboard/escalations/ticket-actions";

export const dynamic = "force-dynamic";

export default async function EscalationsPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");

  const [tickets, metrics] = await Promise.all([
    (prisma as any).escalationTicket
      .findMany({
        where: {
          userId: uid,
          status: { in: ["open", "acknowledged", "human_active"] },
        },
        orderBy: [{ severity: "desc" }, { updatedAt: "desc" }],
        take: 100,
      })
      .catch(() => []),
    Promise.all([
      (prisma as any).escalationTicket
        .count({ where: { userId: uid, status: "open" } })
        .catch(() => 0),
      (prisma as any).escalationTicket
        .count({ where: { userId: uid, status: "acknowledged" } })
        .catch(() => 0),
      (prisma as any).escalationTicket
        .count({
          where: {
            userId: uid,
            severity: { in: ["high", "critical"] },
            status: { in: ["open", "acknowledged", "human_active"] },
          },
        })
        .catch(() => 0),
    ]),
  ]);

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <MessageSquareWarning className="h-6 w-6 text-amber-400" />
          التصعيدات والتدخل البشري
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          تذاكر حقيقية من المحادثات الغاضبة، طلبات الاسترجاع، أو سوء الفهم
          المتكرر.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card
          icon={<AlertTriangle className="h-4 w-4" />}
          label="مفتوحة"
          value={metrics[0]}
          tone="amber"
        />
        <Card
          icon={<Clock className="h-4 w-4" />}
          label="تم استلامها"
          value={metrics[1]}
          tone="sky"
        />
        <Card
          icon={<AlertTriangle className="h-4 w-4" />}
          label="حرجة"
          value={metrics[2]}
          tone="rose"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40">
        <div className="border-b border-white/10 p-4 font-bold">
          قائمة التصعيدات
        </div>
        {tickets.length === 0 && (
          <div className="p-8 text-center text-sm text-slate-400">
            لا توجد تصعيدات مفتوحة حالياً.
          </div>
        )}
        {tickets.map((t: any) => (
          <div key={t.id} className="border-b border-white/5 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-white">
                    {t.summary || "تصعيد"}
                  </span>
                  <Badge
                    text={t.severity}
                    tone={
                      t.severity === "critical" || t.severity === "high"
                        ? "rose"
                        : "amber"
                    }
                  />
                  <Badge
                    text={t.status}
                    tone={t.status === "open" ? "amber" : "sky"}
                  />
                  <Badge text={t.handoffState} tone="slate" />
                </div>
                <div className="text-xs text-slate-400">
                  الغضب {t.angerScore}/100 · الثقة {t.confidenceScore}/100 ·
                  الإحباط {t.frustrationScore}/100
                </div>
                <div className="whitespace-pre-wrap rounded-xl bg-black/20 p-3 text-sm text-slate-200">
                  {t.lastCustomerMessage}
                </div>
                <div className="text-xs text-slate-500">
                  {new Date(t.updatedAt).toLocaleString("ar-EG")}
                </div>
              </div>
              <EscalationActions ticketId={t.id} status={t.status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Card({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: string;
}) {
  const cls: Record<string, string> = {
    amber: "border-amber-500/25 bg-amber-500/10 text-amber-200",
    sky: "border-sky-500/25 bg-sky-500/10 text-sky-200",
    rose: "border-rose-500/25 bg-rose-500/10 text-rose-200",
  };
  return (
    <div className={`rounded-2xl border p-4 ${cls[tone] || cls.amber}`}>
      <div className="flex items-center justify-between text-xs opacity-80">
        <span>{label}</span>
        {icon}
      </div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
    </div>
  );
}

function Badge({ text, tone }: { text: string; tone: string }) {
  const cls: Record<string, string> = {
    rose: "border-rose-500/25 bg-rose-500/10 text-rose-200",
    amber: "border-amber-500/25 bg-amber-500/10 text-amber-200",
    sky: "border-sky-500/25 bg-sky-500/10 text-sky-200",
    slate: "border-white/10 bg-white/5 text-slate-300",
  };
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs ${cls[tone] || cls.slate}`}
    >
      {text}
    </span>
  );
}
