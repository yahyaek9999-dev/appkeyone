/**
 * lib/brain/memory.ts — Customer Memory Engine (Phase 2).
 *
 * Enriches a customer's Brain memory from EXISTING conversation/order/CRM data
 * (Message, Conversation, Customer, Order, Document) — no rebuild of those
 * systems. Heuristic (no LLM): runs dialect + industry + classifiers over the
 * recent inbound text and upserts BrainMemory + BrainProfile + BrainInsight +
 * BrainKnowledgeLink. "Every conversation enriches memory."
 */
import { prisma } from "@/lib/db";
import { detectDialect, normalizeArabic } from "./dialect";
import { detectIndustry, getIndustryBrain } from "./industry";
import { classifyMessage, type Classification } from "./classify";
import { computeLeadScore } from "./profile";

export interface EnrichResult {
  profile: any; memory: any; insights: Classification[];
  dialect: string; dialectConfidence: number; industry: string;
  orderCount: number; vip: boolean; kbCount: number;
}

function stageFromScore(score: number, orderCount: number): string {
  if (orderCount > 0 && score >= 70) return "won";
  if (score >= 70) return "negotiating";
  if (score >= 40) return "engaged";
  if (score <= 10) return "dormant";
  return "new";
}

export async function enrichBrainMemory(userId: string, customerId: string, extraText = ""): Promise<EnrichResult> {
  const empty: EnrichResult = { profile: null, memory: null, insights: [], dialect: "", dialectConfidence: 0, industry: "generic", orderCount: 0, vip: false, kbCount: 0 };
  const customer = await prisma.customer.findFirst({ where: { id: customerId, userId } });
  if (!customer) return empty;

  const conv = await prisma.conversation.findFirst({ where: { customerId } });
  const messages = conv
    ? await prisma.message.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: "desc" }, take: 30 })
    : [];
  const orders = await prisma.order.findMany({ where: { userId, customerId }, orderBy: { createdAt: "desc" }, take: 10 }).catch(() => [] as any[]);

  const inboundText = [extraText, ...messages.filter((m: any) => m.role === "user").map((m: any) => String(m.content || ""))].join("  ").trim();
  const lastMsgId = (messages[0] as any)?.id || null;

  const dl = detectDialect(inboundText);
  const ind = detectIndustry(dl.normalized);
  const brain = getIndustryBrain(ind.industry);

  const orderCount = Number((customer as any).orderCount ?? orders.length ?? 0);
  const totalOrderValue = Number((customer as any).totalOrderValue ?? 0);
  const vip = Boolean((customer as any).vip);
  const insights = classifyMessage(inboundText, { orderCount, totalOrderValue, vip });

  const lowerNorm = normalizeArabic(inboundText).toLowerCase();
  const interests = Array.from(new Set(brain.signals.filter((s) => lowerNorm.includes(normalizeArabic(s).toLowerCase())))).slice(0, 10);
  const objections = insights.filter((i) => i.type === "PRICE_OBJECTION" || i.type === "DISCOUNT_REQUEST").map((i) => i.label);
  const angry = insights.find((i) => i.type === "ANGRY_CUSTOMER");
  const sentiment = angry ? "angry" : String((customer as any).lastSentiment || "neutral");
  const sentimentScore = angry ? -Math.min(1, angry.score) : 0;
  const purchaseHistory = orders.map((o: any) => ({ amount: Number(o.total || 0), status: String(o.status || ""), at: o.createdAt }));
  const supportHistory = angry ? [{ issue: "complaint", at: new Date().toISOString() }] : [];
  const summary = `عميل ${brain.label.ar}${dl.dialect ? ` (لهجة ${dl.dialect})` : ""}. ${insights.length ? "إشارات: " + insights.map((i) => i.label).join("، ") : "لا توجد إشارات بعد"}.`.slice(0, 600);
  const confidence = Math.min(100, 20 + messages.length * 2 + insights.length * 8);
  const leadScore = computeLeadScore({ baseScore: Number((customer as any).leadScore ?? 30), insights, orderCount });
  const factsJson = JSON.stringify({ industry: ind.industry, dialect: dl.dialect });

  const memData = {
    preferences: JSON.stringify(interests), interests: JSON.stringify(interests), objections: JSON.stringify(objections),
    purchaseHistory: JSON.stringify(purchaseHistory), supportHistory: JSON.stringify(supportHistory),
    summary, sentiment, sentimentScore, confidence, messageCount: messages.length, lastMessageId: lastMsgId, factsJson,
  };
  const memory = await prisma.brainMemory.upsert({ where: { customerId }, create: { userId, customerId, ...memData }, update: memData });

  const profData = {
    industry: String(ind.industry), dialect: dl.dialect, dialectConfidence: dl.confidence,
    leadScore, stage: stageFromScore(leadScore, orderCount), tags: JSON.stringify(insights.map((i) => i.type)), lastEnrichedAt: new Date(),
  };
  const profile = await prisma.brainProfile.upsert({ where: { customerId }, create: { userId, customerId, ...profData }, update: profData });

  for (const i of insights) {
    await prisma.brainInsight.create({ data: { userId, customerId, type: i.type, label: i.label, score: i.score, evidence: i.evidence.slice(0, 300), source: "heuristic", messageId: lastMsgId } }).catch(() => {});
  }

  let kbCount = 0;
  try {
    if (interests.length) {
      const docs = await prisma.document.findMany({ where: { userId, OR: interests.slice(0, 5).map((k) => ({ title: { contains: k } })) }, select: { id: true }, take: 5 });
      for (const d of docs) {
        await prisma.brainKnowledgeLink.upsert({ where: { customerId_documentId: { customerId, documentId: d.id } }, create: { userId, customerId, documentId: d.id, relevance: 0.6, reason: "interest_match" }, update: { relevance: 0.6 } }).catch(() => {});
      }
      kbCount = docs.length;
    }
  } catch { /* best-effort */ }

  return { profile, memory, insights, dialect: dl.dialect, dialectConfidence: dl.confidence, industry: String(ind.industry), orderCount, vip, kbCount };
}
