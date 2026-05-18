// Helpers to import knowledge from URLs, PDF and DOCX. Pure code, no APIs.
//
//   crawlUrl(url)    → strip nav/script and return readable text
//   parsePdf(buffer) → text from PDF
//   parseDocx(buffer)→ text from DOCX
//
// We deliberately keep these forgiving — best-effort, never throw past the
// caller. Caller is responsible for storing the resulting Document row.

import * as cheerio from "cheerio";

const MAX_BYTES = 4 * 1024 * 1024;        // 4 MB cap on remote fetch
const MAX_TEXT_LEN = 60_000;              // cap final text length

export async function crawlUrl(url: string): Promise<{
  ok: boolean;
  title?: string;
  text?: string;
  error?: string;
}> {
  try {
    if (!/^https?:\/\//i.test(url)) {
      return { ok: false, error: "URL يجب أن يبدأ بـ http أو https" };
    }
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 KEYONE-Importer/1.0",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const ct = res.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml/i.test(ct)) {
      return { ok: false, error: "العنوان لا يعيد HTML (نوع المحتوى: " + ct + ")" };
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) {
      return { ok: false, error: "الصفحة أكبر من 4MB" };
    }
    const html = buf.toString("utf8");
    const { title, text } = extractReadable(html);
    if (!text || text.length < 30) {
      return { ok: false, error: "لم نتمكن من استخراج محتوى نصي ذي معنى" };
    }
    return { ok: true, title, text: text.slice(0, MAX_TEXT_LEN) };
  } catch (e: any) {
    return { ok: false, error: e?.message || "خطأ في تحميل الصفحة" };
  }
}

/**
 * Extract main readable content from raw HTML using a lightweight
 * Readability-style heuristic: strip script/style/nav/footer/aside,
 * pick the densest <article>/<main>/<section> by text length.
 */
function extractReadable(html: string): { title: string; text: string } {
  const $ = cheerio.load(html);
  const title = ($("title").first().text() || $("h1").first().text() || "").trim().slice(0, 200);

  $("script, style, noscript, iframe, svg, form, nav, header, footer, aside, .nav, .menu, .sidebar, [aria-hidden='true']")
    .remove();

  const candidates = $("article, main, [role='main'], section, .content, #content, .post, .entry").toArray();
  let best = "";
  for (const el of candidates) {
    const t = squeeze($(el).text());
    if (t.length > best.length) best = t;
  }
  if (!best || best.length < 200) {
    best = squeeze($("body").text());
  }

  return { title, text: best };
}

function squeeze(s: string): string {
  return (s || "")
    .replace(/\u00A0/g, " ")
    .replace(/[\t\r]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ ]{2,}/g, " ")
    .trim();
}

// ---------- PDF ----------------------------------------------------------
//
// pdf-parse is CommonJS only and ships a debug branch that touches the
// filesystem at module load time. We require it lazily and handle any
// unexpected throw.

export async function parsePdf(buf: Buffer): Promise<{
  ok: boolean;
  title?: string;
  text?: string;
  error?: string;
}> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require("pdf-parse");
    const data = await pdfParse(buf);
    const text = squeeze(String(data.text || ""));
    if (!text || text.length < 20) return { ok: false, error: "PDF فارغ أو نص غير قابل للاستخراج" };
    const title = (data.info?.Title || "").trim();
    return { ok: true, title, text: text.slice(0, MAX_TEXT_LEN) };
  } catch (e: any) {
    return { ok: false, error: e?.message || "فشل تحليل PDF" };
  }
}

// ---------- DOCX ---------------------------------------------------------

export async function parseDocx(buf: Buffer): Promise<{
  ok: boolean;
  text?: string;
  error?: string;
}> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ buffer: buf });
    const text = squeeze(String(result?.value || ""));
    if (!text || text.length < 20) return { ok: false, error: "DOCX فارغ" };
    return { ok: true, text: text.slice(0, MAX_TEXT_LEN) };
  } catch (e: any) {
    return { ok: false, error: e?.message || "فشل تحليل DOCX" };
  }
}
