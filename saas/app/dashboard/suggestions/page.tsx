import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import SuggestionsUi from "./suggestions-ui";

export const dynamic = "force-dynamic";

export default async function SuggestionsPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  return <SuggestionsUi />;
}
