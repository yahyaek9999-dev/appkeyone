// POST /api/admin/copilot { question } → evidence-grounded answer from real data.
// Admin-only. Read-only: the Copilot never mutates anything. RBAC is enforced
// here; the snapshot it reads is platform-wide admin data.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { askCopilot } from "@/lib/admin/copilot";
import { audit } from "@/lib/audit/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json({ error: "forbidden" }, { status: 403 }); }

  let question = "";
  try {
    const body = await req.json();
    question = String(body?.question || "").slice(0, 500);
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (question.trim().length < 3) return NextResponse.json({ error: "question_too_short" }, { status: 400 });

  const result = await askCopilot(question);

  // Audit the query (read-only, but useful for oversight). No mutation performed.
  void audit({
    userId: admin.id,
    actorId: admin.id,
    actorEmail: (admin as any).email ?? null,
    actorRole: "admin",
    action: "admin.copilot.query" as any,
    targetType: "copilot",
    targetId: "query",
    metadata: { question, usedLlm: result.usedLlm },
    req,
  }).catch(() => {});

  return NextResponse.json({ ok: true, ...result });
}
