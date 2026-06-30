// Knowledge Brain Pro — Knowledge Graph generation.
//
// Deterministic graph built from the tenant's real entities:
//   nodes  = products + documents + FAQs (quick replies)
//   edges  = related_to (content similarity ≥ threshold) + mentions (a document
//            or FAQ that names a product)
// No LLM, no mock data. Regenerated on demand and persisted.
import { prisma } from "@/lib/db";
import { embedLocal, cosine, type SparseVec } from "./vector";

const SIM_THRESHOLD = 0.12;
const MAX_PAIRS = 6000;

interface Entity {
  refType: "product" | "document" | "faq";
  refId: string;
  label: string;
  text: string;
}

export interface GraphStats {
  totalNodes: number;
  totalEdges: number;
  nodesByType: Record<string, number>;
  edgesByType: Record<string, number>;
  density: number; // 0-1
  isolated: number;
  mostConnected: { label: string; degree: number } | null;
}

export async function buildGraph(userId: string): Promise<GraphStats> {
  const [products, documents, bots] = await Promise.all([
    prisma.product.findMany({
      where: { userId },
      select: { id: true, name: true, description: true, category: true },
    }),
    prisma.document.findMany({
      where: { userId },
      select: { id: true, title: true, content: true },
    }),
    prisma.bot.findMany({ where: { userId }, select: { id: true } }),
  ]);
  const quickReplies = bots.length
    ? await prisma.quickReply.findMany({
        where: { botId: { in: bots.map((b) => b.id) } },
        select: { id: true, reply: true, triggers: true },
      })
    : [];

  const entities: Entity[] = [
    ...products.map((p) => ({
      refType: "product" as const,
      refId: p.id,
      label: p.name,
      text: `${p.name} ${p.description || ""} ${p.category || ""}`,
    })),
    ...documents.map((d) => ({
      refType: "document" as const,
      refId: d.id,
      label: d.title,
      text: `${d.title} ${d.content || ""}`,
    })),
    ...quickReplies.map((q) => ({
      refType: "faq" as const,
      refId: q.id,
      label: (q.reply || "").slice(0, 40) || "رد سريع",
      text: `${q.triggers || ""} ${q.reply || ""}`,
    })),
  ].filter((e) => e.label && e.text.trim().length > 1);

  // Fresh rebuild.
  await prisma.knowledgeGraphEdge.deleteMany({ where: { userId } });
  await prisma.knowledgeGraphNode.deleteMany({ where: { userId } });

  // Create nodes, keep embeddings in memory for edge computation.
  const nodes: {
    id: string;
    refType: string;
    label: string;
    vec: SparseVec;
    norm: number;
    textLc: string;
  }[] = [];
  for (const e of entities) {
    const emb = embedLocal(e.text);
    const node = await prisma.knowledgeGraphNode.create({
      data: { userId, refType: e.refType, refId: e.refId, label: e.label },
    });
    nodes.push({
      id: node.id,
      refType: e.refType,
      label: e.label,
      vec: emb.vec,
      norm: emb.norm,
      textLc: e.text.toLowerCase(),
    });
  }

  // Edges.
  const edges: { sourceId: string; targetId: string; type: string; weight: number }[] = [];
  const degree = new Map<string, number>();
  const bump = (id: string) => degree.set(id, (degree.get(id) || 0) + 1);

  // related_to (similarity) — bounded pair scan.
  let pairs = 0;
  for (let i = 0; i < nodes.length && pairs < MAX_PAIRS; i++) {
    for (let j = i + 1; j < nodes.length && pairs < MAX_PAIRS; j++) {
      pairs++;
      const sim = cosine(nodes[i].vec, nodes[i].norm, nodes[j].vec, nodes[j].norm);
      if (sim >= SIM_THRESHOLD) {
        edges.push({
          sourceId: nodes[i].id,
          targetId: nodes[j].id,
          type: "related_to",
          weight: Math.round(sim * 1000) / 1000,
        });
        bump(nodes[i].id);
        bump(nodes[j].id);
      }
    }
  }

  // mentions — a document/faq node whose text contains a product name.
  const productNodes = nodes.filter((n) => n.refType === "product");
  for (const n of nodes) {
    if (n.refType === "product") continue;
    for (const p of productNodes) {
      const name = p.label.toLowerCase().trim();
      if (name.length >= 3 && n.textLc.includes(name)) {
        edges.push({ sourceId: n.id, targetId: p.id, type: "mentions", weight: 1 });
        bump(n.id);
        bump(p.id);
      }
    }
  }

  if (edges.length)
    await prisma.knowledgeGraphEdge.createMany({ data: edges.map((e) => ({ userId, ...e })) });
  // Persist degrees — bucket node ids by degree value and use one updateMany per
  // distinct degree (a handful of values) instead of N sequential updates.
  // (codebase-audit "performance: N+1 writes" finding.)
  const buckets = new Map<number, string[]>();
  for (const [id, deg] of degree) {
    const b = buckets.get(deg) || [];
    b.push(id);
    buckets.set(deg, b);
  }
  await Promise.all(
    Array.from(buckets.entries()).map(([deg, ids]) =>
      prisma.knowledgeGraphNode.updateMany({ where: { id: { in: ids } }, data: { degree: deg } }),
    ),
  );

  return computeStats(userId);
}

export async function computeStats(userId: string): Promise<GraphStats> {
  const [nodes, edges] = await Promise.all([
    prisma.knowledgeGraphNode.findMany({ where: { userId } }),
    prisma.knowledgeGraphEdge.findMany({ where: { userId } }),
  ]);
  const nodesByType: Record<string, number> = {};
  for (const n of nodes) nodesByType[n.refType] = (nodesByType[n.refType] || 0) + 1;
  const edgesByType: Record<string, number> = {};
  for (const e of edges) edgesByType[e.type] = (edgesByType[e.type] || 0) + 1;
  const n = nodes.length;
  const maxEdges = n > 1 ? (n * (n - 1)) / 2 : 0;
  const density = maxEdges > 0 ? Math.round((edges.length / maxEdges) * 1000) / 1000 : 0;
  const isolated = nodes.filter((x) => x.degree === 0).length;
  const top = nodes.slice().sort((a, b) => b.degree - a.degree)[0];
  return {
    totalNodes: n,
    totalEdges: edges.length,
    nodesByType,
    edgesByType,
    density,
    isolated,
    mostConnected: top ? { label: top.label, degree: top.degree } : null,
  };
}

export async function getGraph(userId: string) {
  const [nodes, edges] = await Promise.all([
    prisma.knowledgeGraphNode.findMany({ where: { userId }, orderBy: { degree: "desc" } }),
    prisma.knowledgeGraphEdge.findMany({ where: { userId } }),
  ]);
  const stats = await computeStats(userId);
  return { nodes, edges, stats };
}
