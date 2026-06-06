// LLM-powered intent classifier for buying signals.
//
// Supplements (never replaces) the rule-based detector in lib/sales-engine.ts.
// Returns null on any error or timeout — callers always fall back to keyword
// detection via mergeSignals(). Cost: ~60 tokens per call, 3s timeout.

import { chat as llmChat } from "@/lib/llm";
import type { ProviderOverride } from "@/lib/llm";

export interface LLMIntentResult {
  buyStrong: boolean;
  hesitation: boolean;
  objection: "price" | "trust" | "shipping" | "quality" | null;
  frustrated: boolean;
}

const SYSTEM_PROMPT = `أنت مصنّف نية مشتري. مهمتك تحليل رسالة العميل وإعادة JSON فقط، بدون أي شرح إضافي.
الشكل المطلوب:
{"buyStrong":bool,"hesitation":bool,"objection":"price|trust|shipping|quality|null","frustrated":bool}

تعريفات:
- buyStrong: نية شراء واضحة (مثل "عاوزه"، "هاخده"، "احجزلي")
- hesitation: تردد أو تفكير (مثل "هفكر"، "مش متأكد"، "ممكن")
- objection: نوع الاعتراض لو موجود (price=سعر غالي، trust=شك في الشركة، shipping=شحن/توصيل، quality=جودة المنتج)
- frustrated: غضب أو إحباط واضح من العميل`;

function parseResult(raw: string): LLMIntentResult | null {
  try {
    // Strip markdown fences if present
    const cleaned = raw.replace(/```[a-z]*\n?/gi, "").trim();
    const obj = JSON.parse(cleaned);
    const objectionRaw = obj.objection;
    const validObjOptions = ["price", "trust", "shipping", "quality"] as const;
    const objection = validObjOptions.includes(objectionRaw) ? objectionRaw : null;
    return {
      buyStrong: Boolean(obj.buyStrong),
      hesitation: Boolean(obj.hesitation),
      objection,
      frustrated: Boolean(obj.frustrated),
    };
  } catch {
    return null;
  }
}

export async function classifyIntentLLM(
  text: string,
  provider: ProviderOverride | null,
  opts?: { timeoutMs?: number },
): Promise<LLMIntentResult | null> {
  if (!text || text.trim().length < 3) return null;
  const timeout = opts?.timeoutMs ?? 3000;
  const snippet = text.slice(0, 300);

  try {
    const raw = await llmChat(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `رسالة: "${snippet}"` },
      ],
      {
        provider,
        maxTokens: 60,
        temperature: 0,
        timeoutMs: timeout,
      },
    );
    return parseResult(raw);
  } catch {
    return null;
  }
}
