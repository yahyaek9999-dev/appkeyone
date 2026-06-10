// Smart Campaigns — AI Message Generator.
//
// Generates a ready-to-edit WhatsApp campaign message for a given campaign
// type. One bounded LLM call routed through the merchant's selected provider
// (same pattern as the inbox suggest-reply route). This is a CONTENT helper —
// it never sends anything. The admin edits the result before creating a
// broadcast, which still goes through the normal protected send pipeline.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { checkLimit } from "@/lib/membership/limits";
import { chat as llmChat } from "@/lib/llm";
import { botProviderOverride } from "@/lib/providers/bot-provider";

export const dynamic = "force-dynamic";

const TYPE_GUIDE: Record<string, string> = {
  offer: "إعلان عرض جديد جذّاب يحفّز العميل على التفاعل.",
  discount: "حملة خصم واضحة مع نسبة/قيمة الخصم ودعوة لاغتنام الفرصة.",
  back_in_stock: "إشعار بعودة توفّر منتج كان نافداً، مع حثّ لطيف على الطلب السريع.",
  reminder: "تذكير ودّي بعرض أو منتج أو موعد، بدون إلحاح.",
  abandoned_cart: "رسالة استرجاع لعميل بدأ الطلب ولم يكمله، تطمئنه وتسهّل الإكمال.",
  seasonal: "حملة موسمية/مناسبة (عيد، موسم، مناسبة) بنبرة احتفالية مناسبة.",
  upsell: "اقتراح منتج مكمّل أو ترقية لعميل اشترى من قبل.",
};

export async function POST(req: Request) {
  const uid = await getUserIdForPermission("broadcasts");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  // Plan gate: a tier whose plan explicitly disables broadcasts (e.g. k_start)
  // must not reach this LLM-backed helper. Block only the explicit premium-lock
  // case so free/legacy users (never feature_disabled) are unaffected.
  const limit = await checkLimit(uid, "broadcast");
  if (!limit.allowed && limit.reason === "feature_disabled") {
    return NextResponse.json(
      { error: "البث غير متاح في باقتك الحالية", reason: limit.reason },
      { status: 402 },
    );
  }

  // AI cost guard: one bounded LLM call per request — rate-limit per workspace.
  const limited = enforceRateLimit(req, { name: "broadcast-generate", identifier: uid, ...RATE_LIMITS.chat });
  if (limited) return limited;

  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  const type = String(body.type || "offer");
  const product = String(body.product || "").trim().slice(0, 160);
  const offer = String(body.offer || "").trim().slice(0, 160);
  const guide = TYPE_GUIDE[type] || TYPE_GUIDE.offer;

  const bot = await prisma.bot.findUnique({ where: { userId: uid } }).catch(() => null);

  const sys = [
    "أنت كاتب تسويقي محترف لرسائل واتساب لنشاط تجاري عربي.",
    `اكتب رسالة حملة من نوع: ${guide}`,
    `الشخصية المطلوبة: ${bot?.persona || "ودود ومحترف"}.`,
    "",
    "قواعد:",
    "- رسالة واحدة قصيرة (٢-٤ جمل) جاهزة للإرسال على واتساب.",
    "- استخدم {name} كعنصر نائب لاسم العميل في البداية إن كان مناسباً.",
    "- نبرة دافئة طبيعية، بدون مبالغة، وبدون وعود كاذبة.",
    "- لا تخترع أسعاراً أو خصومات لم تُذكر. إن لم يُعطَ خصم، اجعل العرض عاماً.",
    "- إيموجي واحد أو اثنان كحد أقصى. بدون Markdown.",
    "- أعد نص الرسالة فقط بدون أي شرح أو عناوين.",
  ].join("\n");

  const userMsg = [
    product ? `المنتج/الخدمة: ${product}` : "",
    offer ? `تفاصيل العرض: ${offer}` : "",
    "اكتب الرسالة الآن.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const raw = await llmChat(
      [
        { role: "system", content: sys },
        { role: "user", content: userMsg },
      ],
      { temperature: 0.8, maxTokens: 320, provider: botProviderOverride(bot) },
    );
    const text = String(raw || "").replace(/```/g, "").trim();
    if (!text) {
      return NextResponse.json({ error: "empty" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, text: text.slice(0, 1200) });
  } catch (e: any) {
    return NextResponse.json(
      { error: "llm_error", detail: String(e?.message || e).slice(0, 200) },
      { status: 502 },
    );
  }
}
