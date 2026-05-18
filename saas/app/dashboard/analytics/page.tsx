import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import AnalyticsUi from "./analytics-ui";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  return <AnalyticsUi />;
}
