import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * LLM Pre-warm cron.
 *
 * Hits every configured LLM instance with a tiny request to keep the
 * underlying Chromium / scraper context "hot" so the next real request
 * doesn't pay a cold-start (which on CloakBrowser can be 10-20s and may
 * even produce a navigation-destroyed error).
 *
 * Triggered by an internal scheduled task every 1-2 minutes.
 * Auth: `x-internal-secret` header must match SAAS_INTERNAL_SECRET.
 *
 * NOTE: This does NOT modify or wrap LLM responses. It only sends a
 *       "ping" request and discards the result. Quality is unaffected.
 */
export async function POST(req: Request) {
  const expected = process.env.SAAS_INTERNAL_SECRET;
  const got = req.headers.get("x-internal-secret");
  if (!expected || got !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const urls = getLlmUrls();
  const key = process.env.LLM_API_KEY || "change-secret-key-2026";
  const model = process.env.LLM_MODEL || "gpt-4o-mini";

  const body = JSON.stringify({
    model,
    messages: [{ role: "user", content: "ping" }],
    max_tokens: 4,
  });

  const results = await Promise.all(
    urls.map(async (url) => {
      const t0 = Date.now();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 45000);
      try {
        const res = await fetch(url + "/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + key,
          },
          body,
          cache: "no-store",
          signal: ctrl.signal,
        });
        const ms = Date.now() - t0;
        return { url, ok: res.ok, status: res.status, ms };
      } catch (e: any) {
        return { url, ok: false, status: 0, ms: Date.now() - t0, error: String(e?.message || e).slice(0, 200) };
      } finally {
        clearTimeout(timer);
      }
    })
  );

  return NextResponse.json({
    ok: true,
    pinged: results.length,
    healthy: results.filter((r) => r.ok).length,
    results,
  });
}

function getLlmUrls(): string[] {
  const multi = (process.env.LLM_API_URLS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (multi.length > 0) return multi;
  return [process.env.LLM_API_URL || "http://127.0.0.1:7788"];
}
