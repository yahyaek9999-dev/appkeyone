// Customer-phone display helpers.
//
// WhatsApp now uses two address formats per chat:
//   - "@c.us"  — the JID digits ARE the real phone number (E.164 minus "+")
//   - "@lid"   — a privacy-only "Linked ID"; NOT a phone, may be 15-17 digits
//
// Older builds stored every JID as "+<digits>", which produced fake-looking
// numbers like "+162693377974496" for @lid contacts. Newer ingest writes
// "lid:<id>" instead so display code can route accordingly. This module
// gives one canonical function the whole UI can call.

export interface PhoneDisplay {
  /** the raw stored value, unchanged (e.g. `+201097767079` or `lid:1626…`) */
  raw: string;
  /** what the merchant should SEE — the phone, or "معرّف واتساب" for a LID */
  display: string;
  /** true when this is a privacy LID, not a real phone */
  isLid: boolean;
}

/**
 * Format a stored Customer.phone value for display.
 *
 * Examples:
 *   "+201097767079"             -> { display: "+20 109 776 7079", isLid: false }
 *   "lid:162693377974496"       -> { display: "معرّف واتساب", isLid: true }
 *   "+162693377974496"  (legacy bad data) -> heuristic: treat as LID if 16+ digits
 */
export function formatCustomerPhone(stored: string | null | undefined): PhoneDisplay {
  const raw = (stored || "").trim();
  if (!raw) return { raw: "", display: "—", isLid: false };

  // New format: explicit LID
  if (raw.startsWith("lid:")) {
    return { raw, display: "معرّف واتساب", isLid: true };
  }

  // Legacy bad data: a "+<digits>" string where the digits look like a LID
  // rather than a real phone. We err on the side of preserving the raw value
  // but flag it so the UI tones it down. ITU-T E.164 caps real numbers at
  // 15 digits; anything longer is definitely not a phone.
  const digits = raw.replace(/\D/g, "");
  if (digits.length > 15) {
    return { raw, display: "معرّف واتساب", isLid: true };
  }

  // Best-effort spacing for readability. We do NOT use Intl/libphonenumber
  // because the bundle cost isn't justified for a single label; if the user
  // later wants per-country formatting we can swap this out.
  return { raw, display: prettifyPhone(raw), isLid: false };
}

// ---------------------------------------------------------------------------
// Extractors used by the WhatsApp ingest path to harvest the customer's
// real phone (and name) from a free-text reply. The bot asks "ما اسمك ورقمك؟"
// when the contact arrived as a LID; this lets us upgrade the row from
// `lid:...` to a dialable phone so broadcasts can reach them later.
// ---------------------------------------------------------------------------

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/** Convert Arabic-Indic / Persian digits to Latin digits, in place. */
function toLatinDigits(s: string): string {
  let out = "";
  for (const ch of s) {
    const a = ARABIC_INDIC.indexOf(ch);
    if (a >= 0) { out += a; continue; }
    const p = PERSIAN_DIGITS.indexOf(ch);
    if (p >= 0) { out += p; continue; }
    out += ch;
  }
  return out;
}

/**
 * Try to extract a real, dialable phone number from a free-text message.
 * Returns E.164 with a leading "+" when successful, otherwise null.
 *
 * Heuristics (in order):
 *   1. Explicit "+<digits>" anywhere in the text — accept if 8..13 digits.
 *   2. Egyptian local "01[0-9]{9}" — prepend "+20" and drop the leading 0.
 *   3. A bare run of 10-13 digits with leading non-zero — accept as-is
 *      with a "+" prefix.
 * Discards anything > 13 digits (likely a LID) or < 8 (likely an order #).
 */
export function extractPhone(text: string | null | undefined): string | null {
  if (!text) return null;
  const norm = toLatinDigits(String(text));

  // 1) explicit +<digits>
  const plusMatch = norm.match(/\+\s?(\d[\d\s\-().]{7,})/);
  if (plusMatch) {
    const digits = plusMatch[1].replace(/\D/g, "");
    if (digits.length >= 8 && digits.length <= 13 && !digits.startsWith("0")) {
      return "+" + digits;
    }
  }

  // 2) Egyptian local: 01[0125]xxxxxxxx (11 digits starting with 01)
  const egMatch = norm.match(/(?<!\d)0(1[0125]\d{8})(?!\d)/);
  if (egMatch) {
    return "+20" + egMatch[1];
  }

  // 3) Any bare 10-13 digit run with non-zero leading digit
  // Allow spaces/dashes inside — strip them when matching.
  const cleaned = norm.replace(/[\s\-().]/g, "");
  const bareMatch = cleaned.match(/(?<!\d)([1-9]\d{9,12})(?!\d)/);
  if (bareMatch) {
    return "+" + bareMatch[1];
  }

  return null;
}

/**
 * Try to extract a likely human name from a free-text Arabic/English reply.
 * We look for a few high-precision patterns ("اسمي X", "انا X", "my name is X")
 * and accept up to 4 short words. Returns null when we're not confident.
 *
 * Intentionally conservative: false positives pollute the merchant's CRM.
 */
export function extractName(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = String(text).trim();
  if (!t) return null;

  // Strip the phone we already extracted so it doesn't get captured as name
  const norm = toLatinDigits(t).replace(/\+?\d[\d\s\-().]{6,}/g, " ").trim();

  // Pattern 1: "اسمي X" / "أنا X" / "انا X"
  const arPat = /(?:اسمي|إسمي|أنا|انا)\s+([\u0600-\u06FF\w][\u0600-\u06FF\w\s]{1,40}?)(?:[.،,\n]|$)/;
  let m = norm.match(arPat);
  if (m && m[1]) {
    const candidate = m[1].trim().split(/\s+/).slice(0, 4).join(" ");
    if (candidate.length >= 2 && candidate.length <= 40) return candidate;
  }

  // Pattern 2: "my name is X" / "i'm X" / "i am X"
  const enPat = /(?:my\s+name\s+is|i\s*am|i'?m)\s+([\w][\w\s]{1,40}?)(?:[.,\n]|$)/i;
  m = norm.match(enPat);
  if (m && m[1]) {
    const candidate = m[1].trim().split(/\s+/).slice(0, 4).join(" ");
    if (candidate.length >= 2 && candidate.length <= 40) return candidate;
  }

  return null;
}

/** Cheap visual grouping: "+201097767079" -> "+20 109 776 7079". */
function prettifyPhone(s: string): string {
  if (!s.startsWith("+")) return s;
  const d = s.slice(1);
  if (d.length < 8) return s;

  // Heuristic: 1-3 digit country code, then groups of 3-4 digits.
  // We try a 2-digit cc first (covers EG/SA/AE etc.), fall back to 3.
  const ccLen = d.length >= 11 ? 2 : 3;
  const cc = d.slice(0, ccLen);
  const rest = d.slice(ccLen);
  // Group rest by 3s from the LEFT; the last group can be 2-4.
  const groups: string[] = [];
  for (let i = 0; i < rest.length; i += 3) groups.push(rest.slice(i, i + 3));
  return `+${cc} ${groups.join(" ")}`;
}
