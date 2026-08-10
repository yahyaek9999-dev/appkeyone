import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import BotForm from "./bot-form";

export default async function BotSettingsPage() {
  const { user } = await requirePagePermission("settings");
  const bot = user.bot ||
    (await prisma.bot.create({ data: { userId: user.id, notifyPhone: user.phone || undefined } }));

  return (
    <div>
      <h1 className="page-title mb-1">إعدادات المساعد</h1>
      <p className="page-desc mb-8">شخصية المساعد، أسلوب حديثه، ومتى يُخطرك</p>
      <BotForm initial={JSON.parse(JSON.stringify(bot))} userPhone={user.phone || ""} />
    </div>
  );
}
