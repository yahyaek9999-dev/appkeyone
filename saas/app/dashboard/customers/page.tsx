import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Users, MessageSquare, ArrowUpRight, Download } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCustomerPhone } from "@/lib/phone";
import { PageHeader } from "@/components/patterns/page-header";

const PAGE_SIZE = 30;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams?: { q?: string; page?: string };
}) {
  const { user } = await requirePagePermission("customers");
  const q = (searchParams?.q || "").trim();
  const page = Math.max(1, parseInt(searchParams?.page || "1", 10) || 1);
  // archivedAt is documented as "hidden from active views" (schema.prisma)
  // but no list query actually excluded it — archiving a customer silently
  // did nothing. Excluded here to make the feature actually work.
  const where: any = { userId: user.id, archivedAt: null };
  if (q) where.OR = [{ name: { contains: q } }, { phone: { contains: q } }];

  const [customers, total, active7d] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { lastSeenAt: "desc" },
      include: {
        conversation: {
          include: {
            messages: { orderBy: { createdAt: "desc" }, take: 1 },
            _count: { select: { messages: true } },
          },
        },
      },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.customer.count({ where }),
    prisma.customer.count({
      where: { userId: user.id, lastSeenAt: { gte: new Date(Date.now() - 7 * 86400000) } },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) =>
    `/dashboard/customers?${q ? `q=${encodeURIComponent(q)}&` : ""}page=${p}`;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="border-b border-white/[0.05] pb-5">
        <PageHeader
          title="العملاء"
          description={
            <span className="flex items-center gap-3 text-[12px]">
              <span className="text-slate-400">{total.toLocaleString("ar-EG")} إجمالي</span>
              <span className="text-white/20">·</span>
              <span className="text-emerald-400">{active7d.toLocaleString("ar-EG")} نشط هذا الأسبوع</span>
              {q && <span className="text-slate-500">· نتائج "{q}"</span>}
            </span>
          }
          actions={
            <>
              <form action="/dashboard/customers" method="get" className="flex items-center gap-2">
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="بحث بالاسم أو الهاتف…"
                  className="input h-9 w-44 px-3 text-[13px]"
                />
                <button type="submit" className="btn-ghost h-9 text-[13px]">بحث</button>
              </form>
              <a href="/api/export?type=customers&format=csv" download className="btn-ghost h-9 text-[13px] inline-flex items-center gap-1">
                <Download className="h-3.5 w-3.5" />
                تصدير CSV
              </a>
              <Link href="/dashboard/customers/import" className="btn-ghost h-9 text-[13px]">استيراد</Link>
              <Link href="/dashboard/inbox" className="btn-ghost h-9 text-[13px]">
                <MessageSquare className="h-4 w-4" />
                صندوق المحادثات
              </Link>
            </>
          }
          className="flex-wrap"
          actionsClassName="w-full flex-wrap sm:w-auto"
        />
      </div>

      {customers.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Users className="h-full w-full" />}
            title={q ? "لا نتائج مطابقة" : "لسه ما فيش عملاء"}
            description={q ? `لا يوجد عميل يطابق «${q}». جرّب بحثاً آخر.` : "هيظهروا هنا تلقائياً لما يبعتوا رسائل لبوتك على واتساب."}
            size="lg"
            action={
              q ? (
                <Link href="/dashboard/customers" className="btn-primary inline-flex">مسح البحث</Link>
              ) : (
                <Link href="/dashboard/playground" className="btn-primary inline-flex">
                  <MessageSquare className="h-4 w-4" />
                  جرّب البوت بنفسك
                </Link>
              )
            }
          />
        </div>
      ) : (
        <div className="card overflow-hidden">
          {/* Premium CRM table header — dense, uppercase */}
          <div className="hidden grid-cols-[1fr_140px_100px_100px_80px] items-center gap-3 border-b border-white/[0.06] px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-slate-500 sm:grid">
            <span>العميل</span>
            <span>الهاتف</span>
            <span className="text-center">آخر نشاط</span>
            <span className="text-center">الرسائل</span>
            <span className="text-center"></span>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {customers.map((c) => {
              const last = c.conversation?.messages?.[0];
              const count = c.conversation?._count?.messages ?? 0;
              const p = formatCustomerPhone(c.phone);
              const isActive = c.lastSeenAt && Date.now() - new Date(c.lastSeenAt).getTime() < 24 * 60 * 60 * 1000;
              return (
                <div
                  key={c.id}
                  className="group grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-2.5 sm:grid-cols-[1fr_140px_100px_100px_80px]"
                >
                  {/* Identity + last message */}
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="relative shrink-0">
                      <Avatar name={c.name || c.phone} size="md" />
                      {isActive && (
                        <span className="absolute -bottom-0.5 -end-0.5 h-2.5 w-2.5 rounded-full border-2 border-canvas-deep bg-emerald-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Link href={`/dashboard/customers/${c.id}`} className="truncate text-[14px] font-medium text-white transition-colors hover:text-brand-300">
                          {c.name || "بدون اسم"}
                        </Link>
                      </div>
                      {last && (
                        <div className="truncate text-[12px] text-slate-500 leading-tight mt-0.5">
                          {last.role === "user" ? "← " : "→ "}
                          {last.content}
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Phone */}
                  <div className="hidden text-[12px] text-slate-400 sm:block font-mono" dir="ltr">
                    {p.display}
                  </div>
                  {/* Last activity */}
                  <div className="hidden text-[12px] text-slate-500 sm:text-center sm:block">
                    {timeAgo(c.lastSeenAt)}
                  </div>
                  {/* Messages */}
                  <div className="hidden text-[12px] tabular-nums text-slate-400 sm:text-center sm:block">
                    {count.toLocaleString("ar-EG")}
                  </div>
                  {/* Action */}
                  <div className="flex justify-end">
                    <Link
                      href={`/dashboard/customers/${c.id}`}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 opacity-0 transition-all hover:bg-white/[0.04] hover:text-white group-hover:opacity-100"
                    >
                      فتح <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-[13px]">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="btn-ghost h-8">السابق</Link>
          ) : (
            <span className="h-8" />
          )}
          <span className="text-slate-400">
            صفحة {page.toLocaleString("ar-EG")} من {totalPages.toLocaleString("ar-EG")}
          </span>
          {page < totalPages ? (
            <Link href={pageHref(page + 1)} className="btn-ghost h-8">التالي</Link>
          ) : (
            <span className="h-8" />
          )}
        </div>
      )}
    </div>
  );
}
