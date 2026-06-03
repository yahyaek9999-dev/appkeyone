import { getAuthContext } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { TeamSettingsUi } from "./team-settings-ui";

export const dynamic = "force-dynamic";

export default async function TeamSettingsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  // Only owner/admin may manage the team.
  if (!can(ctx.role, "team")) redirect("/dashboard");

  const user = ctx.user;
  const members = await prisma.teamMember.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, name: true, role: true, status: true, invitedAt: true, acceptedAt: true, lastLoginAt: true },
  });

  return (
    <TeamSettingsUi
      ownerEmail={user.email}
      ownerName={user.name || user.email}
      initialMembers={members.map((m) => ({
        id: m.id,
        email: m.email,
        name: m.name,
        role: m.role,
        status: m.status,
        invitedAt: m.invitedAt.toISOString(),
        acceptedAt: m.acceptedAt?.toISOString() || null,
        lastLoginAt: m.lastLoginAt?.toISOString() || null,
      }))}
    />
  );
}
