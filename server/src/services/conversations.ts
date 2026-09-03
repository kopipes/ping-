import { prisma } from "../lib/prisma.js";

const ROLE_RANK: Record<string, number> = {
  SUPER_ADMIN: 3,
  ADMIN: 2,
  MANAGER: 1,
  STAFF: 0,
};

export const canCreateLevel1 = (role: string) =>
  role === "ADMIN" || role === "SUPER_ADMIN" || role === "MANAGER";

// Level 1 (divisi) yang bisa dikelola oleh user (sebagai owner/manager)
export async function listAccessibleParents(role: string, userId: string) {
  const isCorporate = canCreateLevel1(role);
  const topics = await prisma.conversation.findMany({
    where: {
      type: "TOPIC",
      parentId: null,
      isArchived: false,
      NOT: { isPinnedTop: true },
      ...(isCorporate
        ? {}
        : {
            OR: [
              { ownerId: userId },
              { members: { some: { userId } } },
            ],
          }),
    },
    select: { id: true, name: true, icon: true, ownerId: true },
    orderBy: { name: "asc" },
  });
  return topics;
}

export async function canCreateSubTopic(
  role: string,
  userId: string,
  parentId: string
) {
  // Corporate & super admin bisa buat sub-topic di topic manapun
  if (role === "ADMIN" || role === "SUPER_ADMIN") return true;

  const parent = await prisma.conversation.findFirst({
    where: {
      id: parentId,
      type: "TOPIC",
      parentId: null,
      isArchived: false,
      OR: [{ ownerId: userId }, { members: { some: { userId, role: { in: ["MANAGER", "ADMIN", "SUPER_ADMIN"] } } } }],
    },
  });
  return !!parent;
}

interface SidebarItem {
  id: string;
  type: string;
  name: string | null;
  icon: string | null;
  isPinnedTop: boolean;
  isReadOnly: boolean;
  parentId: string | null;
  unread: number;
  subTopics?: SidebarItem[];
  isOrphanSub?: boolean;
  parentName?: string | null;
  parentIcon?: string | null;
  partnerId?: string | null;
  partnerAvatarUrl?: string | null;
  lastMessageAt?: string | null;
  lastMessageText?: string | null;
  lastMessageSender?: string | null;
}

// Struktur navigasi Sidebar (Section 3, FR-2.x)
// [PinnedTop] -> [Level 1 (+ subTopics)] -> [DM]
export async function getSidebar(userId: string) {
  const memberships = await prisma.conversationMember.findMany({
    where: { userId },
    include: {
      conversation: {
        select: {
          id: true,
          type: true,
          name: true,
          icon: true,
          isPinnedTop: true,
          isReadOnly: true,
          isPublic: true,
          parentId: true,
          isArchived: true,
        },
      },
    },
  });

  // Also fetch public groups the user is NOT a member of
  const memberIds = new Set(memberships.map((m) => m.conversationId));
  const publicGroups = await prisma.conversation.findMany({
    where: {
      isPublic: true,
      isArchived: false,
      type: "TOPIC",
      id: { notIn: memberIds.size > 0 ? [...memberIds] : undefined },
    },
    select: {
      id: true,
      type: true,
      name: true,
      icon: true,
      isPinnedTop: true,
      isReadOnly: true,
      isPublic: true,
      parentId: true,
      isArchived: true,
    },
  });

  // hitung unread dalam SATU query (bukan N query) — FR-5.2/prinsip ringan di server
  const withLastRead = memberships.filter((m) => m.lastReadMessageAt);
  const unreadByConvo: Record<string, number> = {};
  if (withLastRead.length > 0) {
    const unreadMsgs = await prisma.message.findMany({
      where: {
        OR: withLastRead.map((m) => ({
          conversationId: m.conversationId,
          isDeleted: false,
          createdAt: { gt: m.lastReadMessageAt! },
          NOT: { userId },
        })),
      },
      select: { conversationId: true },
    });
    for (const u of unreadMsgs) {
      unreadByConvo[u.conversationId] = (unreadByConvo[u.conversationId] || 0) + 1;
    }
  }

  const dms: SidebarItem[] = [];

  const pinnedTop: SidebarItem[] = [];
  const level1: SidebarItem[] = [];
  const pendingSubs: (SidebarItem & { parentId: string })[] = [];

  // Process member conversations
  for (const m of memberships) {
    const conv = m.conversation;
    if (conv.isArchived) continue;

    const unread = unreadByConvo[conv.id] || 0;

    const item: SidebarItem = {
      id: conv.id,
      type: conv.type,
      name: conv.name,
      icon: conv.icon,
      isPinnedTop: conv.isPinnedTop,
      isReadOnly: conv.isReadOnly,
      parentId: conv.parentId,
      unread,
    };

    if (conv.type === "DM") {
      dms.push(item);
    } else if (conv.isPinnedTop) {
      pinnedTop.push(item);
    } else if (conv.parentId) {
      pendingSubs.push({ ...item, parentId: conv.parentId });
    } else {
      level1.push({ ...item, subTopics: [] });
    }
  }

  // Process public groups (not already a member)
  for (const conv of publicGroups) {
    const item: SidebarItem = {
      id: conv.id,
      type: conv.type,
      name: conv.name,
      icon: conv.icon,
      isPinnedTop: conv.isPinnedTop,
      isReadOnly: conv.isReadOnly,
      parentId: conv.parentId,
      unread: 0,
    };

    if (conv.isPinnedTop) {
      pinnedTop.push(item);
    } else if (conv.parentId) {
      pendingSubs.push({ ...item, parentId: conv.parentId });
    } else {
      level1.push({ ...item, subTopics: [] });
    }
  }

  // grup sub-topics ke parent-nya
  for (const sub of pendingSubs) {
    const parent = level1.find((l) => l.id === sub.parentId);
    if (parent) {
      parent.subTopics = parent.subTopics || [];
      parent.subTopics.push(sub);
    } else {
      level1.push({ ...sub, isOrphanSub: true, subTopics: [] });
    }
  }

  // Fetch parent name/icon for orphan subs in one query
  const orphanParentIds = level1
    .filter((i) => i.isOrphanSub && i.parentId)
    .map((i) => i.parentId as string);
  if (orphanParentIds.length > 0) {
    const parents = await prisma.conversation.findMany({
      where: { id: { in: orphanParentIds } },
      select: { id: true, name: true, icon: true },
    });
    const parentMap = new Map(parents.map((p) => [p.id, p]));
    for (const item of level1) {
      if (item.isOrphanSub && item.parentId) {
        const p = parentMap.get(item.parentId);
        item.parentName = p?.name ?? null;
        item.parentIcon = p?.icon ?? null;
      }
    }
  }

  // Fetch lastMessageAt for all non-DM conversations in one query
  const topicIds = [
    ...pinnedTop.map((i) => i.id),
    ...level1.map((i) => i.id),
    ...level1.flatMap((i) => (i.subTopics || []).map((s) => s.id)),
  ];
  if (topicIds.length > 0) {
    const lastMsgs = await prisma.message.findMany({
      where: { conversationId: { in: topicIds }, isDeleted: false },
      orderBy: { createdAt: "desc" },
      distinct: ["conversationId"],
      select: {
        conversationId: true,
        createdAt: true,
        content: true,
        user: { select: { name: true } },
      },
    });
    const lastMsgMap: Record<string, { at: string; text: string | null; sender: string | null }> = {};
    for (const m of lastMsgs) {
      lastMsgMap[m.conversationId] = {
        at: m.createdAt.toISOString(),
        text: m.content,
        sender: m.user?.name ?? null,
      };
    }
    for (const item of [...pinnedTop, ...level1]) {
      item.lastMessageAt = lastMsgMap[item.id]?.at ?? null;
      item.lastMessageText = lastMsgMap[item.id]?.text ?? null;
      item.lastMessageSender = lastMsgMap[item.id]?.sender ?? null;
      for (const sub of item.subTopics || []) {
        sub.lastMessageAt = lastMsgMap[sub.id]?.at ?? null;
        sub.lastMessageText = lastMsgMap[sub.id]?.text ?? null;
        sub.lastMessageSender = lastMsgMap[sub.id]?.sender ?? null;
      }
    }
  }

  // Lengkapi DM: partner info + timestamp pesan terakhir, lalu urutkan (FR-4.2)
  if (dms.length > 0) {
    const dmIds = dms.map((d) => d.id);
    const dmConvos = await prisma.conversation.findMany({
      where: { id: { in: dmIds }, type: "DM" },
      include: {
        members: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
        messages: {
          where: { isDeleted: false },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            createdAt: true,
            content: true,
            user: { select: { name: true } },
            attachments: { select: { type: true }, take: 1 },
          },
        },
      },
    });
    for (const d of dms) {
      const conv = dmConvos.find((c) => c.id === d.id);
      const partner = conv?.members.find((mm) => mm.userId !== userId)?.user;
      d.name = partner?.name ?? d.name;
      d.icon = null;
      d.partnerId = partner?.id ?? null;
      d.partnerAvatarUrl = partner?.avatarUrl ?? null;
      d.lastMessageAt = conv?.messages[0]?.createdAt?.toISOString() ?? null;
      const msgContent = conv?.messages[0]?.content;
      const msgAttachment = (conv?.messages[0] as any)?.attachments?.[0];
      d.lastMessageText = msgContent ?? (msgAttachment ? (msgAttachment.type === "IMAGE" ? "📷 Gambar" : "📎 Lampiran") : null);
      d.lastMessageSender = conv?.messages[0]?.user?.name ?? null;
    }
    dms.sort((a, b) =>
      (b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0) -
      (a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0)
    );
  }

  return { pinnedTop, level1, dms };
}

// Cek membership + role user dalam conversation
export async function getMemberRole(conversationId: string, userId: string) {
  return prisma.conversationMember.findUnique({
    where: {
      conversationId_userId: { conversationId, userId },
    },
    select: { role: true, isMuted: true, mutedLevel: true },
  });
}

export function tupleRank(role: string) {
  return ROLE_RANK[role] ?? -1;
}