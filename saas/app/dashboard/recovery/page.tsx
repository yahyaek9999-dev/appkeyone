import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import RecoveryUi from "./recovery-ui";

export const dynamic = "force-dynamic";

export default async function RecoveryPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  return <RecoveryUi />;
}
