// Testing Arena 2.1 — multi-turn conversation simulator (server page).
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import SimulateUi from "./simulate-ui";

export const dynamic = "force-dynamic";

export default async function ArenaSimulatePage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  return <SimulateUi />;
}
