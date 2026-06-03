import { requirePagePermission } from "@/lib/auth";
import IntegrationsUi from "./integrations-ui";

export default async function IntegrationsPage() {
  await requirePagePermission("settings");
  return <IntegrationsUi />;
}
