// AI Control Center Pro — Prompt Management.
//
// Versioned history of a tenant's assistant system prompt. Lifecycle:
//   draft → published → archived
// Exactly one version is published at a time; publishing writes its body to
// Bot.systemPrompt (the LIVE prompt the assistant uses), so "rollback" is just
// publishing an older version. All operations are tenant-scoped by userId.
import { prisma } from "@/lib/db";

export type PromptStatus = "draft" | "published" | "archived";

/** Ensure the tenant has at least one version — seed v1 from the live Bot
 *  prompt as "published" so history starts from the current reality. */
async function ensureSeed(userId: string) {
  // Serialized re-check so two concurrent loads (e.g. React StrictMode's double
  // mount) can't both seed — the second transaction sees count>0 and skips.
  await prisma.$transaction(async (tx) => {
    const count = await tx.promptVersion.count({ where: { userId } });
    if (count > 0) return;
    const bot = await tx.bot.findUnique({ where: { userId } });
    const body = (bot?.systemPrompt || "أنت مساعد ذكي.").trim();
    await tx.promptVersion.create({
      data: {
        userId,
        title: "النسخة الأساسية",
        body,
        status: "published",
        version: 1,
        publishedAt: new Date(),
      },
    });
  });
}

export async function listVersions(userId: string) {
  await ensureSeed(userId);
  return prisma.promptVersion.findMany({ where: { userId }, orderBy: { version: "desc" } });
}

export async function createVersion(userId: string, title: string, body: string) {
  await ensureSeed(userId);
  const max = await prisma.promptVersion.aggregate({ where: { userId }, _max: { version: true } });
  const version = (max._max.version || 0) + 1;
  return prisma.promptVersion.create({
    data: {
      userId,
      title: title?.trim() || `نسخة ${version}`,
      body: body.trim(),
      status: "draft",
      version,
    },
  });
}

export async function duplicateVersion(userId: string, id: string) {
  const src = await prisma.promptVersion.findFirst({ where: { id, userId } });
  if (!src) return null;
  const max = await prisma.promptVersion.aggregate({ where: { userId }, _max: { version: true } });
  const version = (max._max.version || 0) + 1;
  return prisma.promptVersion.create({
    data: { userId, title: `${src.title} (نسخة)`, body: src.body, status: "draft", version },
  });
}

/** Publish a version (also the rollback path). Demotes any other published
 *  version to archived and writes the body to the live Bot prompt — atomically. */
export async function publishVersion(userId: string, id: string) {
  const target = await prisma.promptVersion.findFirst({ where: { id, userId } });
  if (!target) return null;
  await prisma.$transaction([
    prisma.promptVersion.updateMany({
      where: { userId, status: "published", NOT: { id } },
      data: { status: "archived" },
    }),
    prisma.promptVersion.update({
      where: { id },
      data: { status: "published", publishedAt: new Date() },
    }),
    prisma.bot.updateMany({ where: { userId }, data: { systemPrompt: target.body } }),
  ]);
  return { ok: true, version: target.version };
}

export async function archiveVersion(userId: string, id: string) {
  const v = await prisma.promptVersion.findFirst({ where: { id, userId } });
  if (!v) return null;
  if (v.status === "published") return { ok: false as const, reason: "cannot_archive_published" };
  const upd = await prisma.promptVersion.updateMany({
    where: { id, userId },
    data: { status: "archived" },
  });
  return { ok: upd.count > 0 };
}
