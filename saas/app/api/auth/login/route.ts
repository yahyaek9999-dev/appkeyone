import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword, createSession } from "@/lib/auth";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const blocked = enforceRateLimit(req, { name: "login", ...RATE_LIMITS.auth });
  if (blocked) return blocked;
  let json: any;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 }); }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return NextResponse.json({ error: "بريد أو كلمة مرور خاطئة" }, { status: 401 });
  }
  await createSession(user.id);
  const role = (user as any).role || "user";
  return NextResponse.json({
    ok: true,
    role,
    redirectTo: role === "admin" ? "/admin" : "/dashboard",
  });
}
