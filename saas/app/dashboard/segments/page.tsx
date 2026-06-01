import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import SegmentsUi from "./segments-ui";

export const dynamic = "force-dynamic";

export default async function SegmentsPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  return <SegmentsUi />;
}
