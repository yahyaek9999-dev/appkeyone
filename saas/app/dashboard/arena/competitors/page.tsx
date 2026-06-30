// Testing Arena 2.1 — TA-8 Competitor Benchmark Real (server page).
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import CompetitorBenchUi from "./competitors-ui";

export const dynamic = "force-dynamic";

export default async function CompetitorBenchmarkPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  return <CompetitorBenchUi />;
}
