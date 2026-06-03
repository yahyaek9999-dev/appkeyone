import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import AutomationBuilderUi from "./automation-builder-ui";

export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  const user = await requireUser();
  if (!user) redirect("/login");
  return <AutomationBuilderUi />;
}
