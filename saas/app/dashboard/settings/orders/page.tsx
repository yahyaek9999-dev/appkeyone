import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { OrderSettingsForm } from "./order-settings-form";

export const dynamic = "force-dynamic";

export default async function OrderSettingsPage() {
  const { user } = await requirePagePermission("settings");
  const bot = await prisma.bot.findUnique({ where: { userId: user.id } });
  if (!bot) redirect("/dashboard");

  const initial = {
    orderExtractionEnabled: (bot as any).orderExtractionEnabled !== false,
    orderConfidenceThreshold: (bot as any).orderConfidenceThreshold ?? 50,
    orderRequireProduct: !!(bot as any).orderRequireProduct,
    orderRequireConfirmation: !!(bot as any).orderRequireConfirmation,
    businessMode: (bot as any).businessMode || "store",
  };

  return (
    <div>
      <h1 className="page-title mb-1">إعدادات الطلبات</h1>
      <p className="page-desc mb-8">
        تحكّم في كيفية استخراج الطلبات من المحادثات تلقائياً.
      </p>
      <div className="card p-6 max-w-2xl">
        <OrderSettingsForm initial={initial} />
      </div>
    </div>
  );
}
