import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import InboxUi from "./inbox-ui";

export const dynamic = "force-dynamic";

export default async function InboxPage(props: { searchParams: Promise<{ c?: string }> }) {
  const searchParams = await props.searchParams;
  const uid = await getUserId();
  if (!uid) redirect("/login");

  return <InboxUi initialCustomerId={searchParams.c || null} />;
}
