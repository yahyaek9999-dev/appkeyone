// Small helpers for validating user-supplied URLs that get rendered into the
// dashboard as <img src> / <a href>. Blocks javascript:, data:, and
// protocol-relative ("//evil.com") values — only http(s) is accepted.

/**
 * Returns the trimmed URL when it is a well-formed http(s) URL, else null.
 * Mirrors the guard already used by the broadcasts API for imageUrl.
 */
export function httpUrlOrNull(v: unknown, maxLen = 600): string | null {
  if (!v) return null;
  const s = String(v).trim().slice(0, maxLen);
  return /^https?:\/\/\S+$/i.test(s) ? s : null;
}
