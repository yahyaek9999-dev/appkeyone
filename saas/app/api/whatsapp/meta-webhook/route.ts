/**
 * Meta Cloud API webhook endpoint — Phase 1 scaffold.
 *
 * - GET   verifies the webhook subscription handshake.
 * - POST  receives delivery + message events from Meta, validates the
 *         X-Hub-Signature-256 header, persists the raw payload to
 *         WaWebhookEvent (idempotent), and acknowledges with 200.
 *
 * Business processing (turning inbound messages into Conversation/Message
 * rows, syncing delivery statuses to WaMessage, etc.) is intentionally
 * NOT done in Phase 1. We only record the events. Phase 2 wires the
 * processor.
 *
 * Security:
 *   - Signature verification is REQUIRED for POST. Anything failing the
 *     check is recorded with signatureOk=false but never executes business
 *     logic. We still acknowledge with 200 so Meta doesn't keep retrying.
 *   - The verify token used in GET is a merchant-chosen string stored on
 *     Bot.metaWebhookVerifyToken. We do NOT use a single global secret so
 *     a leaked token can be rotated per-merchant.
 *
 * Production note: Meta retries failed webhooks for up to 7 days. The
 * unique constraint on `(source, eventId)` makes replays cheap no-ops.
 */

import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto-util";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET — Meta webhook verification handshake.
// Meta calls: GET ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
// We match the verify_token against any Bot.metaWebhookVerifyToken in the DB.
// On match we echo the challenge. On miss we return 403.
// ---------------------------------------------------------------------------
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return new NextResponse("bad_request", { status: 400 });
  }

  // Look up any bot whose webhook verify token matches. We compare server-side
  // to avoid leaking the token list. A single-row query is enough; the column
  // is indexed implicitly via the cuid PK so this stays cheap.
  const match = await prisma.bot.findFirst({
    where: { metaWebhookVerifyToken: token } as any,
    select: { id: true },
  });

  if (!match) {
    return new NextResponse("verify_token_mismatch", { status: 403 });
  }

  return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

// ---------------------------------------------------------------------------
// POST — webhook delivery.
// 1. Read raw body (we MUST hash the unparsed bytes).
// 2. Resolve the destination bot via the payload's `metadata.phone_number_id`.
// 3. Verify X-Hub-Signature-256 against the merchant's app secret.
// 4. Upsert WaWebhookEvent. Duplicates short-circuit to 200.
// 5. Return 200 always (Meta-recommended) so retries stop, even on errors.
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-hub-signature-256") || "";

  let body: any = {};
  try { body = JSON.parse(raw); } catch { /* keep body={} */ }

  // Meta payload shape (abbreviated):
  // { object: "whatsapp_business_account",
  //   entry: [ { id: "<WABA_ID>",
  //              changes: [ { value: { metadata: { phone_number_id, display_phone_number },
  //                                    messages: [...], statuses: [...] },
  //                           field: "messages" } ] } ] }
  const entry = Array.isArray(body?.entry) ? body.entry[0] : null;
  const change = Array.isArray(entry?.changes) ? entry.changes[0] : null;
  const phoneNumberId: string | undefined = change?.value?.metadata?.phone_number_id;
  const wabaId: string | undefined = entry?.id;
  const eventType: string = change?.field || "unknown";

  // Resolve owner bot — prefer phone_number_id, fall back to waba id.
  let bot: any = null;
  if (phoneNumberId) {
    bot = await prisma.bot.findFirst({
      where: { metaPhoneNumberId: phoneNumberId } as any,
      select: { id: true, userId: true, metaAppSecretEnc: true } as any,
    });
  }
  if (!bot && wabaId) {
    bot = await prisma.bot.findFirst({
      where: { metaBusinessAccountId: wabaId } as any,
      select: { id: true, userId: true, metaAppSecretEnc: true } as any,
    });
  }

  // Signature verification. We tolerate "no signature" only when there is no
  // matching bot (Meta probe traffic). Once a bot is matched, the signature
  // MUST validate or we record signatureOk=false and skip processing.
  let signatureOk = false;
  if (bot && bot.metaAppSecretEnc && signature.startsWith("sha256=")) {
    try {
      const secret = decryptSecret(bot.metaAppSecretEnc);
      const expected = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
      // Constant-time compare to avoid timing attacks.
      const a = Buffer.from(signature);
      const b = Buffer.from(expected);
      signatureOk = a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      signatureOk = false;
    }
  }

  // Idempotency key: prefer the message/status id Meta provides. Fall back
  // to a hash of the raw body so we still dedupe replays that lack ids.
  const innerId =
    change?.value?.messages?.[0]?.id ||
    change?.value?.statuses?.[0]?.id ||
    null;
  const eventId =
    innerId ||
    crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);

  try {
    await (prisma as any).waWebhookEvent.upsert({
      where: { source_eventId: { source: "meta_cloud", eventId } },
      update: { attempts: { increment: 1 } },
      create: {
        userId: bot?.userId ?? null,
        source: "meta_cloud",
        eventId,
        eventType,
        rawBody: raw.slice(0, 64_000),
        signatureOk,
        processed: false,
        attempts: 1,
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[meta-webhook] persist failed:", (e as Error).message);
  }

  // Always 200 — Phase 2 will pick up unprocessed rows and run the handler.
  return NextResponse.json({ ok: true });
}
