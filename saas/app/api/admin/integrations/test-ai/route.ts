// POST /api/admin/integrations/test-ai  { provider, key? }  (Area 4)
//
// Tests an AI provider key from the admin panel. If `key` is provided it tests
// that ad-hoc value; otherwise it tests the stored (encrypted) key for the
// provider. Returns Connected / Failed with a short preview or error.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { decryptSecret } from "@/lib/crypto-util";
import { testProviderKey } from "@/lib/providers/provider-router";

export const dynamic = "force-dynamic";

const Body = z.object({
  provider: z.enum(["openai", "claude", "gemini"]),
  key: z.string().max(500).optional(),
});

const KEY_FIELD: Record<string, string> = {
  openai: "openaiKeyEnc",
  claude: "claudeKeyEnc",
  gemini: "geminiKeyEnc",
};

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });
  const { provider } = parsed.data;

  let apiKey = parsed.data.key?.trim() || "";
  if (!apiKey) {
    const cfg: any = await prisma.siteConfig.findUnique({ where: { id: "singleton" } });
    const enc = cfg?.[KEY_FIELD[provider]];
    if (!enc)
      return NextResponse.json(
        { ok: false, error: "لا يوجد مفتاح محفوظ لهذا المزوّد." },
        { status: 200 },
      );
    try {
      apiKey = decryptSecret(enc);
    } catch {
      return NextResponse.json(
        { ok: false, error: "تعذّر قراءة المفتاح المحفوظ." },
        { status: 200 },
      );
    }
  }

  const r = await testProviderKey(provider, apiKey);
  if (r.ok) return NextResponse.json({ ok: true, preview: r.preview });
  return NextResponse.json({ ok: false, error: r.error, status: r.status }, { status: 200 });
}
