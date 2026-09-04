import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { getMemberRole } from "../services/conversations.js";
import { serializeMessage, forwardMessage } from "../services/messages.js";
import { json } from "../lib/json.js";

const EDIT_WINDOW_MINUTES = 15;

async function canEditOrDelete(userId: string, message: { userId: string }) {
  if (message.userId !== userId) return "admin";
  return "self";
}

export async function messageRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // GET /api/messages/:id — fetch a single message (used for thread card navigation)
  app.get("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const msg = await serializeMessage(id, req.user.id);
    if (!msg) return reply.code(404).send({ error: "Pesan tidak ditemukan" });
    const member = await getMemberRole(msg.conversationId, req.user.id);
    if (!member) return reply.code(403).send({ error: "Anda bukan member topic ini" });
    return msg;
  });

  app.patch("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { content?: string };
    const message = await prisma.message.findUnique({
      where: { id },
      select: { id: true, userId: true, conversationId: true, createdAt: true, content: true },
    });
    if (!message) {
      reply.code(404).send({ error: "Pesan tidak ditemukan" });
      return;
    }

    const who = await canEditOrDelete(req.user.id, message);
    const member = await getMemberRole(message.conversationId, req.user.id);
    if (!member) {
      reply.code(403).send({ error: "Anda bukan member topic ini" });
      return;
    }

    if (who === "self" && !(body.content as string | undefined)) {
      reply.code(400).send({ error: "konten kosong" });
      return;
    }
    if (!(typeof body.content === "string")) {
      reply.code(400).send({ error: "content wajib string" });
      return;
    }

    // FR-5.4: batas waktu 15 menit untuk edit/delete oleh pengirim biasa (admin bypass)
    if (who === "self") {
      const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { role: true } });
      const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
      if (!isAdmin) {
        const mins = (Date.now() - message.createdAt.getTime()) / 60000;
        if (mins > EDIT_WINDOW_MINUTES) {
          reply.code(403).send({
            error: `Batas ${EDIT_WINDOW_MINUTES} menit untuk edit/delete pesan telah lewat`,
          });
          return;
        }
      }
    }

    await prisma.message.update({
      where: { id },
      data: { content: body.content, isEdited: true },
    });

    const serialized = await serializeMessage(id, req.user.id);
    req.server.io.to(`convo:${message.conversationId}`).emit("message:edited", {
      conversationId: message.conversationId,
      message: serialized,
    });
    return serialized;
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const message = await prisma.message.findUnique({
      where: { id },
      select: { id: true, userId: true, conversationId: true, createdAt: true, parentId: true },
    });
    if (!message) {
      reply.code(404).send({ error: "Pesan tidak ditemukan" });
      return;
    }

    const who = await canEditOrDelete(req.user.id, message);
    const member = await getMemberRole(message.conversationId, req.user.id);
    if (!member) {
      reply.code(403).send({ error: "Anda bukan member topic ini" });
      return;
    }
    if (who === "admin") {
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
        reply.code(403).send({ error: "Tidak bisa hapus pesan orang lain" });
        return;
      }
      await prisma.auditLog.create({
        data: {
          userId: req.user.id,
          action: "MESSAGE_DELETE_BY_ADMIN",
          targetId: id,
          metadata: json({ conversationId: message.conversationId }),
        },
      });
    } else {
      const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { role: true } });
      const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN" || user?.role === "MANAGER";
      if (!isAdmin) {
        const mins = (Date.now() - message.createdAt.getTime()) / 60000;
        if (mins > EDIT_WINDOW_MINUTES) {
          reply.code(403).send({
            error: `Batas ${EDIT_WINDOW_MINUTES} menit untuk edit/delete pesan telah lewat`,
          });
          return;
        }
      }
    }

    await prisma.message.update({
      where: { id },
      data: { isDeleted: true, deletedById: who === "admin" ? req.user.id : null },
    });
    req.server.io.to(`convo:${message.conversationId}`).emit("message:removed", {
      conversationId: message.conversationId,
      messageId: id,
      isDeleted: true,
    });
    // If deleted message was a thread reply, update replyCount on parent
    if (message.parentId) {
      const parent = await prisma.message.findUnique({
        where: { id: message.parentId },
        select: { id: true, _count: { select: { replies: true } } },
      });
      if (parent) {
        const firstReplies = await prisma.message.findMany({
          where: { parentId: parent.id, isDeleted: false },
          orderBy: { createdAt: "asc" },
          select: { user: { select: { name: true } } },
        });
        const replyUsers: { name: string }[] = [];
        for (const r of firstReplies) {
          if (!replyUsers.some((u) => u.name === r.user.name) && replyUsers.length < 3) {
            replyUsers.push({ name: r.user.name });
          }
        }
        req.server.io.to(`convo:${message.conversationId}`).emit("thread:count", {
          messageId: parent.id,
          replyCount: parent._count.replies,
          replyUsers,
        });
      }
    }
    return { ok: true };
  });

  // Forward pesan ke conversation lain (in-app). Menyalin pesan+attachment ke tujuan.
  app.post("/:id/forward", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as {
      conversationId?: string;
      note?: string;
    };
    if (!body.conversationId) {
      reply.code(400).send({ error: "conversationId tujuan wajib diisi" });
      return;
    }
    // pastikan pengirim adalah member dari conversation sumber (bisa akses pesan asli)
    const source = await prisma.message.findUnique({
      where: { id },
      select: { conversationId: true },
    });
    if (!source) {
      reply.code(404).send({ error: "Pesan tidak ditemukan" });
      return;
    }
    const srcMember = await getMemberRole(source.conversationId, req.user.id);
    if (!srcMember) {
      reply.code(403).send({ error: "Anda bukan member pesan sumber" });
      return;
    }

    if (body.conversationId === source.conversationId) {
      reply.code(400).send({ error: "Tujuan forward tidak bisa sama dengan asal" });
      return;
    }

    try {
      const message = await forwardMessage({
        sourceMessageId: id,
        targetConversationId: body.conversationId,
        userId: req.user.id,
        note: body.note ?? null,
      });
      req.server.io.to(`convo:${body.conversationId}`).emit("message:new", { message });
      reply.code(201).send(message);
    } catch (err) {
      reply
        .code(400)
        .send({ error: err instanceof Error ? err.message : "gagal forward" });
    }
  });

  app.post("/:id/pin", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { note?: string; scope?: string };
    const scope = body.scope === "personal" ? "personal" : "group";
    const message = await prisma.message.findUnique({
      where: { id },
      select: { id: true, conversationId: true, userId: true },
    });
    if (!message) {
      reply.code(404).send({ error: "Pesan tidak ditemukan" });
      return;
    }
    const member = await getMemberRole(message.conversationId, req.user.id);
    if (!member) {
      reply.code(403).send({ error: "Anda bukan member topic ini" });
      return;
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const conv = await prisma.conversation.findUnique({
      where: { id: message.conversationId },
      select: { allowStaffPin: true },
    });
    const rank = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN" || user?.role === "MANAGER";
    if (scope === "group" && !rank && !(conv?.allowStaffPin ?? true)) {
      reply.code(403).send({ error: "Pin note tidak diizinkan untuk Staff di topic ini" });
      return;
    }

    const existing = await prisma.pinnedItem.findUnique({
      where: {
        conversationId_messageId_pinnedById_scope: {
          conversationId: message.conversationId,
          messageId: id,
          pinnedById: req.user.id,
          scope,
        },
      },
    });
    if (existing) {
      reply.send({ ok: true, alreadyPinned: true });
      return;
    }

    await prisma.pinnedItem.create({
      data: {
        conversationId: message.conversationId,
        messageId: id,
        pinnedById: req.user.id,
        note: (body.note as string) ?? null,
        scope,
      },
    });
    // Only broadcast group pins to all members
    if (scope === "group") {
      req.server.io.to(`convo:${message.conversationId}`).emit("pinned:added", {
        conversationId: message.conversationId,
        messageId: id,
        pinnedById: req.user.id,
      });
    }
    reply.code(201).send({ ok: true });
  });

  app.delete("/:id/pin", async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as { scope?: string };
    const scope = query.scope === "personal" ? "personal" : "group";
    const message = await prisma.message.findUnique({
      where: { id },
      select: { id: true, conversationId: true },
    });
    if (!message) {
      reply.code(404).send({ error: "Pesan tidak ditemukan" });
      return;
    }
    const member = await getMemberRole(message.conversationId, req.user.id);
    if (!member) {
      reply.code(403).send({ error: "Anda bukan member topic ini" });
      return;
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
    const pinned = await prisma.pinnedItem.findUnique({
      where: {
        conversationId_messageId_pinnedById_scope: {
          conversationId: message.conversationId,
          messageId: id,
          pinnedById: req.user.id,
          scope,
        },
      },
    });
    if (!pinned) {
      // Admin can unpin any group pin
      if (isAdmin && scope === "group") {
        const anyPin = await prisma.pinnedItem.findFirst({
          where: { messageId: id, conversationId: message.conversationId, scope: "group" },
        });
        if (anyPin) await prisma.pinnedItem.delete({ where: { id: anyPin.id } });
      }
    } else {
      await prisma.pinnedItem.delete({ where: { id: pinned.id } });
    }
    req.server.io.to(`convo:${message.conversationId}`).emit("pinned:removed", {
      conversationId: message.conversationId,
      messageId: id,
    });
    return { ok: true };
  });

  // reply/thread (FR-3.x) — get replies to a message
  app.get("/:id/replies", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parent = await prisma.message.findUnique({
      where: { id },
      select: { conversationId: true },
    });
    if (!parent) {
      reply.code(404).send({ error: "Pesan tidak ditemukan" });
      return;
    }
    const member = await getMemberRole(parent.conversationId, req.user.id);
    if (!member) {
      reply.code(403).send({ error: "Anda bukan member topic ini" });
      return;
    }
    const replies = await prisma.message.findMany({
      where: { parentId: id, isDeleted: false },
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
        attachments: true,
        reactions: { select: { emoji: true, userId: true } },
        _count: { select: { replies: { where: { isDeleted: false } } } },
      },
    });
    return { replies };
  });

  // DELETE /:id/thread — admin clears all replies in a thread
  app.delete("/:id/thread", async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { role: true } });
    const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
    if (!isAdmin) return reply.code(403).send({ error: "Hanya admin yang bisa hapus thread" });

    const parent = await prisma.message.findUnique({
      where: { id },
      select: { conversationId: true },
    });
    if (!parent) return reply.code(404).send({ error: "Pesan tidak ditemukan" });

    // Mark all replies as deleted
    const deleted = await prisma.message.updateMany({
      where: { parentId: id, isDeleted: false },
      data: { isDeleted: true, deletedById: req.user.id },
    });

    // Emit thread:count = 0 to conversation room
    req.server.io.to(`convo:${parent.conversationId}`).emit("thread:count", {
      messageId: id,
      replyCount: 0,
      replyUsers: [],
    });

    return { ok: true, deleted: deleted.count };
  });
}
