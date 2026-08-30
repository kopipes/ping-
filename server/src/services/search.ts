import { prisma } from "../lib/prisma.js";

interface SearchOptions {
  q: string;
  scope: "global" | "conversation";
  type?: "message" | "file" | "link";
  conversationId?: string | null;
  viewerId: string;
  limit?: number;
}

export async function searchContent(opts: SearchOptions) {
  const { q, scope, type, conversationId, viewerId } = opts;
  const limit = Math.min(Math.max(opts.limit || 20, 1), 50);

  // conversations yang bisa diakses viewer
  const member = await prisma.conversationMember.findMany({
    where: { userId: viewerId },
    select: { conversationId: true },
  });
  const accessibleIds = member.map((m) => m.conversationId);

  if (accessibleIds.length === 0) {
    return { messages: [], files: [], links: [] };
  }

  const convoScope = scope === "conversation" && conversationId
    ? [conversationId]
    : accessibleIds;
  const effectiveIds = convoScope.filter((id) => accessibleIds.includes(id) || scope === "conversation");

  const contains = { contains: q } as const;
  const messageWhere: any = {
    conversationId: { in: effectiveIds },
    isDeleted: false,
    isArchived: false,
    OR: [
      { content: contains },
      { attachments: { some: { fileName: contains } } },
      { attachments: { some: { type: "LINK" } } },
    ],
  };
  if (type === "message") {
    messageWhere.OR = [{ content: contains }];
  }

  const messages = await prisma.message.findMany({
    where: messageWhere,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
      conversation: { select: { id: true, name: true, type: true } },
      attachments: true,
    },
  });
  // attach DM partner name when conversation.type === DM
  const dmConvs = messages
    .filter((m) => m.conversation.type === "DM")
    .map((m) => m.conversationId);
  let dmPartners: Record<string, string> = {};
  if (dmConvs.length) {
    const convWithMembers = await prisma.conversation.findMany({
      where: { id: { in: [...new Set(dmConvs)] } },
      include: { members: { include: { user: { select: { id: true, name: true } } } } },
    });
    for (const c of convWithMembers) {
      const partner = c.members.find((mm) => mm.userId !== viewerId);
      dmPartners[c.id] = partner?.user.name ?? c.name ?? "DM";
    }
  }

  const results = messages.map((m) => ({
    id: m.id,
    conversationId: m.conversationId,
    conversationName: m.conversation.type === "DM" ? dmPartners[m.conversationId] : m.conversation.name,
    conversationType: m.conversation.type,
    content: m.content,
    createdAt: m.createdAt,
    user: m.user,
    userId: m.userId,
    attachments: m.attachments,
    matchType: m.attachments.some((a) => a.type === "FILE") && !m.content
      ? "file"
      : m.attachments.some((a) => a.type === "LINK")
        ? "link"
        : "message",
  }));

  // kategori
  const files = results.filter((r) => r.matchType === "file");
  const links = results.filter((r) => r.matchType === "link");
  const messagesOnly = results.filter((r) => r.matchType === "message");

  if (type === "file") return { messages: [], files, links: [] };
  if (type === "link") return { messages: [], files: [], links };
  if (type === "message") return { messages: messagesOnly, files: [], links: [] };

  return { messages: messagesOnly, files, links };
}