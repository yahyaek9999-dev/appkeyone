/**
 * lib/media/inbound-message.ts — storage for customer-sent WhatsApp media
 * (voice notes, images, video, documents) captured on inbound webhook ingest.
 *
 * Mirrors the payment-proof / product-image pattern: files live OUTSIDE the
 * public web root (saas/uploads/inbox) and are served only through the gated
 * route /api/whatsapp/media/[file], which checks the requester owns the
 * conversation. Customer media is private by default. SQLite/Windows-VPS
 * friendly: plain local disk, no external blob dependency.
 */
import { mkdir, writeFile, readFile, stat } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const ROOT = path.join(process.cwd(), "uploads", "inbox");

// WhatsApp's own ceiling is 16 MB (documents/video); base64 overhead is ~33%,
// so this bounds the decoded byte size, not the wire payload.
export const MAX_INBOUND_MEDIA_BYTES = 20 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/amr": "amr",
  "audio/wav": "wav",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/zip": "zip",
};

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  ogg: "audio/ogg",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  amr: "audio/amr",
  wav: "audio/wav",
  mp4: "video/mp4",
  "3gp": "video/3gpp",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  csv: "text/csv",
  zip: "application/zip",
};

function extFor(mime: string): string {
  const normalized = (mime || "").split(";")[0].trim().toLowerCase();
  return EXT_BY_MIME[normalized] || "bin";
}

/** Persist inbound customer media. Returns the gated serve path stored on the Message. */
export async function saveInboundMedia(mime: string, bytes: Buffer): Promise<string> {
  const ext = extFor(mime);
  await mkdir(ROOT, { recursive: true });
  const file = `${randomUUID()}.${ext}`;
  await writeFile(path.join(ROOT, file), bytes);
  return `/api/whatsapp/media/${file}`;
}

/** Read stored inbound media back for the gated serve route. */
export async function readInboundMedia(
  file: string,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  // file is the bare "<uuid>.<ext>"; reject anything that escapes the root.
  if (!/^[A-Za-z0-9._-]+$/.test(file)) return null;
  const abs = path.join(ROOT, file);
  try {
    await stat(abs);
  } catch {
    return null;
  }
  const ext = (file.split(".").pop() || "").toLowerCase();
  const contentType = CONTENT_TYPE_BY_EXT[ext] || "application/octet-stream";
  const bytes = await readFile(abs);
  return { bytes, contentType };
}
