// Testing Arena 2.1 — TA-2 Auto Fix Engine (server page).
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import FixesUi from "./fixes-ui";

export const dynamic = "force-dynamic";

export default async function ArenaFixesPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  return <FixesUi />;
}
