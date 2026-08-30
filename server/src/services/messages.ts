import { prisma } from "../lib/prisma.js";
import { json } from "../lib/json.js";
import { getEditWindowMinutes } from "./admin.js";

export const EDIT_WINDOW_MINUTES = 15; // default, overridden by DB setting

export async function editMessageById(
  userId: string,
  messageId: string,
  content: string
) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, userId: true, conversationId: true, createdAt: true },
  });
  if (!message) throw new Error("Pesan tidak ditemukan");

  const isAdmin = await isAdminUser(userId);
  if (message.userId !== userId && !isAdmin)
    throw new Error("Tidak bisa edit pesan orang lain");

  if (!isAdmin) {
    const windowMins = await getEditWindowMinutes();
    const mins = (Date.now() - message.createdAt.getTime()) / 60000;
    if (mins > windowMins)
      throw new Error(`Batas ${windowMins} menit untuk edit pesan telah lewat`);
  }

  await prisma.message.update({
    where: { id: messageId },
    data: { content, isEdited: true },
  });
  return serializeMessage(messageId, userId);
}

export async function deleteMessageById(userId: string, messageId: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, userId: true, conversationId: true, createdAt: true },
  });
  if (!message) throw new Error("Pesan tidak ditemukan");

  const isAdmin = await isAdminUser(userId);
  const isSelf = message.userId === userId;

  if (!isSelf && !isAdmin)
    throw new Error("Tidak bisa hapus pesan orang lain");

  // Edit: 15-min limit for own messages; Delete: always allowed for own messages
  // Admin can always delete any message

  if (isAdmin && !isSelf) {
    await prisma.auditLog.create({
      data: {
        userId,
        action: "MESSAGE_DELETE_BY_ADMIN",
        targetId: messageId,
        metadata: json({ conversationId: message.conversationId }),
      },
    });
  }

  await prisma.message.update({
    where: { id: messageId },
    data: { isDeleted: true, deletedById: isAdmin && !isSelf ? userId : null },
  });
  return { conversationId: message.conversationId };
}

async function isAdminUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
}

export async function createMessage(params: {
  conversationId: string;
  userId: string;
  content?: string | null;
  parentId?: string | null;
  attachments?: Array<{
    type: string;
    fileUrl: string;
    thumbnailUrl?: string | null;
    fileName?: string | null;
    fileSize?: number | null;
    linkMetadata?: any;
  }>;
}) {
  const { conversationId, userId, content, parentId } = params;
  const message = await prisma.message.create({
    data: {
      conversationId,
      userId,
      content: content ?? null,
      parentId: parentId ?? null,
      ...(params.attachments && params.attachments.length > 0
        ? { attachments: { create: params.attachments.map((a, i) => ({
            type: a.type,
            fileUrl: a.fileUrl,
            thumbnailUrl: a.thumbnailUrl ?? null,
            fileName: a.fileName ?? null,
            fileSize: a.fileSize ? Number(a.fileSize) : null,
            linkMetadata: json(a.linkMetadata),
            createdAt: new Date(Date.now() + i),
          })) } }
        : {}),
    },
  });
  await prisma.conversationMember.updateMany({
    where: { conversationId, userId },
    data: { lastReadMessageAt: new Date() },
  });
  return serializeMessage(message.id, userId);
}

// Forward pesan ke conversation lain (in-app). FR-forward.
export async function forwardMessage(params: {
  sourceMessageId: string;
  targetConversationId: string;
  userId: string; // forwarder
  note?: string | null;
}) {
  const { sourceMessageId, targetConversationId, userId, note } = params;

  const source = await prisma.message.findFirst({
    where: { id: sourceMessageId, isDeleted: false },
    include: {
      attachments: true,
      user: { select: { id: true, name: true } },
    },
  });
  if (!source) throw new Error("Pesan sumber tidak ditemukan");

  // verifikasi target
  const target = await prisma.conversation.findUnique({
    where: { id: targetConversationId },
    select: { isReadOnly: true, type: true },
  });
  if (!target) throw new Error("Conversation tujuan tidak ditemukan");

  const membership = await prisma.conversationMember.findUnique({
    where: {
      conversationId_userId: { conversationId: targetConversationId, userId },
    },
    select: { role: true },
  });
  if (!membership) throw new Error("Anda bukan member conversation tujuan");
  if (target.isReadOnly && membership.role !== "ADMIN" && membership.role !== "SUPER_ADMIN") {
    throw new Error("Tidak dapat meneruskan pesan ke Announcement");
  }

  const forwarder = await prisma.user.findUnique({ where: { id: userId } });
  const isTargetAdmin = forwarder?.role === "ADMIN" || forwarder?.role === "SUPER_ADMIN";
  if (target.isReadOnly && !isTargetAdmin) {
    throw new Error("Tidak dapat meneruskan pesan ke Announcement");
  }

  // konten pesan forwardan (boleh ada note tambahan dari forwarder)
  const contentParts: string[] = [];
  if (source.content) contentParts.push(source.content);
  if (note) contentParts.push(`*Diteruskan oleh ${forwarder?.name ?? "seseorang"}* — ${note}`);
  const content = contentParts.length ? contentParts.join("\n") : null;

  const message = await prisma.message.create({
    data: {
      conversationId: targetConversationId,
      userId, // forwarder sebagai pengirim di chat tujuan
      content,
      forwardedFromId: source.id,
      forwardedFromConversationId: source.conversationId,
      forwardedFromName: source.user?.name ?? null,
      // salin attachment dari pesan sumber (reuse file URL, tanpa meng-copy file fisik)
      ...(source.attachments.length > 0
        ? {
            attachments: {
              create: source.attachments.map((a) => ({
                type: a.type,
                fileUrl: a.fileUrl,
                thumbnailUrl: a.thumbnailUrl,
                fileName: a.fileName,
                fileSize: a.fileSize,
                linkMetadata: a.linkMetadata,
              })),
            },
          }
        : {}),
    },
  });

  await prisma.conversationMember.updateMany({
    where: { conversationId: targetConversationId, userId },
    data: { lastReadMessageAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: "MESSAGE_FORWARD",
      targetId: message.id,
      metadata: json({
        sourceMessageId: source.id,
        targetConversationId,
        fromConversationId: source.conversationId,
      }),
    },
  });

  return serializeMessage(message.id, userId);
}

export async function getMessageWithContext(
  conversationId: string,
  viewerId: string,
  parentId?: string | null
) {
  const data = await prisma.message.findFirst({
    where: {
      conversationId,
      ...(parentId ? { id: parentId } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: { id: true, name: true, avatarUrl: true },
      },
      attachments: true,
      reactions: {
        select: { emoji: true, userId: true },
      },
      _count: {
        select: { replies: true },
      },
    },
  });

  if (!data) return null;

  return {
    id: data.id,
    conversationId: data.conversationId,
    parentId: data.parentId,
    content: data.content,
    isEdited: data.isEdited,
    isDeleted: data.isDeleted,
    createdAt: data.createdAt,
    userId: data.userId,
    user: data.user,
    attachments: data.attachments,
    reactions: data.reactions,
    replyCount: data._count.replies,
    status: "sent",
    isForwarded: !!data.forwardedFromId,
    forwardedFromName: data.forwardedFromName,
    forwardedFromConversationId: data.forwardedFromConversationId,
  };
}

export async function serializeMessage(messageId: string, viewerId: string) {
  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
      attachments: true,
      reactions: { select: { emoji: true, userId: true } },
      _count: { select: { replies: true } },
    },
  });
  if (!msg) return null;
  return {
    id: msg.id,
    conversationId: msg.conversationId,
    parentId: msg.parentId,
    content: msg.content,
    isEdited: msg.isEdited,
    isDeleted: msg.isDeleted,
    createdAt: msg.createdAt,
    userId: msg.userId,
    user: msg.user,
    attachments: msg.attachments,
    reactions: msg.reactions,
    replyCount: msg._count.replies,
    status: "sent" as const,
    isForwarded: !!msg.forwardedFromId,
    forwardedFromName: msg.forwardedFromName,
    forwardedFromConversationId: msg.forwardedFromConversationId,
  };
}