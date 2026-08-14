import { getAuthContext } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { NumberDetailClient } from "./number-detail-client";

export default async function NumberDetailPage({ params }: { params: { id: string } }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!ctx.isOwner) redirect("/dashboard/settings/numbers");

  const number = await (prisma as any).whatsAppNumber.findFirst({
    where: { id: params.id, userId: ctx.user.id },
    include: { settings: true },
  });

  if (!number) notFound();

  return <NumberDetailClient number={number} settings={number.settings} />;
}
