// Testing Arena 2.1 — TA-6 Prompt Benchmark (server page).
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import PromptBenchUi from "./prompt-bench-ui";

export const dynamic = "force-dynamic";

export default async function PromptBenchmarkPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  return <PromptBenchUi />;
}
