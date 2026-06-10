import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { chat as llmChat } from "@/lib/llm";
import { botProviderOverride } from "@/lib/providers/bot-provider";
import { retrieveRelevantKb } from "@/lib/kb-cache";

export const dynamic = "force-dynamic";

/**
 * Generate 3-4 distinct, ready-to-send reply options for the admin to choose from.
 * Enriched with customer memory, last 3 orders, and customer risk signals.
 * Costs ~1 LLM call per request.
 */
export async function POST(
  req: Request,
  props: { params: Promise<{ customerId: string }> }
) {
  const params = await props.params;
  let user;
  try { user = await requirePermission("inbox"); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  const limited = enforceRateLimit(req, { name: "inbox-suggest-reply", identifier: user.id, ...RATE_LIMITS.chat });
  if (limited) return limited;

  const customerId = params.customerId;
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, userId: user.id },
    include: {
      conversation: {
        include: { messages: { orderBy: { createdAt: "asc" }, take: 20 } },
      },
      memory: { select: { summary: true, factsJson: true } },
    },
  });
  if (!customer || !customer.conversation) {
    return NextResponse.json({ error: "customer not found" }, { status: 404 });
  }

  const msgs = customer.conversation.messages;
  const lastUser = [...msgs].reverse().find((m) => m.role === "user");
  if (!lastUser) {
    return NextResponse.json({ error: "no inbound message" }, { status: 400 });
  }

  // Load last 3 orders and bot config in parallel with KB retrieval
  const [kb, recentOrders, bot] = await Promise.all([
    retrieveRelevantKb(user.id, lastUser.content, { k: 5, charBudget: 4000, minScore: 0.06 }),
    (prisma as any).order.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { status: true, totalAmount: true, createdAt: true },
    }).catch(() => []),
    prisma.bot.findUnique({ where: { userId: user.id } }),
  ]);

  // Determine if customer is at-risk for a win-back suggestion
  const churnRisk = (customer as any).churnRiskScore ?? 0;
  const isAtRisk = churnRisk >= 60;

  // Format memory context
  const memBlock = customer.memory?.summary
    ? `\n### ذاكرة العميل\n${customer.memory.summary}`
    : "";

  // Format recent orders context
  const ordersBlock = recentOrders.length > 0
    ? `\n### آخر ${recentOrders.length} طلبات\n` +
      recentOrders.map((o: any) => {
        const date = new Date(o.createdAt).toLocaleDateString("ar-EG");
        return `- ${date}: ${o.status} — ${o.totalAmount ? `${o.totalAmount} ج.م` : "غير محدد"}`;
      }).join("\n")
    : "";

  // Build suggestion schema — add win-back slot when customer is at-risk
  const suggestionSchema = isAtRisk
    ? `{"suggestions":[{"label":"رد سريع","text":"..."},{"label":"رد بيعي","text":"..."},{"label":"استرداد عميل","text":"..."}]}`
    : `{"suggestions":[{"label":"رد سريع","text":"..."},{"label":"رد بيعي","text":"..."},{"label":"إغلاق البيع","text":"..."}]}`;

  const thirdSuggestionRule = isAtRisk
    ? `"استرداد عميل": رسالة دافئة تستعيد ثقة العميل، تُقدّر تعامله السابق وتعرض قيمة جديدة، بدون ضغط.`
    : `"إغلاق البيع": يدفع العميل لاتخاذ القرار الآن (تأكيد الطلب/المقاس/العنوان).`;

  const sys = [
    `أنت مساعد لموظف خدمة عملاء بشري. مهمتك اقتراح ٣ ردود قصيرة مختلفة بالعربية يمكن للموظف اختيار أحدها أو تعديله.`,
    `الشخصية المطلوبة: ${bot?.persona || "ودود ومحترف"}.`,
    memBlock,
    ordersBlock,
    ``,
    `أعد JSON فقط بهذا الشكل بدون أي شرح:`,
    suggestionSchema,
    ``,
    `قواعد:`,
    `- كل رد قصير (٢-٣ جمل بحد أقصى).`,
    `- لا تخترع أسعاراً أو معلومات غير موجودة في قاعدة المعرفة.`,
    `- نوّع الزاوية: "رد سريع" مختصر يطمّن العميل بسرعة، "رد بيعي" يبرز قيمة المنتج ويحفّز الشراء، ${thirdSuggestionRule}`,
    `- لا تستخدم Markdown.`,
    kb ? `\n--- معلومات الشركة ---\n${kb}\n--- نهاية ---` : "",
  ].join("\n");

  const history = msgs
    .slice(-10)
    .map((m) => `${m.role === "user" ? "العميل" : "الموظف"}: ${m.content}`)
    .join("\n");

  let parsed: any = null;
  try {
    const raw = await llmChat(
      [
        { role: "system", content: sys },
        {
          role: "user",
          content:
            `سياق المحادثة الأخيرة:\n${history}\n\n` +
            `آخر رسالة من العميل:\n"${lastUser.content.slice(0, 500)}"\n\n` +
            `اقترح ٣ ردود.`,
        },
      ],
      { temperature: 0.85, maxTokens: 700, provider: botProviderOverride(bot) }
    );
    parsed = extractJson(raw);
  } catch (e: any) {
    return NextResponse.json({ error: "llm_error", detail: e?.message }, { status: 502 });
  }

  let suggestions: { label: string; text: string }[] = [];
  if (parsed && Array.isArray(parsed.suggestions)) {
    suggestions = parsed.suggestions
      .filter((s: any) => s && typeof s.text === "string" && s.text.trim().length > 0)
      .slice(0, 4)
      .map((s: any) => ({
        label: String(s.label || "").slice(0, 30) || "اقتراح",
        text: String(s.text).slice(0, 800),
      }));
  }

  if (suggestions.length === 0) {
    return NextResponse.json({ error: "empty_suggestions" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, suggestions });
}

function extractJson(s: string): any | null {
  if (!s) return null;
  const cleaned = s.replace(/```json|```/g, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch {}
  }
  return null;
}
