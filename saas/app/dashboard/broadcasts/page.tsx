import { requirePagePermission } from "@/lib/auth";
import BroadcastsUi from "./broadcasts-ui";

export const dynamic = "force-dynamic";

export default async function BroadcastsPage() {
  await requirePagePermission("broadcasts");
  return <BroadcastsUi />;
}
