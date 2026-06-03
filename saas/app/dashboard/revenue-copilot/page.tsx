import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import RevenueCopilotUi from "./revenue-copilot-ui";

export const dynamic = "force-dynamic";

export default async function RevenueCopilotPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  return <RevenueCopilotUi />;
}
