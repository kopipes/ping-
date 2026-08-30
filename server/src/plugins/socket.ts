import type { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { createMessage, editMessageById, deleteMessageById } from "../services/messages.js";
import { notifyConversationMembers } from "../services/push.js";

const ROOM_PREFIX = "convo:";
const USER_ROOM_PREFIX = "user:";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

function roomOf(conversationId: string) {
  return ROOM_PREFIX + conversationId;
}

function userRoomOf(userId: string) {
  return USER_ROOM_PREFIX + userId;
}

async function authenticateSocket(socket: Socket): Promise<string | null> {
  const token =
    (socket.handshake.auth?.token as string) ||
    (socket.handshake.query?.token as string);

  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { id: string };
    return payload.id;
  } catch {
    return null;
  }
}

function canMentionAtAll(userRole: string | undefined) {
  return userRole === "ADMIN" || userRole === "SUPER_ADMIN";
}

export async function handleSocketReaction(
  socket: Socket,
  action: "add" | "remove",
  data: { messageId: string; emoji: string }
) {
  if (!socket.userId || !data?.messageId || !data?.emoji) return;
  const message = await prisma.message.findUnique({ where: { id: data.messageId } });
  if (!message) return;

  const member = await prisma.conversationMember.findUnique({
    where: {
      conversationId_userId: {
        conversationId: message.conversationId,
        userId: socket.userId,
      },
    },
  });
  if (!member) return;

  if (action === "add") {
    await prisma.reaction.upsert({
      where: {
        messageId_userId_emoji: {
          messageId: message.id,
          userId: socket.userId,
          emoji: data.emoji,
        },
      },
      create: { messageId: message.id, userId: socket.userId, emoji: data.emoji },
      update: {},
    });
    socket.to(roomOf(message.conversationId)).emit("reaction:added", {
      messageId: message.id,
      userId: socket.userId,
      emoji: data.emoji,
    });
  } else {
    await prisma.reaction.deleteMany({
      where: {
        messageId: message.id,
        userId: socket.userId,
        emoji: data.emoji,
      },
    });
    socket.to(roomOf(message.conversationId)).emit("reaction:removed", {
      messageId: message.id,
      userId: socket.userId,
      emoji: data.emoji,
    });
  }
}

export function setupSocket(io: Server) {
  io.use(async (socket, next) => {
    const userId = await authenticateSocket(socket);
    if (!userId) return next(new Error("unauthorized"));
    socket.userId = userId;
    next();
  });

  io.on("connection", (socket) => {
    const userId = socket.userId!;

    // join user's personal room utk broadcast khusus user (multi-device sync)
    void socket.join(userRoomOf(userId));

    // === daftarkan handler SEMUANYA secara sinkron, tanpa await apa pun ===
    console.log(`[socket] user ${userId} connected, socketId=${socket.id}`);

    socket.on("join", (conversationId: string) => {
      if (typeof conversationId !== "string") return;
      void socket.join(roomOf(conversationId));
      console.log(`[socket] user ${userId} joined room convo:${conversationId}`);
    });

    socket.on("message:send", (data) => {
      // eslint-disable-next-line no-async-promise-executor
      void (async () => {
        try {
          if (!data?.conversationId) return;
          const message = await postMessage(userId, data);
          if (message) {
            // pastikan pengirim ada di room conversation utk menerima broadcast message:new
            void socket.join(roomOf(data.conversationId));
            // io.to (bukan socket.to) supaya pengirim sendiri juga terima — penting untuk
            // multi-device (laptop + mobile akun sama) dan reconcile optimistic message
            io.to(roomOf(data.conversationId)).emit("message:new", { message });
            const room = io.sockets.adapter.rooms.get(roomOf(data.conversationId));
            console.log(`[socket] message:new broadcast to room convo:${data.conversationId}, sockets in room: ${room?.size ?? 0}`);

            // Push notification ke member offline (fire-and-forget)
            void (async () => {
              try {
                const conversation = await prisma.conversation.findUnique({
                  where: { id: data.conversationId },
                  select: { name: true, type: true },
                });
                const sender = await prisma.user.findUnique({
                  where: { id: userId },
                  select: { name: true },
                });
                const convName =
                  conversation?.type === "DM"
                    ? (sender?.name ?? "Pesan Langsung") // DM: use sender name as title
                    : (conversation?.name || "Chat");
                await notifyConversationMembers({
                  conversationId: data.conversationId,
                  senderUserId: userId,
                  senderName: sender?.name ?? "Seseorang",
                  conversationName: convName,
                  messageContent: message.content ?? null,
                  hasAttachment:
                    Array.isArray(message.attachments) &&
                    message.attachments.length > 0,
                });
              } catch {
                // push gagal tidak boleh ganggu alur utama
              }
            })();
          }
        } catch {
          socket.emit("message:error", {
            conversationId: data?.conversationId,
            error: "gagal kirim pesan",
          });
        }
      })();
    });

    socket.on("message:edit", (data) => {
      void (async () => {
        try {
          if (!data?.messageId || !data?.content) return;
          const message = await editMessageById(userId, data.messageId, data.content);
          if (message) {
            io.to(roomOf(message.conversationId)).emit("message:edited", {
              conversationId: message.conversationId,
              message,
            });
          }
        } catch {
          socket.emit("message:error", { error: "gagal edit" });
        }
      })();
    });

    socket.on("message:delete", (data) => {
      void (async () => {
        try {
          if (!data?.messageId) return;
          const result = await deleteMessageById(userId, data.messageId);
          io.to(roomOf(result.conversationId)).emit("message:removed", {
            conversationId: result.conversationId,
            messageId: data.messageId,
            isDeleted: true,
          });
        } catch {
          socket.emit("message:error", { error: "gagal hapus" });
        }
      })();
    });

    socket.on("typing:start", (data) => {
      if (!data?.conversationId) return;
      void (async () => {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
        socket.to(roomOf(data.conversationId)).emit("typing:start", {
          conversationId: data.conversationId,
          userId,
          userName: user?.name ?? userId,
        });
      })();
    });

    socket.on("typing:stop", (data) => {
      if (!data?.conversationId) return;
      socket.to(roomOf(data.conversationId)).emit("typing:stop", {
        conversationId: data.conversationId,
        userId,
      });
    });

    socket.on("reaction:add", (data) => handleSocketReaction(socket, "add", data));
    socket.on("reaction:remove", (data) => handleSocketReaction(socket, "remove", data));

    socket.on("read:mark", (data) => {
      void (async () => {
        try {
          if (!data?.conversationId) return;
          await prisma.conversationMember.update({
            where: {
              conversationId_userId: {
                conversationId: data.conversationId,
                userId,
              },
            },
            data: { lastReadMessageAt: new Date() },
          });
          socket.to(roomOf(data.conversationId)).emit("read:updated", {
            conversationId: data.conversationId,
            userId,
            at: new Date().toISOString(),
          });
        } catch {
          /* ignore */
        }
      })();
    });

    socket.on("disconnect", async () => {
      // cek apakah masih ada socket lain utk user ini
      const remaining = io.sockets.adapter.rooms.get(userRoomOf(userId));
      if (!remaining || remaining.size === 0) {
        await prisma.user.update({
          where: { id: userId },
          data: { status: "offline", lastSeenAt: new Date() },
        });
        io.to(userRoomOf(userId)).emit("presence:update", {
          userId,
          status: "offline",
        });
      }
    });

    // === inisialisasi async (presence + join rooms membership) → background, agar tidak memblokir handler ===
    void (async () => {
      try {
        await prisma.user.update({ where: { id: userId }, data: { status: "online" } });
        socket.to(userRoomOf(userId)).emit("presence:update", { userId, status: "online" });

        const memberships = await prisma.conversationMember.findMany({
          where: { userId },
          select: { conversationId: true },
        });
        for (const m of memberships) {
          void socket.join(roomOf(m.conversationId));
        }
      } catch (err) {
        console.error("[socket] init error:", err);
      }
    })();
  });
}

// Fungsi bisnis yang dipakai socket
async function postMessage(
  userId: string,
  data: {
    conversationId: string;
    content?: string;
    attachments?: any[];
    parentId?: string;
  }
) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: data.conversationId },
  });
  if (!conversation) throw new Error("Conversation tidak ditemukan");

  const member = await prisma.conversationMember.findUnique({
    where: {
      conversationId_userId: { conversationId: data.conversationId, userId },
    },
  });
  if (!member) throw new Error("Anda bukan member topic ini");

  const user = await prisma.user.findUnique({ where: { id: userId } });

  // Announcement read-only (FR-2.6): hanya ADMIN/SUPER_ADMIN bisa posting
  if (conversation.isReadOnly && member.role !== "ADMIN" && user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
    throw new Error("Hanya Admin yang dapat mengirim di Announcement");
  }

  if (!data.content && !(Array.isArray(data.attachments) && data.attachments.length > 0)) {
    throw new Error("Pesan kosong");
  }

  const message = await createMessage({
    conversationId: data.conversationId,
    userId,
    content: data.content ?? null,
    parentId: data.parentId ? String(data.parentId) : null,
    attachments: Array.isArray(data.attachments) ? data.attachments : [],
  });
  return message;
}