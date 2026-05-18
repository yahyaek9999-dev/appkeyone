import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import InboxUi from "./inbox-ui";

export const dynamic = "force-dynamic";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: { c?: string };
}) {
  const uid = await getUserId();
  if (!uid) redirect("/login");

  return <InboxUi initialCustomerId={searchParams.c || null} />;
}
