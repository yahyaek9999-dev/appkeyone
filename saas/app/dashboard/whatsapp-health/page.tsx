/** /dashboard/whatsapp-health — WhatsApp (QR) session health + actions (B2). */
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import WhatsappHealthClient from "./whatsapp-health-client";

export const dynamic = "force-dynamic";

export default async function WhatsappHealthPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  const bot = (await prisma.bot.findUnique({ where: { userId: uid }, select: { whatsappStatus: true, whatsappPhone: true } })) as any;
  const warnings = await prisma.waComplianceAudit.findMany({
    where: { userId: uid, provider: "qr", category: { in: ["rate_limit", "policy", "window_24h"] } },
    orderBy: { createdAt: "desc" }, take: 10,
    select: { severity: true, category: true, title: true, detail: true, createdAt: true },
  }).catch(() => [] as any[]);
  const warnCount = await prisma.waComplianceAudit.count({ where: { userId: uid, provider: "qr", severity: { in: ["warn", "block", "critical"] } } }).catch(() => 0);

  return (
    <div className="space-y-6">
      <h1 className="page-title mb-1">صحة جلسة واتساب</h1>
      <p className="page-desc">حالة جلسة الربط (QR)، التحذيرات وحدود الإرسال، مع إعادة الربط أو إعادة التشغيل أو استبدال الجلسة.</p>
      <WhatsappHealthClient
        initial={{ status: bot?.whatsappStatus || "disconnected", phone: bot?.whatsappPhone || null }}
        warnings={JSON.parse(JSON.stringify(warnings))}
        warnCount={warnCount}
      />
    </div>
  );
}
