import { getAuthContext } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getEntitlements } from "@/lib/membership/entitlements";
import { NumbersClient } from "./numbers-client";

export default async function NumbersPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!ctx.isOwner) redirect("/dashboard/settings");

  const uid = ctx.user.id;

  const [numbers, ents] = await Promise.all([
    (prisma as any).whatsAppNumber.findMany({
      where: { userId: uid },
      orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
      include: { settings: true },
    }),
    getEntitlements(uid),
  ]);

  const numberLimit = ents.limits.whatsapp; // 0 = unlimited
  const canAddMore = numberLimit === 0 || numbers.length < numberLimit;

  return (
    <NumbersClient
      numbers={numbers}
      numberLimit={numberLimit}
      canAddMore={canAddMore}
      tier={ents.tier}
    />
  );
}
