import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { wa } from "@/lib/wa";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { phone } = await req.json();
    if (!phone) return NextResponse.json({ error: "رقم الهاتف مطلوب" }, { status: 400 });
    // Make sure session is started first
    await wa.start(user.id);
    // Tiny delay to allow socket init
    await new Promise((r) => setTimeout(r, 1000));
    const r = await wa.pair(user.id, phone);
    if (!r.ok) {
      return NextResponse.json({ error: r.data?.error || "تعذر إنشاء كود الربط" }, { status: 503 });
    }
    return NextResponse.json({ ok: true, code: r.data.code });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.message === "UNAUTHORIZED" ? 401 : 500 });
  }
}
