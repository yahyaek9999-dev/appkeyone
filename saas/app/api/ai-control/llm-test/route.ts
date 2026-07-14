// POST /api/ai-control/llm-test — isolated provider capability tester.
// Body: { message, systemPrompt?, tools?, toolChoice?, reasoning?, reasoningBudget?, stream? }
// When stream=true, responds with a text/event-stream of {delta} chunks then a final {done:true,...}.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserIdForPermission } from "@/lib/auth";
import { runLlmTest } from "@/lib/ai-control/llm-test";

export const dynamic = "force-dynamic";

const ToolDefSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().max(500).optional(),
  parameters: z.record(z.any()),
});

const Body = z.object({
  message: z.string().min(1).max(2000),
  systemPrompt: z.string().max(4000).optional(),
  tools: z.array(ToolDefSchema).max(8).optional(),
  toolChoice: z.union([z.enum(["auto", "none", "required"]), z.object({ name: z.string() })]).optional(),
  reasoning: z.boolean().optional(),
  reasoningBudget: z.number().int().min(256).max(16000).optional(),
  stream: z.boolean().optional(),
});

export async function POST(req: Request) {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });
  const args = parsed.data;

  if (!args.stream) {
    const res = await runLlmTest(uid, args);
    if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 422 });
    return NextResponse.json(res);
  }

  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: any) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };
      try {
        const res = await runLlmTest(uid, args, (chunk) => send({ delta: chunk }));
        if (!res.ok) send({ done: true, error: res.reason });
        else send({ done: true, ...res });
      } catch (e: any) {
        send({ done: true, error: e?.message ? String(e.message).slice(0, 250) : "stream_failed" });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
