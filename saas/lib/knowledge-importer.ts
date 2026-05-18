// Knowledge importer — takes pasted free-text (Instagram bios, FAQs, product
// lists, chat exports) and turns it into structured Documents + QuickReplies
// without any LLM call.
//
// Strategy:
//   - Split text into logical chunks (paragraphs, bullets, Q/A blocks).
//   - Each chunk becomes a Document with a heuristic title.
//   - Detect "Q: ... A: ..." or "س: ... ج: ..." patterns → QuickReply rules.
//   - Detect product-style lines ("الاسم — السعر") → product Knowledge entry.
//
// All O(n). No deps. Safe on any input.

import { normalizeAr } from "./semantic-match";

export interface ImportedKnowledge {
  documents: { title: string; content: string }[];
  quickReplies: { triggers: string[]; reply: string }[];
  productLines: { name: string; price?: number }[];
}

const Q_PREFIX_RE = /^\s*(?:q|س|سؤال|question)\s*[:\-]/i;
const A_PREFIX_RE = /^\s*(?:a|ج|جواب|answer)\s*[:\-]/i;
const BULLET_RE   = /^\s*[-•*–]\s+/;
const PRICE_LINE_RE = /^(.{3,80})\s*[—\-:|]+\s*(\d{2,6})\s*(?:جنيه|ج\b|egp|le)?/i;
const SECTION_TITLE_RE = /^[\s#]*([\u0600-\u06FFA-Za-z][\u0600-\u06FFA-Za-z0-9\s]{2,60})\s*[:؟?]\s*$/m;

export function importKnowledge(raw: string): ImportedKnowledge {
  const text = String(raw || "").replace(/\r\n/g, "\n").trim();
  if (!text) return { documents: [], quickReplies: [], productLines: [] };

  const lines = text.split(/\n/);
  const documents: { title: string; content: string }[] = [];
  const quickReplies: { triggers: string[]; reply: string }[] = [];
  const productLines: { name: string; price?: number }[] = [];

  // ---- pass 1: Q/A pairs -------------------------------------------------
  let pendingQ: string | null = null;
  let pendingA: string[] = [];

  const flushQA = () => {
    if (pendingQ && pendingA.length) {
      const answer = pendingA.join(" ").trim();
      if (answer.length > 0) {
        quickReplies.push({
          triggers: extractTriggers(pendingQ),
          reply: answer.slice(0, 500),
        });
      }
    }
    pendingQ = null;
    pendingA = [];
  };

  for (const ln of lines) {
    if (Q_PREFIX_RE.test(ln)) {
      flushQA();
      pendingQ = ln.replace(Q_PREFIX_RE, "").trim();
    } else if (A_PREFIX_RE.test(ln) && pendingQ) {
      pendingA.push(ln.replace(A_PREFIX_RE, "").trim());
    } else if (pendingQ && pendingA.length && ln.trim()) {
      // continuation of an answer
      pendingA.push(ln.trim());
    } else if (pendingQ && !pendingA.length && ln.trim() && !A_PREFIX_RE.test(ln)) {
      // Q on previous line, A directly below without prefix
      pendingA.push(ln.trim());
    } else if (!ln.trim()) {
      flushQA();
    }
  }
  flushQA();

  // ---- pass 2: product / price lines -------------------------------------
  for (const ln of lines) {
    const m = ln.match(PRICE_LINE_RE);
    if (m) {
      const name = m[1].replace(BULLET_RE, "").trim();
      const price = parseInt(m[2], 10);
      if (name.length >= 3 && name.length <= 80 && price > 0) {
        productLines.push({ name, price });
      }
    }
  }

  // ---- pass 3: chunk into Documents --------------------------------------
  // Split on blank lines into paragraphs; merge if a section title appears.
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  for (const para of paragraphs) {
    if (para.length < 25) continue; // too short to be useful KB
    // Skip if it's purely Q/A — already turned into quick replies
    if (Q_PREFIX_RE.test(para) || A_PREFIX_RE.test(para.split("\n")[1] || "")) continue;

    const title = deriveTitle(para);
    documents.push({
      title: title.slice(0, 80),
      content: para.slice(0, 4000),
    });
  }

  // If nothing else matched, store the entire blob as one document.
  if (!documents.length && !quickReplies.length && !productLines.length && text.length >= 30) {
    documents.push({ title: "معلومات عامة", content: text.slice(0, 4000) });
  }

  // Deduplicate quickReplies by canonical triggers
  const seen = new Set<string>();
  const uniqueQR: typeof quickReplies = [];
  for (const qr of quickReplies) {
    const key = qr.triggers.map((t) => normalizeAr(t)).sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueQR.push(qr);
  }

  return { documents, quickReplies: uniqueQR.slice(0, 30), productLines };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractTriggers(question: string): string[] {
  const norm = normalizeAr(question);
  const tokens = norm.split(/\s+/).filter((w) => w.length > 2);
  // Top-3 distinct tokens; we want the matcher to fire on partial wording.
  const uniq: string[] = [];
  for (const t of tokens) {
    if (!uniq.includes(t)) uniq.push(t);
    if (uniq.length >= 3) break;
  }
  // Also include the raw question (truncated) so exact-substring matches work.
  return [...uniq, question.replace(/[?؟]/g, "").trim().slice(0, 50)].filter(Boolean);
}

function deriveTitle(paragraph: string): string {
  // Prefer the first heading-style line if any
  const titleMatch = paragraph.match(SECTION_TITLE_RE);
  if (titleMatch) return titleMatch[1].trim();

  // Otherwise take first ~6 words
  const firstLine = paragraph.split("\n")[0].trim();
  const words = firstLine.split(/\s+/);
  return words.slice(0, 6).join(" ");
}
