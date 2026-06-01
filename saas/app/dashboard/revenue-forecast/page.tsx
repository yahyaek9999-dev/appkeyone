import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import ForecastUi from "./forecast-ui";

export const dynamic = "force-dynamic";

export default async function RevenueForecastPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  return <ForecastUi />;
}
