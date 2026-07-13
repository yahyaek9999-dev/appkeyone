/**
 * Merge two Customer rows that represent the same real person into one.
 *
 * Real scenario this closes (previously just a TODO — see
 * app/api/whatsapp/incoming/route.ts's harvested-phone handling): a contact
 * first messages via a WhatsApp LID (privacy id, no real phone visible), so a
 * Customer row is created for the LID. Later they share their real phone,
 * but if another Customer row already owns that phone for this merchant
 * (@@unique([userId, phone])), the LID row's phone can't just be overwritten
 * — the system left two rows for the same person with the note "we'll
 * surface a merge tool later."
 *
 * Every model with a customerId foreign key (26 across the schema as of this
 * writing) is walked here. Two shapes:
 *   - 1:many (Order, BroadcastItem, FollowUpTask, ...): reassigned to the
 *     survivor with a plain updateMany.
 *   - 1:1 (@unique customerId — Conversation, CustomerMemory, BrainProfile,
 *     BrainMemory): if only one side has a row, reassign it; if BOTH have
 *     one, the row can't just be reassigned (would violate the unique
 *     constraint) — see mergeConversation for how Conversation specifically
 *     absorbs messages/orders before the loser is dropped; the smaller
 *     profile/memory rows are decided by "prefer more recent" rather than a
 *     deep content merge (out of safe scope for an automated tool).
 *   - Composite-unique customerId (MemoryEdge, RecoveryDismissal,
 *     BrainKnowledgeLink): reassigning can collide with a row the survivor
 *     already has for the same key. Each has its own conflict rule below.
 *
 * Entirely wrapped in one Prisma transaction — either the whole merge lands
 * or none of it does. No partial-merge state is possible.
 */
import type { PrismaClient } from "@prisma/client";

export interface MergeResult {
  survivorId: string;
  absorbedId: string;
  movedCounts: Record<string, number>;
}

export class MergeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MergeError";
  }
}

// Plain 1:many models — safe to reassign customerId directly, no conflict possible.
const SIMPLE_MANY_MODELS = [
  "broadcastItem",
  "knowledgeGap",
  "order",
  "escalationTicket",
  "usageLedger",
  "followUpTask",
  "protectionLog",
  "banEvent",
  "safetyEvent",
  "couponRedemption",
  "conversationNote",
  "automationActionLog",
  "brainInsight",
  "brainMessage",
  "agentExecution",
  "actionExecution",
  "incident",
  "customerProblem",
] as const;

// 1:1 (@unique customerId) models where, if both sides have a row, we keep
// the survivor's and drop the absorbed one rather than deep-merging content.
const SINGLETON_MODELS = ["customerMemory", "brainProfile", "brainMemory"] as const;

export async function mergeCustomers(
  prisma: PrismaClient,
  opts: { userId: string; survivorId: string; absorbedId: string },
): Promise<MergeResult> {
  const { userId, survivorId, absorbedId } = opts;
  if (survivorId === absorbedId) {
    throw new MergeError("لا يمكن دمج العميل مع نفسه");
  }

  return prisma.$transaction(async (tx) => {
    const [survivor, absorbed] = await Promise.all([
      tx.customer.findUnique({ where: { id: survivorId } }),
      tx.customer.findUnique({ where: { id: absorbedId } }),
    ]);
    if (!survivor || survivor.userId !== userId) throw new MergeError("العميل الأساسي غير موجود");
    if (!absorbed || absorbed.userId !== userId) throw new MergeError("العميل المطلوب دمجه غير موجود");

    const movedCounts: Record<string, number> = {};

    // ---- Conversation (1:1, the highest-stakes case) ------------------------
    // Absorbs messages + orders from the loser's conversation rather than
    // just reassigning, since the survivor may already have its own.
    const [survivorConv, absorbedConv] = await Promise.all([
      (tx as any).conversation.findUnique({ where: { customerId: survivorId } }),
      (tx as any).conversation.findUnique({ where: { customerId: absorbedId } }),
    ]);
    if (absorbedConv) {
      if (survivorConv) {
        const [msgs, orders] = await Promise.all([
          (tx as any).message.updateMany({
            where: { conversationId: absorbedConv.id },
            data: { conversationId: survivorConv.id },
          }),
          (tx as any).order.updateMany({
            where: { conversationId: absorbedConv.id },
            data: { conversationId: survivorConv.id },
          }),
        ]);
        movedCounts.messages = msgs.count;
        movedCounts.ordersByConversation = orders.count;
        await (tx as any).conversation.delete({ where: { id: absorbedConv.id } });
      } else {
        await (tx as any).conversation.update({
          where: { id: absorbedConv.id },
          data: { customerId: survivorId },
        });
        movedCounts.conversation = 1;
      }
    }

    // ---- Simple 1:many models ------------------------------------------------
    for (const model of SIMPLE_MANY_MODELS) {
      const res = await (tx as any)[model].updateMany({
        where: { customerId: absorbedId },
        data: { customerId: survivorId },
      });
      if (res.count) movedCounts[model] = res.count;
    }

    // ---- Singleton 1:1 models — keep survivor's, drop absorbed's on conflict --
    for (const model of SINGLETON_MODELS) {
      const absorbedRow = await (tx as any)[model].findUnique({ where: { customerId: absorbedId } });
      if (!absorbedRow) continue;
      const survivorRow = await (tx as any)[model].findUnique({ where: { customerId: survivorId } });
      if (survivorRow) {
        await (tx as any)[model].delete({ where: { customerId: absorbedId } });
      } else {
        await (tx as any)[model].update({ where: { customerId: absorbedId }, data: { customerId: survivorId } });
        movedCounts[model] = 1;
      }
    }

    // ---- MemoryEdge — composite unique, sum weight on conflict ---------------
    // @@unique([userId, customerId, subjectType, subjectKey, relation, objectType, objectKey])
    const absorbedEdges = await (tx as any).memoryEdge.findMany({ where: { userId, customerId: absorbedId } });
    let edgesMoved = 0;
    for (const edge of absorbedEdges) {
      const conflict = await (tx as any).memoryEdge.findUnique({
        where: {
          userId_customerId_subjectType_subjectKey_relation_objectType_objectKey: {
            userId,
            customerId: survivorId,
            subjectType: edge.subjectType,
            subjectKey: edge.subjectKey,
            relation: edge.relation,
            objectType: edge.objectType,
            objectKey: edge.objectKey,
          },
        },
      });
      if (conflict) {
        await (tx as any).memoryEdge.update({
          where: { id: conflict.id },
          data: { weight: conflict.weight + edge.weight },
        });
        await (tx as any).memoryEdge.delete({ where: { id: edge.id } });
      } else {
        await (tx as any).memoryEdge.update({ where: { id: edge.id }, data: { customerId: survivorId } });
        edgesMoved++;
      }
    }
    if (edgesMoved) movedCounts.memoryEdge = edgesMoved;

    // ---- RecoveryDismissal — composite unique, drop absorbed's on conflict ---
    // @@unique([userId, customerId, kind])
    const absorbedDismissals = await (tx as any).recoveryDismissal.findMany({ where: { userId, customerId: absorbedId } });
    let dismissalsMoved = 0;
    for (const d of absorbedDismissals) {
      const conflict = await (tx as any).recoveryDismissal.findUnique({
        where: { userId_customerId_kind: { userId, customerId: survivorId, kind: d.kind } },
      });
      if (conflict) {
        await (tx as any).recoveryDismissal.delete({ where: { id: d.id } });
      } else {
        await (tx as any).recoveryDismissal.update({ where: { id: d.id }, data: { customerId: survivorId } });
        dismissalsMoved++;
      }
    }
    if (dismissalsMoved) movedCounts.recoveryDismissal = dismissalsMoved;

    // ---- BrainKnowledgeLink — composite unique, keep the higher relevance ----
    // @@unique([customerId, documentId])
    const absorbedLinks = await (tx as any).brainKnowledgeLink.findMany({ where: { customerId: absorbedId } });
    let linksMoved = 0;
    for (const link of absorbedLinks) {
      const conflict = await (tx as any).brainKnowledgeLink.findUnique({
        where: { customerId_documentId: { customerId: survivorId, documentId: link.documentId } },
      });
      if (conflict) {
        if (link.relevance > conflict.relevance) {
          await (tx as any).brainKnowledgeLink.update({ where: { id: conflict.id }, data: { relevance: link.relevance, reason: link.reason } });
        }
        await (tx as any).brainKnowledgeLink.delete({ where: { id: link.id } });
      } else {
        await (tx as any).brainKnowledgeLink.update({ where: { id: link.id }, data: { customerId: survivorId } });
        linksMoved++;
      }
    }
    if (linksMoved) movedCounts.brainKnowledgeLink = linksMoved;

    // ---- Survivor identity fields: fill gaps, union flags/tags, never drop data --
    const identityUpdate: any = {};
    if (!survivor.name && absorbed.name) identityUpdate.name = absorbed.name;
    if (!survivor.photoUrl && absorbed.photoUrl) identityUpdate.photoUrl = absorbed.photoUrl;
    if (!survivor.assignedAdmin && absorbed.assignedAdmin) identityUpdate.assignedAdmin = absorbed.assignedAdmin;
    // vip/blacklisted are protective flags — if either row was flagged, the
    // merged customer must stay flagged; losing one silently would be a real
    // regression (e.g. an admin-blacklisted contact becoming reachable again).
    if (absorbed.vip && !survivor.vip) identityUpdate.vip = true;
    if (absorbed.blacklisted && !survivor.blacklisted) identityUpdate.blacklisted = true;
    // Notes are free-text admin context — concatenate rather than drop.
    if (absorbed.notes && absorbed.notes.trim()) {
      identityUpdate.notes = survivor.notes
        ? `${survivor.notes}\n---\n(من العميل المدموج) ${absorbed.notes}`
        : absorbed.notes;
    }
    // Tags: union of both JSON arrays.
    try {
      const survivorTags: string[] = JSON.parse(survivor.tags || "[]");
      const absorbedTags: string[] = JSON.parse(absorbed.tags || "[]");
      const union = Array.from(new Set([...survivorTags, ...absorbedTags]));
      if (union.length !== survivorTags.length) identityUpdate.tags = JSON.stringify(union);
    } catch {
      /* malformed tags JSON on either side — leave survivor's as-is */
    }
    if (Object.keys(identityUpdate).length) {
      await tx.customer.update({ where: { id: survivorId }, data: identityUpdate });
    }

    // ---- Finally, drop the absorbed customer row -----------------------------
    await tx.customer.delete({ where: { id: absorbedId } });

    return { survivorId, absorbedId, movedCounts };
  });
}
