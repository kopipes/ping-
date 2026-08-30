import { prisma } from "../lib/prisma.js";
import { json, parseJson } from "../lib/json.js";

export async function getDashboardStats() {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [today, week, month, total, active7, active30, topTopics, attachmentDist, totalUsers] =
    await Promise.all([
      prisma.message.count({ where: { createdAt: { gte: dayAgo }, isDeleted: false } }),
      prisma.message.count({ where: { createdAt: { gte: weekAgo }, isDeleted: false } }),
      prisma.message.count({ where: { createdAt: { gte: monthAgo }, isDeleted: false } }),
      prisma.message.count({ where: { isDeleted: false } }),
      prisma.user.count({ where: { lastSeenAt: { gte: weekAgo } } }),
      prisma.user.count({ where: { lastSeenAt: { gte: monthAgo } } }),
      prisma.message.groupBy({
        by: ["conversationId"],
        where: { isDeleted: false },
        _count: { _all: true },
        orderBy: { _count: { conversationId: "desc" } },
        take: 5,
      }),
      prisma.attachment.groupBy({
        by: ["type"],
        _count: { _all: true },
      }),
      prisma.user.count(),
    ]);

  const convoNames = await prisma.conversation.findMany({
    where: { id: { in: topTopics.map((t) => t.conversationId) } },
    select: {
      id: true,
      name: true,
      type: true,
      members: { select: { user: { select: { name: true } } } },
    },
  });

  const dist: Record<string, number> = { IMAGE: 0, FILE: 0, LINK: 0 };
  for (const a of attachmentDist) dist[a.type] = a._count._all;

  return {
    messages: { today, week, month, total },
    users: { total: totalUsers, active7, active30 },
    topTopics: topTopics.map((t) => {
      const convo = convoNames.find((c) => c.id === t.conversationId);
      let displayName: string;
      if (!convo) {
        displayName = t.conversationId;
      } else if (convo.name) {
        displayName = convo.name;
      } else if (convo.type === "DM") {
        displayName = convo.members.map((m) => m.user.name).join(" & ") || "Direct Message";
      } else {
        displayName = t.conversationId;
      }
      return { conversationId: t.conversationId, name: displayName, count: t._count._all };
    }),
    attachmentDist: dist,
  };
}

export async function getStorageInfo() {
  const totalBytes = await prisma.attachment.aggregate({ _sum: { fileSize: true } });
  const byTopic = await prisma.attachment.groupBy({
    by: ["type"],
    _count: { _all: true },
  });

  const perTopic = await prisma.attachment.findMany({
    select: { fileSize: true, message: { select: { conversationId: true } } },
  });
  const topicBytes = new Map<string, number>();
  for (const a of perTopic) {
    topicBytes.set(
      a.message.conversationId,
      (topicBytes.get(a.message.conversationId) ?? 0) + (a.fileSize ?? 0)
    );
  }
  const ids = [...topicBytes.keys()];
  const convos = await prisma.conversation.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });

  const countByType: Record<string, number> = {};
  for (const t of byTopic) countByType[t.type] = t._count._all;

  return {
    totalBytes: totalBytes._sum.fileSize ?? 0,
    countByType,
    perTopic: [...topicBytes.entries()]
      .map(([id, bytes]) => ({
        conversationId: id,
        name: convos.find((c) => c.id === id)?.name ?? id,
        bytes,
      }))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 10),
  };
}

export type RetentionPolicy = {
  mode: "forever" | "auto-archive";
  months?: number;
};

export async function getRetentionSettings(): Promise<RetentionPolicy> {
  const setting = await prisma.auditLog.findFirst({
    where: { action: "RETENTION_SET" },
    orderBy: { createdAt: "desc" },
    take: 1,
  });
  const meta = parseJson<{ mode?: string; months?: number } | null>(
    setting?.metadata
  );
  if (meta?.mode === "auto-archive") {
    return { mode: "auto-archive", months: Number(meta.months) || 6 };
  }
  return { mode: "forever", months: undefined };
}

export async function setRetentionSettings(userId: string, policy: RetentionPolicy) {
  await prisma.auditLog.create({
    data: {
      userId,
      action: "RETENTION_SET",
      metadata: json(policy),
    },
  });
  return policy;
}

// ── Edit window settings ──────────────────────────────────────────────────────

export async function getEditWindowMinutes(): Promise<number> {
  const setting = await prisma.auditLog.findFirst({
    where: { action: "EDIT_WINDOW_SET" },
    orderBy: { createdAt: "desc" },
    take: 1,
  });
  const meta = parseJson<{ minutes?: number } | null>(setting?.metadata);
  return Number(meta?.minutes) || 15;
}

export async function setEditWindowMinutes(userId: string, minutes: number) {
  await prisma.auditLog.create({
    data: { userId, action: "EDIT_WINDOW_SET", metadata: json({ minutes }) },
  });
  return { minutes };
}

export async function previewArchive() {
  const policy = await getRetentionSettings();
  const before = new Date(Date.now() - (policy.months || 6) * 30 * 24 * 60 * 60 * 1000);

  const affected = await prisma.message.findMany({
    where: { createdAt: { lte: before }, isArchived: false, isDeleted: false },
    select: { id: true, conversationId: true, attachments: { select: { fileSize: true, type: true } } },
  });

  const totalMessages = affected.length;
  const totalBytes = affected.reduce(
    (acc, m) => acc + m.attachments.reduce((s, a) => s + (a.fileSize ?? 0), 0),
    0
  );
  const countByType: Record<string, number> = {};
  for (const m of affected) for (const a of m.attachments) countByType[a.type] = (countByType[a.type] ?? 0) + 1;

  return { totalMessages, totalBytes, countByType, months: policy.months || 6 };
}

export async function runArchive(userId: string) {
  const policy = await getRetentionSettings();
  const before = new Date(Date.now() - (policy.months || 6) * 30 * 24 * 60 * 60 * 1000);
  const result = await prisma.message.updateMany({
    where: { createdAt: { lte: before }, isArchived: false, isDeleted: false },
    data: { isArchived: true },
  });
  await prisma.auditLog.create({
    data: {
      userId,
      action: "ARCHIVE_RUN",
      metadata: json({ updated: result.count }),
    },
  });
  return { archived: result.count };
}