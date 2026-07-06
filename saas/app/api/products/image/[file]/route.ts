/** GET /api/products/image/[file] — serve a device-uploaded product image (authenticated). */
import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { readProductImage } from "@/lib/media/product-image";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { file: string } }) {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const img = await readProductImage(params.file);
  if (!img) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return new NextResponse(new Uint8Array(img.bytes), {
    status: 200,
    headers: {
      "Content-Type": img.contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
