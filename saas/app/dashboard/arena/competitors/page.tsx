// Testing Arena 2.1 — TA-8 Competitor Benchmark Real (server page).
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import CompetitorBenchUi from "./competitors-ui";

export const dynamic = "force-dynamic";

export default async function CompetitorBenchmarkPage() {
  // Internal QA surface (Arena child route): ADMIN_WORKSPACE-only, no
  // paywall. A session alone must not reach it via direct URL.
  try {
    await requireAdmin();
  } catch {
    redirect("/dashboard");
  }
  return <CompetitorBenchUi />;
}
