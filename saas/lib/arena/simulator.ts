// Testing Arena 2.1 — multi-turn conversation simulator.
//
// Produces a real multi-turn transcript with NO LLM/key:
//   • Assistant turns = the real retrieval engine (semantic search) → answers
//     from actual knowledge, or an honest "no info → handoff".
//   • Customer turns = persona-driven follow-ups that BRANCH on whether the
//     assistant actually answered (objection if answered, escalation if not).
// Context memory = the running transcript + scenario topic. Resolution state is
// derived from the final assistant confidence + whether the customer escalated.
import { prisma } from "@/lib/db";
import { semanticSearch, incrementalIndex } from "@/lib/knowledge-brain/search";
import { SCENARIOS, type Scenario } from "./scenarios";

const PERSONA: Record<string, string> = {
  pricing: "باحث عن السعر",
  refund: "عميل غير راضٍ",
  order_tracking: "عميل قلق على طلبه",
  delivery_delay: "عميل منتظر",
  faq: "عميل يستفسر",
  upsell: "عميل مهتم بالترقية",
  cross_sell: "عميل مستكشف",
  abandoned_cart: "عميل متردد",
  complaint: "عميل غاضب",
  escalation: "عميل متصعّد",
  spam: "رسالة مزعجة",
  fake_lead: "عميل غير جاد",
};

// Persona-specific objections/clarifications used when the assistant answered.
const FOLLOWUPS: Record<string, string[]> = {
  pricing: ["وهل السعر شامل الشحن؟", "وفي خصم لو اشتريت أكتر من قطعة؟"],
  refund: ["وخلال كام يوم يتم رد المبلغ؟", "وهل الاسترجاع مجاني؟"],
  order_tracking: ["وامتى هيوصل بالظبط؟", "وممكن رقم تتبع الشحنة؟"],
  delivery_delay: ["وهل في تعويض عن التأخير؟", "وامتى أستلم بالظبط؟"],
  faq: ["وفي دفع عند الاستلام؟", "وبتوصلوا كل المحافظات؟"],
  upsell: ["والفرق في السعر كام؟", "وهل في ضمان أطول للموديل الأعلى؟"],
  cross_sell: ["وفي عرض لو اشتريت الاتنين مع بعض؟", "وهل المنتجين متوافقين؟"],
  abandoned_cart: ["وهل السلة لسه محفوظة؟", "وايه طرق الدفع المتاحة؟"],
  complaint: ["وايه الحل اللي هتقدموه؟", "وهعوّض إزاي عن المشكلة؟"],
  escalation: ["طيب مين المسؤول اللي هكلمه؟", "وامتى هيتم حل المشكلة؟"],
  spam: ["؟؟؟", "..."],
  fake_lead: ["طب وايه أرخص حاجة عندكم؟", "وهل في حاجة ببلاش؟"],
};
const GENERIC_FOLLOWUPS = ["وممكن تفاصيل أكتر؟", "وايه الخطوة الجاية؟"];

export interface SimMessage {
  turn: number;
  role: "customer" | "assistant";
  content: string;
  confidence: number;
}
export interface SimResult {
  conversationId: string;
  scenarioId: string;
  category: string;
  persona: string;
  resolutionState: string;
  avgConfidence: number;
  turns: number;
  messages: SimMessage[];
}

export async function simulateConversation(
  userId: string,
  scenario: Scenario,
  maxTurns = 3,
): Promise<SimResult> {
  await incrementalIndex(userId);
  const persona = PERSONA[scenario.category] || "عميل";
  const followups = FOLLOWUPS[scenario.category] || GENERIC_FOLLOWUPS;
  const messages: SimMessage[] = [];
  const confs: number[] = [];
  let escalated = false;
  let custMsg = scenario.message;
  let turn = 0;

  for (let t = 0; t < maxTurns; t++) {
    turn++;
    messages.push({ turn, role: "customer", content: custMsg, confidence: 0 });
    const r = await semanticSearch(userId, custMsg, 3);
    const conf = r.hits[0]?.confidence || 0;
    const snippet = (r.hits[0]?.snippet || "").slice(0, 160);
    confs.push(conf);
    let reply: string;
    if (conf >= 40) reply = `بخصوص استفسارك: ${snippet}`;
    else if (conf >= 15) reply = `حسب معلوماتنا: ${snippet} — لمزيد من التفاصيل تواصل مع الإدارة.`;
    else reply = "أعتذر، لا تتوفر لديّ معلومة كافية عن ذلك الآن — سأحوّلك لأحد زملائي من الفريق.";
    messages.push({ turn, role: "assistant", content: reply, confidence: conf });

    if (conf < 15) {
      escalated = true;
      turn++;
      messages.push({
        turn,
        role: "customer",
        content: "محدش بيجاوبني صح، عايز أكلّم مسؤول.",
        confidence: 0,
      });
      break;
    }
    custMsg = followups[t % followups.length];
  }

  const avgConfidence = confs.length
    ? Math.round(confs.reduce((a, b) => a + b, 0) / confs.length)
    : 0;
  const last = confs[confs.length - 1] || 0;
  const resolutionState = escalated ? "escalated" : last >= 40 ? "resolved" : "unresolved";

  const conv = await prisma.arenaConversation.create({
    data: {
      userId,
      scenarioId: scenario.id,
      category: scenario.category,
      persona,
      turns: messages.length,
      resolutionState,
      avgConfidence,
    },
  });
  await prisma.arenaMessage.createMany({
    data: messages.map((m) => ({ conversationId: conv.id, userId, ...m })),
  });

  return {
    conversationId: conv.id,
    scenarioId: scenario.id,
    category: scenario.category,
    persona,
    resolutionState,
    avgConfidence,
    turns: messages.length,
    messages,
  };
}

/** Simulate one representative scenario per requested category (or a single id). */
export async function simulateBatch(
  userId: string,
  opts: { scenarioId?: string; category?: string },
): Promise<SimResult[]> {
  let picks: Scenario[];
  if (opts.scenarioId) picks = SCENARIOS.filter((s) => s.id === opts.scenarioId);
  else if (opts.category) picks = SCENARIOS.filter((s) => s.category === opts.category).slice(0, 1);
  else {
    // one representative scenario from each of a few key categories
    const cats = ["pricing", "refund", "order_tracking", "complaint", "escalation"];
    picks = cats.map((c) => SCENARIOS.find((s) => s.category === c)).filter(Boolean) as Scenario[];
  }
  const out: SimResult[] = [];
  for (const s of picks) out.push(await simulateConversation(userId, s));
  return out;
}

export async function listConversations(userId: string, limit = 10) {
  const convs = await prisma.arenaConversation.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  const withMsgs = await Promise.all(
    convs.map(async (c) => ({
      ...c,
      messages: await prisma.arenaMessage.findMany({
        where: { conversationId: c.id },
        orderBy: { id: "asc" },
      }),
    })),
  );
  return withMsgs;
}
