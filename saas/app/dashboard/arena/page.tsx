// Testing Arena 2.0 — scenario QA + competitor benchmark (server page).
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import ArenaUi from "./arena-ui";

export const dynamic = "force-dynamic";

export default async function ArenaProPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  return <ArenaUi />;
}
