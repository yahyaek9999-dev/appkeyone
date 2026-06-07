import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiGate } from "@/lib/membership/gate";

export const dynamic = "force-dynamic";

const db = prisma as any;

const DEFAULTS = {
  enabled: false,
  brandName: "",
  logoUrl: null,
  faviconUrl: null,
  primaryColor: "#01433E",
  accentColor: "#01433E",
  supportEmail: null,
  supportPhone: null,
  customDomain: null,
  hideKeyone: false,
};

export async function GET() {
  const g = await apiGate("white_label", "settings");
  if (g.response) return g.response;
  const uid = g.uid!;
  try {
    const cfg = await db.whiteLabelConfig.findUnique({ where: { userId: uid } });
    return NextResponse.json({ ok: true, config: cfg || { ...DEFAULTS } });
  } catch {
    return NextResponse.json({ ok: true, config: { ...DEFAULTS }, pending: true });
  }
}

export async function PUT(req: Request) {
  const g = await apiGate("white_label", "settings");
  if (g.response) return g.response;
  const uid = g.uid!;

  let body: any = {};
  try { body = await req.json(); } catch {}

  const data: any = {};
  for (const k of ["brandName", "logoUrl", "faviconUrl", "primaryColor", "accentColor", "supportEmail", "supportPhone", "customDomain"]) {
    if (typeof body[k] === "string") data[k] = body[k].trim();
  }
  if (typeof body.enabled === "boolean") data.enabled = body.enabled;
  if (typeof body.hideKeyone === "boolean") data.hideKeyone = body.hideKeyone;

  try {
    const saved = await db.whiteLabelConfig.upsert({
      where: { userId: uid },
      update: data,
      create: { userId: uid, ...DEFAULTS, ...data },
    });
    return NextResponse.json({ ok: true, config: saved });
  } catch {
    return NextResponse.json({ error: "not_ready", pending: true }, { status: 503 });
  }
}
