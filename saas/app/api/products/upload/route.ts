// POST /api/products/upload  (Area 5 — device image upload)
//
// Accepts a multipart image file from the merchant's device, validates type +
// size, writes it under public/uploads/products/ and returns its public URL.
// Replaces the old "paste an image URL" workflow. Scoped to the "settings"
// permission; never accepts remote URLs (no SSRF surface).

import { randomUUID } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { sniffBinaryType, EXT_BY_SNIFFED } from "@/lib/upload-validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_IMAGE = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(req: Request) {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limited = enforceRateLimit(req, {
    name: "product-image-upload",
    identifier: uid,
    ...RATE_LIMITS.api,
  });
  if (limited) return limited;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "bad_form" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no_file" }, { status: 400 });
  if (file.size > MAX_BYTES)
    return NextResponse.json({ error: "too_large", detail: "الحد 5 ميجابايت" }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "empty_file" }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  // Validate by magic bytes — never trust the client-supplied MIME type.
  const sniffed = sniffBinaryType(bytes);
  if (!sniffed || !ALLOWED_IMAGE.has(sniffed)) {
    return NextResponse.json(
      { error: "unsupported_type", detail: "JPG/PNG/WEBP/GIF فقط" },
      { status: 400 },
    );
  }
  const ext = EXT_BY_SNIFFED[sniffed];
  const dir = path.join(process.cwd(), "public", "uploads", "products");
  await mkdir(dir, { recursive: true });
  const fname = `${randomUUID()}.${ext}`;
  await writeFile(path.join(dir, fname), bytes);

  return NextResponse.json({ ok: true, url: `/uploads/products/${fname}` });
}
