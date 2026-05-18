import { requireUser } from "@/lib/auth";
import WhatsappUI from "./whatsapp-ui";

export default async function WhatsappPage() {
  const user = await requireUser();
  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-extrabold mb-2">ربط واتساب</h1>
      <p className="text-slate-400 mb-8">امسح QR code من هاتفك لربط رقم واتساب البوت</p>
      <WhatsappUI initial={JSON.parse(JSON.stringify(user.bot))} />
    </div>
  );
}
