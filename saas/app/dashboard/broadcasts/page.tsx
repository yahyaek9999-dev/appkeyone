import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import BroadcastsUi from "./broadcasts-ui";

export const dynamic = "force-dynamic";

export default async function BroadcastsPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  return <BroadcastsUi />;
}
