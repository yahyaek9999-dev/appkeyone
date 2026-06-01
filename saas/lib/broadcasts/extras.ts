// Smart Campaigns — message extras.
//
// Appends an optional coupon line and an optional image LINK to a broadcast
// body. This runs AFTER any AI personalization in the send loop, so the LLM
// can never reword/drop the coupon code, and the image is delivered as a URL
// (WhatsApp auto-previews links) — no media upload, no change to the WhatsApp
// microservice or the protected send queue.
//
// No-op when both are null/empty → existing broadcasts behave exactly as before.

export function appendExtras(
  body: string,
  couponCode?: string | null,
  imageUrl?: string | null,
): string {
  let out = body || "";
  const coupon = (couponCode || "").trim();
  const img = (imageUrl || "").trim();

  if (coupon) {
    out += `\n\n🎟️ كود الخصم: ${coupon}`;
  }
  if (/^https?:\/\/\S+$/i.test(img)) {
    out += `\n${img}`;
  }
  return out;
}
