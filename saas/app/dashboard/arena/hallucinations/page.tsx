// Testing Arena 2.1 — TA-5 Hallucination Detection Engine (server page).
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import HallucinationsUi from "./hallucinations-ui";

export const dynamic = "force-dynamic";

export default async function HallucinationsPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  return <HallucinationsUi />;
}
