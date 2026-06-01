import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import FunnelUi from "./funnel-ui";

export const dynamic = "force-dynamic";

export default async function FunnelPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  return <FunnelUi />;
}
