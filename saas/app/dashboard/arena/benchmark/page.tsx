// Testing Arena 2.1 — Brain Benchmark (TA-7) + AI Readiness (TA-9).
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import BenchmarkUi from "./benchmark-ui";

export const dynamic = "force-dynamic";

export default async function BenchmarkPage() {
  // Internal QA surface (Arena child route): ADMIN_WORKSPACE-only, no
  // paywall. A session alone must not reach it via direct URL.
  try {
    await requireAdmin();
  } catch {
    redirect("/dashboard");
  }
  return <BenchmarkUi />;
}
