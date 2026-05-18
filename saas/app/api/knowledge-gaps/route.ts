import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const items = await prisma.knowledgeGap.findMany({
    where: { userId: uid, resolved: false },
    orderBy: [{ occurrences: "desc" }, { updatedAt: "desc" }],
    take: 50,
  });
  return NextResponse.json({ items });
}
