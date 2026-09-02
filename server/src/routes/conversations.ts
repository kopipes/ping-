import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../plugins/auth.js";
import {
  getSidebar,
  canCreateLevel1,
  canCreateSubTopic,
  getMemberRole,
  tupleRank,
} from "../services/conversations.js";
import { createMessage } from "../services/messages.js";
import { SYSTEM_ANNOUNCEMENT_NAME, SYSTEM_GENERAL_NAME } from "../lib/constants.js";
import { json } from "../lib/json.js";

export async function conversationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // List sidebar (FR-5.9-aware grouping)
  app.get("/", async (req) => {
    const sidebar = await getSidebar(req.user.id);
    return sidebar;
  });

  // Detail satu conversation (termasuk member)
  app.get("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const member = await getMemberRole(id, req.user.id);
    // Allow non-members to view public conversations
    if (!member) {
      const conv = await prisma.conversation.findUnique({
        where: { id },
        select: { isPublic: true },
      });
      if (!conv?.isPublic) {
        reply.code(403).send({ error: "Anda bukan member topic ini" });
        return;
      }
    }
    const conv = await prisma.conversation.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        members: {
          include: {
            user: {
              select: {
                id: true, name: true, avatarUrl: true, status: true, lastSeenAt: true, role: true,
              },
            },
          },
        },
        subTopics: {
          where: { isArchived: false },
          select: { id: true, name: true, icon: true, isReadOnly: true },
        },
      },
    });
    if (!conv) {
      reply.code(404).send({ error: "Conversation tidak ditemukan" });
      return;
    }
    // hilangkan info member utk DM (privasi pasangan disertakan saja)
    return conv;
  });

  // Buat Topic Level 1 (Admin ke atas) atau Sub-topic (Admin / Manager pada divisinya)
  app.post("/", async (req, reply) => {
    const body = (req.body ?? {}) as {
      name?: string;
      description?: string;
      icon?: string;
      parentId?: string | null;
      type?: string;
      allowStaffPin?: boolean;
    };

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const role = user?.role ?? "STAFF";
    const isDMRequest = body.type === "DM";

    // --- DM find-or-create (FR-4.1) ---
    if (isDMRequest) {
      const targetUserId = body.parentId as string;
      if (!targetUserId) {
        reply.code(400).send({ error: "target userId wajib untuk DM" });
        return;
      }
      const existing = await prisma.conversation.findFirst({
        where: {
          type: "DM",
          isArchived: false,
          members: {
            every: { userId: { in: [req.user.id, targetUserId] } },
          },
        },
        include: { members: true },
      });
      if (
        existing &&
        existing.members.length === 2 &&
        existing.members.some((m) => m.userId === req.user.id) &&
        existing.members.some((m) => m.userId === targetUserId)
      ) {
        return { conversationId: existing.id, created: false };
      }

      const conversation = await prisma.conversation.create({
        data: { type: "DM" },
      });
      await prisma.conversationMember.createMany({
        data: [
          { conversationId: conversation.id, userId: req.user.id, role: "STAFF" },
          { conversationId: conversation.id, userId: targetUserId, role: "STAFF" },
        ],
      });
      return { conversationId: conversation.id, created: true };
    }

    // --- Buat Topic ---
    if (!body.name) {
      reply.code(400).send({ error: "nama topic wajib diisi" });
      return;
    }

    const isSubTopic = !!body.parentId;

    if (isSubTopic) {
      const allowed = await canCreateSubTopic(role, req.user.id, body.parentId!);
      if (!allowed) {
        reply.code(403).send({ error: "Tidak punya izin buat sub-topic di sini" });
        return;
      }
    } else {
      if (!canCreateLevel1(role)) {
        reply.code(403).send({ error: "Hanya Manager ke atas yang dapat membuat Group baru" });
        return;
      }
    }

    const conversation = await prisma.conversation.create({
      data: {
        type: "TOPIC",
        name: body.name.trim(),
        description: body.description ?? null,
        icon: body.icon ?? "📁",
        parentId: isSubTopic ? body.parentId : null,
        ownerId: req.user.id,
        allowStaffPin: body.allowStaffPin ?? true,
        isArchived: false,
      },
    });

    // creator otomatis jadi member (owner)
    await prisma.conversationMember.create({
      data: { conversationId: conversation.id, userId: req.user.id, role: "MANAGER" },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: isSubTopic ? "SUBTOPIC_CREATE" : "TOPIC_CREATE",
        targetId: conversation.id,
        metadata: json({ name: conversation.name, parentId: body.parentId ?? null }),
      },
    });

    reply.code(201).send({ conversationId: conversation.id });
  });

  // Pesan pagination (FR-5.8)
  app.get("/:id/messages", async (req, reply) => {
    const { id } = req.params as { id: string };
    const member = await getMemberRole(id, req.user.id);
    if (!member) {
      reply.code(403).send({ error: "Anda bukan member topic ini" });
      return;
    }
    const query = req.query as { cursor?: string; limit?: string; includeArchived?: string };
    const limit = Math.min(Math.max(Number(query.limit) || 30, 1), 100);

    const messages = await prisma.message.findMany({
      where: {
        conversationId: id,
        isArchived: query.includeArchived === "true" ? undefined : false,
        isDeleted: false,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      ...(query.cursor
        ? { skip: 1, cursor: { id: query.cursor } }
        : {}),
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
        attachments: true,
        reactions: { select: { emoji: true, userId: true } },
        _count: { select: { replies: true } },
      },
    });

    const nextCursor = messages.length === limit ? messages[messages.length - 1].id : null;
    return {
      messages: messages.reverse(),
      nextCursor: messages.length === 0 ? null : messages[0].id,
      prevCursor: nextCursor,
    };
  });

  // Kirim pesan via REST (fallback; utama via Socket)
  app.post("/:id/messages", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as {
      content?: string;
      parentId?: string | null;
      attachments?: any[];
    };
    const member = await getMemberRole(id, req.user.id);
    if (!member) {
      reply.code(403).send({ error: "Anda bukan member topic ini" });
      return;
    }
    const conv = await prisma.conversation.findUnique({
      where: { id },
      select: { isReadOnly: true },
    });
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    if (conv?.isReadOnly && user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      reply.code(403).send({ error: "Hanya Admin yang dapat mengirim di Announcement" });
      return;
    }

    if (!body.content && !(body.attachments && body.attachments.length > 0)) {
      reply.code(400).send({ error: "Pesan kosong" });
      return;
    }

    const message = await createMessage({
      conversationId: id,
      userId: req.user.id,
      content: body.content ?? null,
      parentId: body.parentId ?? null,
      attachments: body.attachments ?? [],
    });
    req.server.io.to(`convo:${id}`).emit("message:new", { message });
    reply.code(201).send(message);
  });

  // Pinned items (FR-7.x)
  app.get("/:id/pinned", async (req, reply) => {
    const { id } = req.params as { id: string };
    const member = await getMemberRole(id, req.user.id);
    if (!member) {
      reply.code(403).send({ error: "Anda bukan member topic ini" });
      return;
    }
    const pinned = await prisma.pinnedItem.findMany({
      where: { conversationId: id },
      orderBy: { pinnedAt: "desc" },
      include: {
        message: {
          include: {
            user: { select: { id: true, name: true, avatarUrl: true } },
            attachments: true,
            reactions: { select: { emoji: true, userId: true } },
          },
        },
        pinnedBy: { select: { id: true, name: true } },
      },
    });
    return pinned;
  });

  // Library (FR-8.x)
  app.get("/:id/library", async (req, reply) => {
    const { id } = req.params as { id: string };
    const member = await getMemberRole(id, req.user.id);
    if (!member) {
      reply.code(403).send({ error: "Anda bukan member topic ini" });
      return;
    }
    const query = req.query as { type?: string };
    const attachments = await prisma.attachment.findMany({
      where: {
        message: { conversationId: id, isDeleted: false, isArchived: false },
        ...(query.type && query.type !== "ALL" ? { type: query.type as any } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        message: {
          select: { id: true, conversationId: true, createdAt: true, userId: true },
        },
      },
    });
    return attachments;
  });

  // Pesan terarsip (FR-12.3) — bisa terlihat & restore oleh Admin
  app.get("/:id/archived-messages", async (req, reply) => {
    const { id } = req.params as { id: string };
    const member = await getMemberRole(id, req.user.id);
    if (!member) {
      reply.code(403).send({ error: "Anda bukan member topic ini" });
      return;
    }
    const cursor = (req.query as { cursor?: string }).cursor;
    const messages = await prisma.message.findMany({
      where: { conversationId: id, isArchived: true, isDeleted: false },
      orderBy: { createdAt: "desc" },
      take: 50,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
        attachments: true,
        reactions: { select: { emoji: true, userId: true } },
      },
    });
    return { messages };
  });

  // Kelola member (FR-2.4, FR-2.3) — tambah/hapus member
  app.post("/:id/members", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { userId?: string; role?: string };
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const conv = await prisma.conversation.findUnique({
      where: { id },
      select: { ownerId: true, parentId: true, isPinnedTop: true, name: true },
    });
    if (!conv) {
      reply.code(404).send({ error: "Conversation tidak ditemukan" });
      return;
    }
    // izin: SUPER_ADMIN/ADMIN bisa semua; MANAGER hanya sbg owner topic-nya
    if (user?.role !== "SUPER_ADMIN" && user?.role !== "ADMIN") {
      if (conv.ownerId !== req.user.id) {
        reply.code(403).send({ error: "Tidak punya izin kelola member" });
        return;
      }
    }
    if (!body.userId) {
      reply.code(400).send({ error: "userId wajib" });
      return;
    }
    const role = ["SUPER_ADMIN", "ADMIN", "MANAGER", "STAFF"].includes(body.role || "")
      ? (body.role as any)
      : "STAFF";

    const existing = await getMemberRole(id, body.userId);
    if (existing) {
      reply.code(409).send({ error: "User sudah jadi member" });
      return;
    }

    await prisma.conversationMember.create({
      data: { conversationId: id, userId: body.userId, role },
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: "MEMBER_ADD",
        targetId: id,
        metadata: json({ userId: body.userId, role, conversationName: conv.name }),
      },
    });
    reply.code(201).send({ ok: true });
  });

  app.delete("/:id/members/:userId", async (req, reply) => {
    const { id, userId } = req.params as { id: string; userId: string };
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const conv = await prisma.conversation.findUnique({
      where: { id },
      select: { ownerId: true, isPinnedTop: true },
    });
    if (!conv) {
      reply.code(404).send({ error: "Conversation tidak ditemukan" });
      return;
    }
    const isAdmin = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN";
    const isOwner = conv.ownerId === req.user.id;
    if (!isAdmin && !isOwner) {
      reply.code(403).send({ error: "Tidak punya izin" });
      return;
    }
    await prisma.conversationMember.deleteMany({
      where: { conversationId: id, userId },
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: "MEMBER_REMOVE",
        targetId: id,
        metadata: json({ userId }),
      },
    });
    reply.send({ ok: true });
  });

  // Update member role in conversation (MANAGER=group admin, STAFF=member)
  app.patch("/:id/members/:userId/role", async (req, reply) => {
    const { id, userId } = req.params as { id: string; userId: string };
    const { role } = (req.body ?? {}) as { role?: string };
    if (!role || !["MANAGER", "STAFF"].includes(role)) {
      reply.code(400).send({ error: "Role harus MANAGER atau STAFF" });
      return;
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const conv = await prisma.conversation.findUnique({
      where: { id },
      select: { ownerId: true },
    });
    if (!conv) {
      reply.code(404).send({ error: "Conversation tidak ditemukan" });
      return;
    }
    const isAdmin = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN";
    const isOwner = conv.ownerId === req.user.id;
    // Check if requester is group admin (MANAGER role in this conversation)
    const requesterMember = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: id, userId: req.user.id } },
    });
    const isGroupAdmin = requesterMember?.role === "MANAGER";
    if (!isAdmin && !isOwner && !isGroupAdmin) {
      reply.code(403).send({ error: "Tidak punya izin mengubah role member" });
      return;
    }
    await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId: id, userId } },
      data: { role },
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: "MEMBER_ROLE_UPDATE",
        targetId: id,
        metadata: json({ userId, role }),
      },
    });
    reply.send({ ok: true });
  });

  // Archive / un-archive (FR-2.7)
  app.patch("/:id/archive", async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const conv = await prisma.conversation.findUnique({
      where: { id },
      select: { ownerId: true, parentId: true, type: true, name: true },
    });
    if (!conv) {
      reply.code(404).send({ error: "Conversation tidak ditemukan" });
      return;
    }
    if (conv.type === "DM") {
      reply.code(400).send({ error: "DM tidak bisa di-archive di sisi ini" });
      return;
    }
    const isAdmin = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN";
    const isOwner = conv.ownerId === req.user.id;
    const isSubTopic = !!conv.parentId;
    // Check if user is MANAGER in parent group
    let isParentManager = false;
    if (isSubTopic && conv.parentId) {
      const parentMembership = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId: conv.parentId, userId: req.user.id } },
        select: { role: true },
      });
      isParentManager = parentMembership?.role === "MANAGER" || parentMembership?.role === "ADMIN";
    }
    const canArchiveSub = isSubTopic && (isOwner || isParentManager);
    if (!isAdmin && !canArchiveSub && !isOwner) {
      reply.code(403).send({ error: "Tidak punya izin archive topic" });
      return;
    }
    const isArchived = (req.body as { archived?: boolean })?.archived ?? true;
    await prisma.conversation.update({
      where: { id },
      data: { isArchived: isArchived },
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: isArchived ? "TOPIC_ARCHIVE" : "TOPIC_UNARCHIVE",
        targetId: id,
        metadata: json({ name: conv.name }),
      },
    });
    reply.send({ ok: true });
  });

  // Update setting per-topic (name, description, icon, allowStaffPin)
  app.patch("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as {
      allowStaffPin?: boolean;
      name?: string;
      description?: string;
      icon?: string;
      isPublic?: boolean;
      allowGuestPost?: boolean;
    };
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const conv = await prisma.conversation.findUnique({
      where: { id },
      select: { ownerId: true, type: true },
    });
    if (!conv) {
      reply.code(404).send({ error: "Conversation tidak ditemukan" });
      return;
    }
    if (conv.type === "DM") {
      reply.code(400).send({ error: "DM tidak bisa diedit" });
      return;
    }
    const isAdmin = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN";
    if (!isAdmin && conv.ownerId !== req.user.id) {
      reply.code(403).send({ error: "Tidak punya izin" });
      return;
    }
    const data: any = {};
    if (typeof body.allowStaffPin === "boolean") data.allowStaffPin = body.allowStaffPin;
    if (body.name?.trim()) data.name = body.name.trim();
    if (body.description !== undefined) data.description = body.description?.trim() || null;
    if (body.icon?.trim()) data.icon = body.icon.trim();
    if (typeof body.isPublic === "boolean") data.isPublic = body.isPublic;
    if (typeof body.allowGuestPost === "boolean") data.allowGuestPost = body.allowGuestPost;
    const updated = await prisma.conversation.update({ where: { id }, data });
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: "TOPIC_EDIT",
        targetId: id,
        metadata: json({ name: updated.name }),
      },
    });
    return { ok: true, name: updated.name, description: updated.description, icon: updated.icon, allowStaffPin: updated.allowStaffPin };
  });

  // Delete DM — only allowed when the other user no longer exists (account deleted)
  app.delete("/:id/dm", async (req, reply) => {
    const { id } = req.params as { id: string };
    const conv = await prisma.conversation.findUnique({
      where: { id },
      select: { type: true, members: { select: { userId: true } } },
    });
    if (!conv) {
      reply.code(404).send({ error: "Conversation tidak ditemukan" });
      return;
    }
    if (conv.type !== "DM") {
      reply.code(400).send({ error: "Endpoint ini hanya untuk DM" });
      return;
    }
    const isMember = conv.members.some((m) => m.userId === req.user.id);
    if (!isMember) {
      reply.code(403).send({ error: "Anda bukan member DM ini" });
      return;
    }
    // Only allow deletion when the other member's account is gone.
    // When a user is deleted, their ConversationMember rows are removed,
    // so a DM with only 1 remaining member means the partner no longer exists.
    if (conv.members.length !== 1) {
      reply.code(400).send({ error: "DM hanya bisa dihapus jika pengguna lain sudah tidak ada" });
      return;
    }
    // Delete all related data in order
    await prisma.reaction.deleteMany({ where: { message: { conversationId: id } } });
    await prisma.attachment.deleteMany({ where: { message: { conversationId: id } } });
    await prisma.message.deleteMany({ where: { conversationId: id } });
    await prisma.pinnedItem.deleteMany({ where: { conversationId: id } });
    await prisma.conversationMember.deleteMany({ where: { conversationId: id } });
    await prisma.conversation.delete({ where: { id } });
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: "CONVERSATION_DELETE",
        targetId: id,
        metadata: json({ type: "DM", reason: "other_user_deleted" }),
      },
    });
    reply.send({ ok: true });
  });

  // Delete conversation (channel/DM) — admin only
  app.delete("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (user?.role !== "SUPER_ADMIN" && user?.role !== "ADMIN") {
      reply.code(403).send({ error: "Hanya Admin yang bisa menghapus channel" });
      return;
    }
    const conv = await prisma.conversation.findUnique({
      where: { id },
      select: { name: true, type: true, isPinnedTop: true },
    });
    if (!conv) {
      reply.code(404).send({ error: "Conversation tidak ditemukan" });
      return;
    }
    if (conv.isPinnedTop) {
      reply.code(400).send({ error: "Channel sistem tidak bisa dihapus" });
      return;
    }
    // Delete all related data in order
    await prisma.reaction.deleteMany({ where: { message: { conversationId: id } } });
    await prisma.attachment.deleteMany({ where: { message: { conversationId: id } } });
    await prisma.message.deleteMany({ where: { conversationId: id } });
    await prisma.pinnedItem.deleteMany({ where: { conversationId: id } });
    await prisma.conversationMember.deleteMany({ where: { conversationId: id } });
    // Delete sub-topics first
    const subs = await prisma.conversation.findMany({ where: { parentId: id }, select: { id: true } });
    for (const sub of subs) {
      await prisma.reaction.deleteMany({ where: { message: { conversationId: sub.id } } });
      await prisma.attachment.deleteMany({ where: { message: { conversationId: sub.id } } });
      await prisma.message.deleteMany({ where: { conversationId: sub.id } });
      await prisma.pinnedItem.deleteMany({ where: { conversationId: sub.id } });
      await prisma.conversationMember.deleteMany({ where: { conversationId: sub.id } });
      await prisma.conversation.delete({ where: { id: sub.id } });
    }
    await prisma.conversation.delete({ where: { id } });
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: "CONVERSATION_DELETE",
        targetId: id,
        metadata: json({ name: conv.name, type: conv.type }),
      },
    });
    reply.send({ ok: true });
  });

  // Periksa izin relatif untuk UI
  app.get("/:id/permissions", async (req, reply) => {
    const { id } = req.params as { id: string };
    const member = await getMemberRole(id, req.user.id);
    if (!member) {
      // Allow non-members to get permissions for public groups
      const conv = await prisma.conversation.findUnique({
        where: { id },
        select: { isPublic: true },
      });
      if (!conv?.isPublic) {
        reply.code(403).send({ error: "Anda bukan member topic ini" });
        return;
      }
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const conv = await prisma.conversation.findUnique({
      where: { id },
      select: {
        ownerId: true, parentId: true, allowStaffPin: true, isReadOnly: true, name: true, icon: true, type: true,
        allowGuestPost: true,
        members: { select: { userId: true } },
      },
    });
    const roleRank = tupleRank(user?.role ?? "STAFF");
    const isMember = !!member;
    // canDeleteDM: DM where the other user's account is gone (only 1 member remains)
    const canDeleteDM = conv?.type === "DM" && (conv?.members?.length ?? 0) === 1;
    // canPost: member can post unless isReadOnly; non-member can only post if allowGuestPost=true
    const canPost = isMember
      ? !(conv?.isReadOnly && roleRank < 2)
      : (conv?.allowGuestPost === true && !conv?.isReadOnly);
    return {
      isSuperAdmin: roleRank >= 3,
      isAdmin: roleRank >= 2,
      isManagerOrAbove: roleRank >= 1,
      isOwner: conv?.ownerId === req.user.id,
      canPost,
      canCreateLevel1: roleRank >= 2,
      canManageMembers: roleRank >= 2 || conv?.ownerId === req.user.id,
      canStaffPin: conv?.allowStaffPin ?? true,
      isSystemTopic: conv?.name === SYSTEM_ANNOUNCEMENT_NAME || conv?.name === SYSTEM_GENERAL_NAME,
      canDeleteDM,
      allowGuestPost: conv?.allowGuestPost ?? false,
    };
  });
}