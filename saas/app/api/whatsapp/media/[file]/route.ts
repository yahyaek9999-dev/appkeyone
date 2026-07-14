/**
 * GET /api/whatsapp/media/[file] — serve customer-sent WhatsApp media
 * (voice/image/video/document) captured on inbound ingest. Private: only the
 * conversation's tenant (or a staff member with inbox access) may view it.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";
import { readInboundMedia } from "@/lib/media/inbound-message";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { file: string } }) {
  const uid = await getUserIdForPermission("inbox");
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const mediaUrl = `/api/whatsapp/media/${params.file}`;
  const message = await prisma.message.findFirst({
    where: { mediaUrl },
    select: { conversation: { select: { customer: { select: { userId: true } } } } },
  });
  const ownerId = message?.conversation?.customer?.userId;
  if (!ownerId || ownerId !== uid) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const media = await readInboundMedia(params.file);
  if (!media) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return new NextResponse(new Uint8Array(media.bytes), {
    status: 200,
    headers: { "Content-Type": media.contentType, "Cache-Control": "private, no-store" },
  });
}
