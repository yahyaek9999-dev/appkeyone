// Revenue Assistant Pro — revenue intelligence (server page).
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import RevenueProUi from "./revenue-pro-ui";

export const dynamic = "force-dynamic";

export default async function RevenueProPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  return <RevenueProUi />;
}
