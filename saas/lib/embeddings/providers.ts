// Knowledge Brain Pro — embedding provider infrastructure.
//
// Provider abstraction with priority + automatic failover + health + usage
// telemetry. "local" is a real deterministic term-space embedder (no key).
// "openai"/"gemini" are real API integrations — they make real HTTP calls when
// a key is present and throw "no_key" otherwise (no mock, no fake output).
import { prisma } from "@/lib/db";
import { embedLocal } from "@/lib/knowledge-brain/vector";

export type ProviderType = "local" | "openai" | "gemini";

const DEFAULTS: { type: ProviderType; name: string; priority: number; model: string }[] = [
  { type: "local", name: "محلي (Term-Space)", priority: 10, model: "tf-cosine" },
  { type: "openai", name: "OpenAI", priority: 20, model: "text-embedding-3-small" },
  { type: "gemini", name: "Gemini", priority: 30, model: "text-embedding-004" },
];

/** Seed the three canonical providers on first access (idempotent). */
export async function ensureProviders() {
  for (const d of DEFAULTS) {
    await prisma.embeddingProvider.upsert({
      where: { type: d.type },
      create: { ...d },
      update: {},
    });
  }
}

function openaiKey() {
  return process.env.OPENAI_API_KEY || process.env.KEYONE_OPENAI_KEY || "";
}
function geminiKey() {
  return process.env.GEMINI_API_KEY || process.env.KEYONE_GEMINI_KEY || "";
}

/** Real OpenAI embeddings call. Returns a dense vector; throws on no key/error. */
async function embedOpenAI(text: string, model: string): Promise<number[]> {
  const key = openaiKey();
  if (!key) throw new Error("no_key");
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: model || "text-embedding-3-small", input: text.slice(0, 8000) }),
  });
  if (!r.ok) throw new Error(`http_${r.status}`);
  const j = await r.json();
  const emb = j?.data?.[0]?.embedding;
  if (!Array.isArray(emb)) throw new Error("no_embedding");
  return emb;
}

/** Real Gemini embeddings call. Returns a dense vector; throws on no key/error. */
async function embedGemini(text: string, model: string): Promise<number[]> {
  const key = geminiKey();
  if (!key) throw new Error("no_key");
  const m = model || "text-embedding-004";
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${m}:embedContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: { parts: [{ text: text.slice(0, 8000) }] } }),
    },
  );
  if (!r.ok) throw new Error(`http_${r.status}`);
  const j = await r.json();
  const emb = j?.embedding?.values;
  if (!Array.isArray(emb)) throw new Error("no_embedding");
  return emb;
}

async function recordUsage(
  provider: string,
  operation: string,
  opts: { latencyMs?: number; ok?: boolean; tokens?: number },
) {
  const day = new Date().toISOString().slice(0, 10);
  const ok = opts.ok !== false;
  await prisma.embeddingUsage.upsert({
    where: { provider_operation_day: { provider, operation, day } },
    create: {
      provider,
      operation,
      day,
      count: 1,
      tokens: opts.tokens || 0,
      totalLatencyMs: opts.latencyMs || 0,
      failures: ok ? 0 : 1,
    },
    update: {
      count: { increment: 1 },
      tokens: { increment: opts.tokens || 0 },
      totalLatencyMs: { increment: opts.latencyMs || 0 },
      failures: { increment: ok ? 0 : 1 },
    },
  });
}

/** Test a provider's connection; persists health + records usage. */
export async function testProvider(
  type: ProviderType,
): Promise<{ type: string; status: string; error: string; latencyMs: number }> {
  const prov = await prisma.embeddingProvider.findUnique({ where: { type } });
  const model = prov?.model || "";
  const start = Date.now();
  let status = "healthy",
    error = "";
  try {
    if (type === "local") embedLocal("اختبار الاتصال");
    else if (type === "openai") await embedOpenAI("connection test", model);
    else if (type === "gemini") await embedGemini("connection test", model);
  } catch (e: any) {
    status = "failed";
    error = String(e?.message || e);
  }
  const latencyMs = Date.now() - start;
  await prisma.embeddingProvider.update({
    where: { type },
    data: { status, lastError: error, lastCheckedAt: new Date() },
  });
  await recordUsage(type, "test", { latencyMs, ok: status === "healthy" });
  return { type, status, error, latencyMs };
}

export interface FailoverTrace {
  provider: string;
  ok: boolean;
  latencyMs: number;
  dims?: number;
  error?: string;
}

/** Embed a query trying providers by priority; falls back on failure. Returns
 *  the winning provider + the full attempt trace (proof of failover). */
export async function embedQueryFailover(text: string): Promise<{
  ok: boolean;
  provider?: string;
  dims?: number;
  kind?: string;
  trace: FailoverTrace[];
}> {
  await ensureProviders();
  const providers = await prisma.embeddingProvider.findMany({
    where: { enabled: true },
    orderBy: { priority: "asc" },
  });
  const trace: FailoverTrace[] = [];
  for (const p of providers) {
    const start = Date.now();
    try {
      let dims: number, kind: string;
      if (p.type === "local") {
        const e = embedLocal(text);
        dims = Object.keys(e.vec).length;
        kind = "sparse";
      } else {
        const v =
          p.type === "openai" ? await embedOpenAI(text, p.model) : await embedGemini(text, p.model);
        dims = v.length;
        kind = "dense";
      }
      const latencyMs = Date.now() - start;
      await recordUsage(p.type, "embed_query", { latencyMs, ok: true });
      trace.push({ provider: p.type, ok: true, latencyMs, dims });
      return { ok: true, provider: p.type, dims, kind, trace };
    } catch (e: any) {
      const latencyMs = Date.now() - start;
      await recordUsage(p.type, "embed_query", { latencyMs, ok: false });
      trace.push({ provider: p.type, ok: false, latencyMs, error: String(e?.message || e) });
    }
  }
  return { ok: false, trace };
}

/** Admin center payload: providers + global + per-provider stats. */
export async function getEmbeddingCenter() {
  await ensureProviders();
  const [providers, usage, totalVectors] = await Promise.all([
    prisma.embeddingProvider.findMany({ orderBy: { priority: "asc" } }),
    prisma.embeddingUsage.findMany(),
    prisma.documentChunk.count(),
  ]);
  const byProvider: Record<string, { calls: number; failures: number; latencyMs: number }> = {};
  for (const u of usage) {
    const b = (byProvider[u.provider] ||= { calls: 0, failures: 0, latencyMs: 0 });
    b.calls += u.count;
    b.failures += u.failures;
    b.latencyMs += u.totalLatencyMs;
  }
  const totalCalls = usage.reduce((s, u) => s + u.count, 0);
  const totalFailures = usage.reduce((s, u) => s + u.failures, 0);
  const totalLatency = usage.reduce((s, u) => s + u.totalLatencyMs, 0);
  return {
    providers: providers.map((p) => ({
      type: p.type,
      name: p.name,
      enabled: p.enabled,
      priority: p.priority,
      model: p.model,
      status: p.status,
      lastError: p.lastError,
      lastCheckedAt: p.lastCheckedAt,
      hasKey: p.type === "local" ? true : p.type === "openai" ? !!openaiKey() : !!geminiKey(),
      calls: byProvider[p.type]?.calls || 0,
      failures: byProvider[p.type]?.failures || 0,
      avgLatencyMs: byProvider[p.type]?.calls
        ? Math.round(byProvider[p.type].latencyMs / byProvider[p.type].calls)
        : 0,
    })),
    totals: {
      vectors: totalVectors,
      calls: totalCalls,
      failures: totalFailures,
      avgLatencyMs: totalCalls ? Math.round(totalLatency / totalCalls) : 0,
    },
  };
}
