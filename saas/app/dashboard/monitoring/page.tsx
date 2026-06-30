// Smart Monitoring Pro — Monitoring Center (server page).
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import MonitoringUi from "./monitoring-ui";

export const dynamic = "force-dynamic";

export default async function MonitoringPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  return <MonitoringUi />;
}
