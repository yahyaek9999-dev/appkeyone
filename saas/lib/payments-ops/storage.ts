/**
 * lib/payments-ops/storage.ts — receipt-image storage for payment proofs.
 *
 * Images are stored OUTSIDE the public web root (saas/uploads/proofs) and are
 * only ever served through the gated route /api/payments/proof/[id]/image,
 * which checks the requester owns the proof or is staff. This keeps customers'
 * bank/wallet receipts private. SQLite/Windows-VPS friendly: plain local disk,
 * no external blob dependency.
 */
import { mkdir, writeFile, readFile, stat } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const ROOT = path.join(process.cwd(), "uploads", "proofs");

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
};

export const MAX_PROOF_BYTES = 8 * 1024 * 1024; // 8 MB

export function isAllowedImage(mime: string): boolean {
  return Object.prototype.hasOwnProperty.call(EXT_BY_MIME, (mime || "").toLowerCase());
}

/** Persist an uploaded receipt image. Returns the relative path stored on the proof. */
export async function saveProofImage(mime: string, bytes: Buffer): Promise<string> {
  const ext = EXT_BY_MIME[(mime || "").toLowerCase()] || "bin";
  await mkdir(ROOT, { recursive: true });
  const file = `${randomUUID()}.${ext}`;
  await writeFile(path.join(ROOT, file), bytes);
  return `proofs/${file}`; // relative to uploads/
}

/** Read a stored receipt image back for the gated serve route. */
export async function readProofImage(relPath: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  // relPath is "proofs/<id>.<ext>"; reject anything that escapes the root.
  const safe = relPath.replace(/\\/g, "/");
  if (!/^proofs\/[A-Za-z0-9._-]+$/.test(safe)) return null;
  const abs = path.join(process.cwd(), "uploads", safe);
  try {
    await stat(abs);
  } catch {
    return null;
  }
  const ext = (safe.split(".").pop() || "").toLowerCase();
  const contentType =
    ext === "png" ? "image/png" :
    ext === "webp" ? "image/webp" :
    ext === "gif" ? "image/gif" :
    ext === "heic" || ext === "heif" ? "image/heic" :
    "image/jpeg";
  const bytes = await readFile(abs);
  return { bytes, contentType };
}
