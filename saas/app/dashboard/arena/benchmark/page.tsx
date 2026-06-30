// Testing Arena 2.1 — Brain Benchmark (TA-7) + AI Readiness (TA-9).
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import BenchmarkUi from "./benchmark-ui";

export const dynamic = "force-dynamic";

export default async function BenchmarkPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  return <BenchmarkUi />;
}
