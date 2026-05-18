import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import BotForm from "./bot-form";

export default async function BotSettingsPage() {
  const user = await requireUser();
  const bot = user.bot ||
    (await prisma.bot.create({ data: { userId: user.id, notifyPhone: user.phone || undefined } }));

  return (
    <div>
      <h1 className="text-3xl font-extrabold mb-2">إعدادات البوت</h1>
      <p className="text-slate-400 mb-8">شخصية البوت, طريقة كلامه, ومتى يبعتلك إشعار</p>
      <BotForm initial={JSON.parse(JSON.stringify(bot))} userPhone={user.phone || ""} />
    </div>
  );
}
