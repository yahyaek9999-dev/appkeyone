// Testing Arena 2.1 — TA-3 Auto Optimization Engine (server page).
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import OptimizeUi from "./optimize-ui";

export const dynamic = "force-dynamic";

export default async function OptimizePage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  return <OptimizeUi />;
}
