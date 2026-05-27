import { requireUser } from "@/lib/auth";
import WhatsappUI from "./whatsapp-ui";

export default async function WhatsappPage() {
  const user = await requireUser();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">ربط واتساب</h1>
        <p className="page-desc">امسح QR code من هاتفك لربط رقم واتساب البوت</p>
      </div>
      <WhatsappUI initial={JSON.parse(JSON.stringify(user.bot))} />
    </div>
  );
}
