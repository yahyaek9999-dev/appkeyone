import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import IntelUi from "./intel-ui";

export const dynamic = "force-dynamic";

export default async function IntelPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  return <IntelUi />;
}
