import { requirePagePermission } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import BotForm from "./bot-form";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";

export default async function BotSettingsPage() {
  const gate = await pageGate("bot_configuration");
  if (!gate.uid) redirect("/login");
  if (!gate.allowed) return <LockedFeature title="إعداد المساعد الآلي" description="خصّص شخصية مساعدك وأسلوب تعامله مع عملائك" recommendedTier={gate.recommendedTier} />;
  const { user } = await requirePagePermission("settings");
  const bot = user.bot ||
    (await prisma.bot.create({ data: { userId: user.id, notifyPhone: user.phone || undefined } }));

  return (
    <div className="space-y-6">
      <div className="border-b border-white/[0.05] pb-5">
        <h1 className="page-title">المساعد</h1>
        <p className="page-desc mt-1">شخصية المساعد وأسلوب تعامله مع عملائك وإعدادات الإشعارات</p>
      </div>
      <BotForm initial={JSON.parse(JSON.stringify(bot))} userPhone={user.phone || ""} />
    </div>
  );
}
