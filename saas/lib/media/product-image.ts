/**
 * lib/media/product-image.ts — device-uploaded product catalog images.
 *
 * Mirrors the payment-proof storage pattern: images live OUTSIDE the public web
 * root (saas/uploads/products) and are served only through the gated route
 * /api/products/image/[file] (authenticated). This is what lets the product form
 * accept device uploads + drag&drop and stop accepting pasted URLs.
 * SQLite/Windows-VPS friendly: plain local disk, no external blob dependency.
 */
import { mkdir, writeFile, readFile, stat } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const ROOT = path.join(process.cwd(), "uploads", "products");

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
};

export const MAX_PRODUCT_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB

/** True if a stored value is an internal uploaded-image path (not a pasted URL). */
export function isInternalProductImage(value: string | null | undefined): boolean {
  return !!value && /^\/api\/products\/image\/[A-Za-z0-9._-]+$/.test(value);
}

/** Persist an uploaded product image. Returns the gated serve path stored on the product. */
export async function saveProductImage(mime: string, bytes: Buffer, userId: string): Promise<string> {
  const ext = EXT_BY_MIME[(mime || "").toLowerCase()] || "bin";
  await mkdir(ROOT, { recursive: true });
  const file = `${randomUUID()}.${ext}`;
  await writeFile(path.join(ROOT, file), bytes);
  await (prisma as any).productImage.create({ data: { file, userId } }).catch(() => {});
  return `/api/products/image/${file}`;
}

/**
 * Read a stored product image back for the gated serve route, scoped to the
 * requesting tenant. `requesterId === null` skips the ownership check
 * (internal/admin callers that intentionally read across tenants).
 * Images with no ownership row (uploaded before ProductImage existed) are
 * grandfathered in and served regardless of requester — matches the
 * pre-fix behavior exactly, so no existing product photo breaks.
 */
export async function readProductImage(
  file: string,
  requesterId: string | null = null,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  // file is the bare "<uuid>.<ext>"; reject anything that escapes the root.
  if (!/^[A-Za-z0-9._-]+$/.test(file)) return null;
  if (requesterId) {
    const owner = await (prisma as any).productImage.findUnique({ where: { file }, select: { userId: true } }).catch(() => null);
    if (owner && owner.userId !== requesterId) return null;
  }
  const abs = path.join(ROOT, file);
  try {
    await stat(abs);
  } catch {
    return null;
  }
  const ext = (file.split(".").pop() || "").toLowerCase();
  const contentType =
    ext === "png" ? "image/png" :
    ext === "webp" ? "image/webp" :
    ext === "gif" ? "image/gif" :
    ext === "heic" || ext === "heif" ? "image/heic" :
    "image/jpeg";
  const bytes = await readFile(abs);
  return { bytes, contentType };
}
