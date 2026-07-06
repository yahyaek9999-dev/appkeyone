/** /dashboard/meta-health — Meta Cloud connection health + actions (B1). */
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeConnectionMode } from "@/lib/messaging/mode";
import MetaHealthClient from "./meta-health-client";

export const dynamic = "force-dynamic";

export default async function MetaHealthPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  const bot = (await prisma.bot.findUnique({ where: { userId: uid } })) as any;
  const issues = await prisma.waComplianceAudit.findMany({
    where: { userId: uid, provider: "meta_cloud" }, orderBy: { createdAt: "desc" }, take: 8,
    select: { severity: true, category: true, title: true, detail: true, createdAt: true },
  }).catch(() => [] as any[]);

  const mode = bot ? normalizeConnectionMode(bot.connectionMode) : "qr";
  const hasCreds = !!(bot?.metaPhoneNumberId && bot?.metaAccessTokenEnc);
  const data = {
    mode,
    phoneNumberId: bot?.metaPhoneNumberId || "",
    businessAccountId: bot?.metaBusinessAccountId || "",
    hasToken: !!bot?.metaAccessTokenEnc,
    hasWebhookToken: !!bot?.metaWebhookVerifyToken,
    qualityRating: bot?.metaQualityRating || null,
    messagingLimit: bot?.metaMessagingLimit || null,
    verifiedAt: bot?.metaVerifiedAt ? new Date(bot.metaVerifiedAt).toISOString() : null,
    connected: mode === "meta_cloud" && hasCreds && !!bot?.metaVerifiedAt,
    configured: hasCreds,
  };
  return (
    <div className="space-y-6">
      <h1 className="page-title mb-1">صحة اتصال Meta</h1>
      <p className="page-desc">حالة اتصال واتساب الرسمي (Meta Cloud): التوكن، الويبهوك، جودة الرقم، وآخر تحقق ناجح — مع اختبار فوري.</p>
      <MetaHealthClient data={data} issues={JSON.parse(JSON.stringify(issues))} />
    </div>
  );
}
