import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { chat as llmChat } from "@/lib/llm";
import { botProviderOverride } from "@/lib/providers/bot-provider";

export const dynamic = "force-dynamic";

/**
 * Generate 3 distinct, ready-to-send reply options for the admin to choose from.
 * Uses the same KB context the bot uses, but asks the LLM to produce three
 * different angles (e.g. polite, sales-pushy, factual). Costs ~1 LLM call.
 */
export async function POST(
  _req: Request,
  { params }: { params: { customerId: string } }
) {
  let user;
  try { user = await requirePermission("inbox"); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  const customerId = params.customerId;
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, userId: user.id },
    include: {
      conversation: {
        include: { messages: { orderBy: { createdAt: "asc" }, take: 20 } },
      },
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

  // Pull KB so suggestions are factually grounded.
  const docs = await prisma.document.findMany({
    where: { userId: user.id },
    select: { title: true, content: true },
    take: 50,
  });
  const kb = docs
    .map((d) => `# ${d.title}\n${d.content}`)
    .join("\n\n---\n\n")
    .slice(0, 8000);

  const bot = await prisma.bot.findUnique({ where: { userId: user.id } });

  const sys = [
    `أنت مساعد لموظف خدمة عملاء بشري. مهمتك اقتراح ٣ ردود قصيرة مختلفة بالعربية يمكن للموظف اختيار أحدها أو تعديله.`,
    `الشخصية المطلوبة: ${bot?.persona || "ودود ومحترف"}.`,
    ``,
    `أعد JSON فقط بهذا الشكل بدون أي شرح:`,
    `{"suggestions":[{"label":"رد سريع","text":"..."},{"label":"رد بيعي","text":"..."},{"label":"إغلاق البيع","text":"..."}]}`,
    ``,
    `قواعد:`,
    `- كل رد قصير (٢-٣ جمل بحد أقصى).`,
    `- لا تخترع أسعاراً أو معلومات غير موجودة في قاعدة المعرفة.`,
    `- نوّع الزاوية: "رد سريع" مختصر يطمّن العميل بسرعة، "رد بيعي" يبرز قيمة المنتج ويحفّز الشراء، "إغلاق البيع" يدفع العميل لاتخاذ القرار الآن (تأكيد الطلب/المقاس/العنوان).`,
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
      { temperature: 0.85, maxTokens: 600, provider: botProviderOverride(bot) }
    );
    parsed = extractJson(raw);
  } catch (e: any) {
    return NextResponse.json({ error: "llm_error", detail: e?.message }, { status: 502 });
  }

  let suggestions: { label: string; text: string }[] = [];
  if (parsed && Array.isArray(parsed.suggestions)) {
    suggestions = parsed.suggestions
      .filter((s: any) => s && typeof s.text === "string" && s.text.trim().length > 0)
      .slice(0, 3)
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
