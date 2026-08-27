"use client";
// Prompt Lab — versioned prompt history (create/duplicate/publish/rollback),
// a real Prompt Playground (test a version against a live message before
// publishing it), and a raw provider capability tester (streaming / tool
// calling / reasoning). Publishing here is the ONLY thing that changes the
// live Bot.systemPrompt, and it always requires an explicit click — nothing
// on this page runs automatically.
import { useCallback, useEffect, useState } from "react";
import { useMutate } from "@/components/ui/use-mutate";
import {
  Loader2, Play, Copy, CheckCircle2, RotateCcw, Archive, Plus,
  FlaskConical, Wand2, Radio,
} from "lucide-react";

type Version = { id: string; title: string; body: string; status: string; version: number; publishedAt?: string | null };

export default function PromptLab() {
  const mutate = useMutate();
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>("");
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [testMsg, setTestMsg] = useState("عايز اعرف السعر");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await fetch("/api/prompts", { cache: "no-store" }).then((r) => r.json());
      if (j.ok) {
        setVersions(j.versions);
        if (!selected && j.versions?.length) {
          const pub = j.versions.find((v: Version) => v.status === "published");
          setSelected((pub || j.versions[0]).id);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [selected]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function createDraft() {
    if (newBody.trim().length < 10) return;
    setCreating(true);
    try {
      const j = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle, body: newBody }),
      }).then((r) => r.json());
      if (j.ok) { setNewTitle(""); setNewBody(""); await load(); }
    } finally { setCreating(false); }
  }

  async function act(id: string, action: "duplicate" | "publish" | "archive") {
    setBusyId(id);
    try {
      if (!(await mutate(`/api/prompts/${id}/${action}`, { method: "POST" }))) return;
      await load();
    } finally { setBusyId(null); }
  }

  async function runTest() {
    if (!selected || testMsg.trim().length < 2) return;
    setTesting(true); setTestResult(null);
    try {
      const j = await fetch("/api/ai-control/prompt-test/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptVersionId: selected, message: testMsg }),
      }).then((r) => r.json());
      setTestResult(j);
    } finally { setTesting(false); }
  }

  return (
    <div className="space-y-5">
      {/* Playground */}
      <div className="card p-6 space-y-3">
        <h2 className="font-bold text-lg inline-flex items-center gap-2">
          <FlaskConical className="w-4 h-4" /> اختبار البرومبت (Playground)
        </h2>
        <p className="text-sm text-slate-400">
          جرّب رسالة عميل حقيقية على أي نسخة برومبت قبل نشرها — رد فعلي من الموديل المُعدّ لحسابك.
        </p>
        <div className="grid md:grid-cols-[220px_1fr] gap-3">
          <select
            className="input"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {(versions || []).map((v) => (
              <option key={v.id} value={v.id}>
                v{v.version} — {v.title} {v.status === "published" ? "(منشور)" : v.status === "draft" ? "(مسودة)" : "(مؤرشف)"}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              value={testMsg}
              onChange={(e) => setTestMsg(e.target.value)}
              placeholder="اكتب رسالة عميل تجريبية…"
            />
            <button
              onClick={runTest}
              disabled={testing || !selected}
              className="px-4 rounded-xl bg-brand-500/20 border border-brand-500/40 text-brand-100 text-sm font-medium inline-flex items-center gap-2 hover:bg-brand-500/30 disabled:opacity-50"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} تشغيل
            </button>
          </div>
        </div>
        {testResult && (
          testResult.ok ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
              <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                <span>الثقة: {testResult.scores.confidence}</span>
                <span>المصادر: {testResult.scores.sourceCount}</span>
                <span>التأصيل المعرفي: {testResult.scores.groundingScore}</span>
              </div>
              <div className="text-sm text-slate-200 whitespace-pre-wrap">{testResult.llmResponse}</div>
            </div>
          ) : (
            <div className="text-sm text-rose-300">تعذّر التشغيل: {testResult.error}</div>
          )
        )}
      </div>

      {/* Version history */}
      <div className="card p-6 space-y-3">
        <h2 className="font-bold text-lg">سجل نسخ البرومبت</h2>
        <p className="text-sm text-slate-400">
          كل نشر (Publish) يستبدل التعليمات الحية للبوت فوراً — تراجع بنشر نسخة قديمة (Rollback).
        </p>
        {loading ? (
          <div className="p-8 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-500" /></div>
        ) : (
          <div className="space-y-2">
            {(versions || []).map((v) => (
              <div key={v.id} className="rounded-xl border border-white/10 bg-white/5 p-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-200 truncate">
                    v{v.version} — {v.title}{" "}
                    {v.status === "published" && (
                      <span className="text-[10px] rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 px-2 py-0.5 ms-1">منشور</span>
                    )}
                    {v.status === "draft" && (
                      <span className="text-[10px] rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-200 px-2 py-0.5 ms-1">مسودة</span>
                    )}
                    {v.status === "archived" && (
                      <span className="text-[10px] rounded-full bg-white/10 border border-white/10 text-slate-400 px-2 py-0.5 ms-1">مؤرشف</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 truncate max-w-xl">{v.body}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => act(v.id, "duplicate")}
                    disabled={busyId === v.id}
                    title="نسخ كمسودة جديدة"
                    className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  {v.status !== "published" && (
                    <button
                      onClick={() => act(v.id, "publish")}
                      disabled={busyId === v.id}
                      title="نشر (أو Rollback إن كانت نسخة قديمة)"
                      className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-300 inline-flex items-center gap-1"
                    >
                      {v.status === "archived" ? <RotateCcw className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    </button>
                  )}
                  {v.status === "draft" && (
                    <button
                      onClick={() => act(v.id, "archive")}
                      disabled={busyId === v.id}
                      title="أرشفة"
                      className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300"
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="pt-2 border-t border-white/10 space-y-2">
          <div className="text-sm font-medium text-slate-300 inline-flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" /> إنشاء مسودة جديدة</div>
          <input
            className="input"
            placeholder="عنوان (اختياري)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <textarea
            className="input min-h-[120px] font-mono text-sm"
            placeholder="نص التعليمات…"
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
          />
          <button
            onClick={createDraft}
            disabled={creating || newBody.trim().length < 10}
            className="px-4 py-2 rounded-xl bg-white/10 border border-white/10 text-sm font-medium hover:bg-white/15 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} إنشاء مسودة
          </button>
        </div>
      </div>

      <LlmCapabilityTester />
    </div>
  );
}

/** Raw provider capability check: streaming, tool calling, extended reasoning.
 *  Fully isolated from the chat pipeline — no customer/conversation rows, no billing. */
function LlmCapabilityTester() {
  const [message, setMessage] = useState("لخص ليا مميزات المنتج في جملتين.");
  const [useStream, setUseStream] = useState(true);
  const [useReasoning, setUseReasoning] = useState(false);
  const [useTool, setUseTool] = useState(false);
  const [running, setRunning] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [final, setFinal] = useState<any>(null);

  async function run() {
    setRunning(true); setStreamText(""); setFinal(null);
    const demoTool = useTool
      ? [{ name: "get_stock_status", description: "يرجع حالة توفر منتج بالاسم", parameters: { type: "object", properties: { productName: { type: "string" } }, required: ["productName"] } }]
      : undefined;
    try {
      if (useStream) {
        const res = await fetch("/api/ai-control/llm-test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, tools: demoTool, reasoning: useReasoning, stream: true }),
        });
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        if (reader) {
          let buf = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const parts = buf.split("\n\n");
            buf = parts.pop() || "";
            for (const p of parts) {
              const line = p.trim();
              if (!line.startsWith("data:")) continue;
              const evt = JSON.parse(line.slice(5).trim());
              if (evt.delta) setStreamText((t) => t + evt.delta);
              if (evt.done) setFinal(evt);
            }
          }
        }
      } else {
        const j = await fetch("/api/ai-control/llm-test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, tools: demoTool, reasoning: useReasoning }),
        }).then((r) => r.json());
        setFinal(j);
        setStreamText(j.text || "");
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="card p-6 space-y-3">
      <h2 className="font-bold text-lg inline-flex items-center gap-2">
        <Wand2 className="w-4 h-4" /> اختبار القدرات المتقدمة (Streaming / Tool Calling / Reasoning)
      </h2>
      <p className="text-sm text-slate-400">
        فحص مباشر لطبقة المزوّدين — بث تدريجي، استدعاء أدوات، وتفكير موسّع. لا يمسّ محادثات العملاء أو خط الإرسال إطلاقاً.
      </p>
      <textarea className="input min-h-[70px]" value={message} onChange={(e) => setMessage(e.target.value)} />
      <div className="flex flex-wrap gap-4 text-sm text-slate-300">
        <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={useStream} onChange={(e) => setUseStream(e.target.checked)} /> بث تدريجي (Streaming)</label>
        <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={useTool} onChange={(e) => setUseTool(e.target.checked)} /> استدعاء أداة تجريبية (Tool Calling)</label>
        <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={useReasoning} onChange={(e) => setUseReasoning(e.target.checked)} /> تفكير موسّع (Reasoning)</label>
      </div>
      <button
        onClick={run}
        disabled={running || message.trim().length < 1}
        className="px-4 py-2 rounded-xl bg-brand-500/20 border border-brand-500/40 text-brand-100 text-sm font-medium inline-flex items-center gap-2 hover:bg-brand-500/30 disabled:opacity-50"
      >
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />} تشغيل
      </button>
      {(streamText || final) && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
          {final?.error && <div className="text-sm text-rose-300">خطأ: {final.error}</div>}
          {streamText && <div className="text-sm text-slate-200 whitespace-pre-wrap">{streamText}</div>}
          {final?.thinkingText && (
            <div className="text-xs text-slate-400 border-t border-white/10 pt-2">
              <div className="font-medium mb-1">التفكير الموسّع:</div>
              <div className="whitespace-pre-wrap">{final.thinkingText}</div>
            </div>
          )}
          {final?.toolCalls?.length > 0 && (
            <div className="text-xs text-slate-400 border-t border-white/10 pt-2">
              <div className="font-medium mb-1">استدعاءات الأدوات:</div>
              {final.toolCalls.map((tc: any, i: number) => (
                <div key={i} className="font-mono">{tc.name}({JSON.stringify(tc.arguments)})</div>
              ))}
            </div>
          )}
          {final?.provider && <div className="text-[11px] text-slate-500">المزوّد: {final.provider}</div>}
        </div>
      )}
    </div>
  );
}
