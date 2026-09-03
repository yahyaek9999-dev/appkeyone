import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Users, MessageSquare, ArrowUpRight, Download } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCustomerPhone } from "@/lib/phone";
import { PageHeader, HeaderFact } from "@/components/patterns/page-header";

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

  // Relationship VALUE for the visible page only (§21: a customer list has to
  // answer "is this person worth my attention?", which the old list never did —
  // it showed identity, phone and a message count and nothing else). One
  // groupBy over the ~30 rows on screen, not a per-row query.
  const valueRows = customers.length
    ? await (prisma as any).order.groupBy({
        by: ["customerId"],
        where: {
          userId: user.id,
          customerId: { in: customers.map((c) => c.id) },
          status: { in: ["confirmed", "shipped", "delivered"] },
        },
        _sum: { total: true },
        _count: { _all: true },
      })
    : [];
  const valueByCustomer = new Map<string, { spend: number; orders: number }>(
    valueRows.map((r: any) => [r.customerId, { spend: r._sum?.total || 0, orders: r._count?._all || 0 }]),
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) =>
    `/dashboard/customers?${q ? `q=${encodeURIComponent(q)}&` : ""}page=${p}`;

  return (
    <div className="space-y-5">
      <PageHeader
        divider
        title="العملاء"
        description="كل من راسل حسابك — ومعه ما اشتراه وآخر مرة تكلّم فيها، عشان تعرف مين يستاهل متابعة."
        meta={
          total > 0
            ? [
                <HeaderFact key="t" value={total.toLocaleString("ar-EG")} label="عميل" />,
                <HeaderFact key="a" value={active7d.toLocaleString("ar-EG")} label="نشط هذا الأسبوع" tone="positive" />,
                q ? <HeaderFact key="q" value={`«${q}»`} label="نتائج البحث" /> : null,
              ]
            : undefined
        }
        secondary={
          <>
            <form action="/dashboard/customers" method="get" role="search" aria-label="بحث العملاء" className="flex items-center gap-2">
              <input
                name="q"
                defaultValue={q}
                placeholder="بحث بالاسم أو الهاتف…"
                aria-label="بحث بالاسم أو الهاتف"
                className="input h-9 w-44 px-3 text-[13px]"
              />
              <button type="submit" className="btn-ghost h-9 text-[13px]">بحث</button>
            </form>
            <a href="/api/export?type=customers&format=csv" download className="btn-ghost h-9 text-[13px] inline-flex items-center gap-1">
              <Download className="h-3.5 w-3.5" />
              تصدير
            </a>
            <Link href="/dashboard/customers/import" className="btn-ghost h-9 text-[13px]">استيراد</Link>
          </>
        }
        actions={
          <Link href="/dashboard/inbox" className="btn-primary h-9 inline-flex text-[13px]">
            <MessageSquare className="h-4 w-4" />
            صندوق المحادثات
          </Link>
        }
      />

      {customers.length === 0 && q ? (
        <div className="card">
          <EmptyState
            icon={<Users className="h-full w-full" />}
            title="لا نتائج مطابقة"
            description={`لا يوجد عميل يطابق «${q}». جرّب بحثاً آخر.`}
            action={<Link href="/dashboard/customers" className="btn-ghost inline-flex">مسح البحث</Link>}
          />
        </div>
      ) : customers.length === 0 ? (
        <EmptyState
          variant="page"
          icon={<Users className="h-full w-full" />}
          title="سجل عملائك لسه فاضي"
          description="كل رقم يراسل حسابك يتحوّل هنا إلى ملف عميل — الاسم، الرقم، كل محادثة، وكل طلب اشتراه. مش محتاج تسجّل حد بنفسك."
          hint="الملف بيتبنى تلقائياً من أول رسالة. لو عندك قائمة عملاء قديمة، استوردها وابدأ بتاريخ كامل بدل صفر."
          action={
            <Link href="/dashboard/customers/import" className="btn-primary inline-flex">
              استورد قائمة عملائك
            </Link>
          }
          secondaryAction={
            <Link href="/dashboard/playground" className="btn-ghost inline-flex">
              <MessageSquare className="h-4 w-4" />
              جرّب المساعد بنفسك
            </Link>
          }
          steps={[
            { title: "اربط واتساب", body: "الرسائل الواردة هي مصدر ملفات العملاء." },
            { title: "أو استورد", body: "ملف CSV بالأسماء والأرقام يبني السجل فوراً." },
            { title: "تابع من هنا", body: "قيمة كل عميل وآخر نشاط في مكان واحد." },
          ]}
        />
      ) : (
        <div className="card overflow-hidden">
          {/* Premium CRM table header — dense, uppercase */}
          <div className="hidden grid-cols-[1fr_140px_120px_110px_80px] items-center gap-3 border-b border-white/[0.06] px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-slate-500 sm:grid">
            <span>العميل</span>
            <span>الهاتف</span>
            <span className="text-center">القيمة</span>
            <span className="text-center">آخر نشاط</span>
            <span className="text-center"></span>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {customers.map((c) => {
              const last = c.conversation?.messages?.[0];
              const count = c.conversation?._count?.messages ?? 0;
              const v = valueByCustomer.get(c.id) || { spend: 0, orders: 0 };
              const p = formatCustomerPhone(c.phone);
              const isActive = c.lastSeenAt && Date.now() - new Date(c.lastSeenAt).getTime() < 24 * 60 * 60 * 1000;
              return (
                <div
                  key={c.id}
                  className="group grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.015] sm:grid-cols-[1fr_140px_120px_110px_80px]"
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
                  {/* Relationship value — the column that turns a contact list
                      into a CRM. Spend leads; order count is its footnote. */}
                  <div className="hidden sm:block sm:text-center">
                    {v.orders > 0 ? (
                      <>
                        <div className="text-[13px] font-semibold tabular-nums text-white">
                          {v.spend.toLocaleString("ar-EG")} <span className="text-[11px] font-normal text-slate-500">ج.م</span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {v.orders.toLocaleString("ar-EG")} طلب
                        </div>
                      </>
                    ) : (
                      <div className="text-[12px] text-slate-600">
                        {count > 0 ? `${count.toLocaleString("ar-EG")} رسالة` : "—"}
                      </div>
                    )}
                  </div>
                  {/* Last activity */}
                  <div className="hidden text-[12px] text-slate-500 sm:text-center sm:block">
                    {timeAgo(c.lastSeenAt)}
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
