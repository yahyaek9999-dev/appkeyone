import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import QuickRepliesUi from "./quick-replies-ui";

export const dynamic = "force-dynamic";

export default async function QuickRepliesPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  return <QuickRepliesUi />;
}
