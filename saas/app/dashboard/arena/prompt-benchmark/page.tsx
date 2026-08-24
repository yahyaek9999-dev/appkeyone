// Testing Arena 2.1 — TA-6 Prompt Benchmark (server page).
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import PromptBenchUi from "./prompt-bench-ui";

export const dynamic = "force-dynamic";

export default async function PromptBenchmarkPage() {
  // Internal QA surface (Arena child route): ADMIN_WORKSPACE-only, no
  // paywall. A session alone must not reach it via direct URL.
  try {
    await requireAdmin();
  } catch {
    redirect("/dashboard");
  }
  return <PromptBenchUi />;
}
