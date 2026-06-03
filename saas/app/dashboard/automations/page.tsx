import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import AutomationBuilderUi from "./automation-builder-ui";
import RuleBuilderUi from "./rule-builder-ui";

export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  const user = await requireUser();
  if (!user) redirect("/login");
  return (
    <div className="space-y-10">
      {/* Section 1: Commerce automations (existing — order-event → WA/email) */}
      <AutomationBuilderUi />
      {/* Section 2: Intelligent rule builder (Agent 3 — if-this-then-that) */}
      <div className="border-t border-white/[0.06] pt-8">
        <RuleBuilderUi />
      </div>
    </div>
  );
}
