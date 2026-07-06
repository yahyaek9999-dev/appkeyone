// Testing Arena 2.1 — TA-4 Conversation Quality Benchmark (server page).
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import QualityUi from "./quality-ui";

export const dynamic = "force-dynamic";

export default async function QualityPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  return <QualityUi />;
}
