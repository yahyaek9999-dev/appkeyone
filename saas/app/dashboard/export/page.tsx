import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ExportUi } from "./export-ui";

export const dynamic = "force-dynamic";

export default async function ExportPage() {
  const { user } = await requirePagePermission("customers");
  const [customerCount, orderCount, broadcastCount, messageCount] = await Promise.all([
    prisma.customer.count({ where: { userId: user.id } }),
    prisma.order.count({ where: { userId: user.id } }),
    prisma.broadcast.count({ where: { userId: user.id } }),
    prisma.message.count({ where: { conversation: { customer: { userId: user.id } } } }),
  ]);
  return (
    <ExportUi
      counts={{ customers: customerCount, orders: orderCount, broadcasts: broadcastCount, conversations: messageCount }}
    />
  );
}
