// AI Knowledge Brain — merchant dashboard page (server).
//
// Unauthenticated -> /login (standard). Authenticated but the paid add-on is
// OFF -> we render an upsell/locked state INSTEAD of redirecting, so the
// merchant discovers the feature and knows how to enable it. When enabled, the
// client UI takes over (fetches /api/knowledge/brain + search).

import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { knowledgeBrainEnabled } from "@/lib/knowledge-brain/flags";
import KnowledgeBrainUi from "./knowledge-brain-ui";

export const dynamic = "force-dynamic";

export default async function KnowledgeBrainPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");

  const enabled = await knowledgeBrainEnabled(uid);
  return <KnowledgeBrainUi enabled={enabled} />;
}
