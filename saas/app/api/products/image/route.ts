/** POST /api/products/image — upload a product image from the device (multipart). */
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { saveProductImage, isAllowedProductImage, MAX_PRODUCT_IMAGE_BYTES } from "@/lib/media/product-image";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const ctype = req.headers.get("content-type") || "";
  if (!ctype.includes("multipart/form-data")) {
    return NextResponse.json({ error: "multipart_required", message: "ارفع صورة من جهازك." }, { status: 400 });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("image");
  if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
    return NextResponse.json({ error: "image_required", message: "اختر صورة من جهازك." }, { status: 400 });
  }
  const f = file as File;
  if (!isAllowedProductImage(f.type)) {
    return NextResponse.json({ error: "bad_image_type", message: "الملف يجب أن يكون صورة (JPG/PNG/WebP)." }, { status: 400 });
  }
  if (f.size > MAX_PRODUCT_IMAGE_BYTES) {
    return NextResponse.json({ error: "image_too_large", message: "حجم الصورة يجب أن يكون أقل من 8 ميجابايت." }, { status: 400 });
  }
  const bytes = Buffer.from(await f.arrayBuffer());
  const path = await saveProductImage(f.type, bytes);
  return NextResponse.json({ ok: true, path });
}
