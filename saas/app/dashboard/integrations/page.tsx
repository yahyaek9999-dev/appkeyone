import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import IntegrationsUi from "./integrations-ui";

export default async function IntegrationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <IntegrationsUi />;
}
