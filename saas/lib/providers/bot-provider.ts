// Tiny helper that converts a `Bot` row into a `ProviderOverride` accepted
// by `lib/llm.chat()`. Pure function — no DB access. Decrypts the API key
// using `crypto-util` and returns null when the bot is on the default
// `keyone` provider (so callers can pass it straight through without
// branching).

import { decryptSecret } from "@/lib/crypto-util";
import type { ProviderOverride } from "@/lib/llm";
import { isProviderId } from "@/lib/providers/types";

// Permissive structural type. Accepts any object (e.g. a Prisma `Bot` row,
// which gains the new aiProvider/aiApiKeyEnc/aiModel fields after the next
// `prisma generate`). The function reads only fields it knows about and
// safely returns null when they are missing.
type BotLike = Record<string, any>;

/**
 * Returns a `ProviderOverride` for use with `chat()`, or null if the bot is
 * on KEYONE default (no override needed).
 *
 * Decryption errors are swallowed and return null — the caller will then
 * fall back to KEYONE default, which is the safe behavior. We log to stderr
 * so the merchant sees something in NSSM logs if their AUTH_SECRET rotated.
 */
export function botProviderOverride(bot: BotLike | null | undefined): ProviderOverride | null {
  if (!bot) return null;
  const provider = bot.aiProvider || "keyone";
  if (!isProviderId(provider) || provider === "keyone") return null;
  const enc = bot.aiApiKeyEnc;
  if (!enc) return null;
  let apiKey = "";
  try {
    apiKey = decryptSecret(enc);
  } catch (e) {
    console.error("[providers] failed to decrypt aiApiKeyEnc:", (e as Error).message);
    return null;
  }
  if (!apiKey) return null;
  return { provider, apiKey, model: bot.aiModel || null };
}
