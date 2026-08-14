import { redirect } from "next/navigation";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import BotBuilderUi from "./bot-builder-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "منشئ المحادثات" };

export default async function BotBuilderPage() {
  const g = await pageGate("flow_builder");
  if (!g.uid) redirect("/login");
  if (!g.allowed) {
    return (
      <div className="p-6">
        <LockedFeature
          locale="ar"
          recommendedTier={g.recommendedTier}
          title="منشئ المحادثات"
          description="صمّم محادثات آلية بالكامل — رسائل، أزرار، شروط، تحويل للفريق. متاح في باقة Growth فأعلى."
        />
      </div>
    );
  }
  return <BotBuilderUi />;
}
