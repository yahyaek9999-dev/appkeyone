import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import SystemHealthUi from "./system-health-ui";

export const dynamic = "force-dynamic";

export default async function SystemHealthPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  return <SystemHealthUi />;
}
