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

    // Cache user name to avoid DB query on every typing:start event
    let cachedUserName: string = userId;
    prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
      .then((u) => { if (u) cachedUserName = u.name; })
      .catch(() => {});

    // === daftarkan handler SEMUANYA secara sinkron, tanpa await apa pun ===

    // C-2: verify membership before allowing join to prevent unauthorized room access
    socket.on("join", (conversationId: string) => {
      if (typeof conversationId !== "string") return;
      void (async () => {
        const member = await prisma.conversationMember.findUnique({
          where: { conversationId_userId: { conversationId, userId } },
          select: { conversationId: true },
        });
        if (!member) return; // not a member — silently ignore
        void socket.join(roomOf(conversationId));
      })();
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
            // io.to supaya pengirim sendiri juga terima (multi-device reconcile)
            io.to(roomOf(data.conversationId)).emit("message:new", { message });

            // If this is a thread reply, emit thread:reply to the thread room
            // and update replyCount on the parent message in the conversation room
            if (message.parentId) {
              io.to(`thread:${message.parentId}`).emit("thread:reply", { message });
              // Get updated replyCount + replyUsers for parent
              const parent = await prisma.message.findUnique({
                where: { id: message.parentId },
                select: { id: true, _count: { select: { replies: { where: { isDeleted: false } } } } },
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
                io.to(roomOf(data.conversationId)).emit("thread:count", {
                  messageId: parent.id,
                  replyCount: parent._count.replies,
                  replyUsers,
                });
              }
            }

            // H-2: only send to user room for members NOT already in the conversation room
            // (avoids duplicate message:new for users who joined the room)
            const convoRoom = io.sockets.adapter.rooms.get(roomOf(data.conversationId));
            const members = await prisma.conversationMember.findMany({
              where: { conversationId: data.conversationId },
              select: { userId: true },
            });
            for (const m of members) {
              if (m.userId === userId) continue;
              const userSockets = io.sockets.adapter.rooms.get(userRoomOf(m.userId));
              if (!userSockets) continue;
              // Check if any of this user's sockets are already in the convo room
              const alreadyInRoom = convoRoom && [...userSockets].some((sid) => convoRoom.has(sid));
              if (!alreadyInRoom) {
                io.to(userRoomOf(m.userId)).emit("message:new", { message });
              }
            }

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

    // Thread room join/leave
    socket.on("join:thread", (data: { threadId: string }) => {
      if (data?.threadId) void socket.join(`thread:${data.threadId}`);
    });
    socket.on("leave:thread", (data: { threadId: string }) => {
      if (data?.threadId) void socket.leave(`thread:${data.threadId}`);
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
      // H-9: use cached name — no DB query per keystroke
      socket.to(roomOf(data.conversationId)).emit("typing:start", {
        conversationId: data.conversationId,
        userId,
        userName: cachedUserName,
      });
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
      // C-3: Count remaining sockets for this user by checking all connected sockets
      // (userRoom check is unreliable at disconnect time as socket may have already left)
      const allSockets = await io.fetchSockets();
      const remainingForUser = allSockets.filter((s) =>
        s.id !== socket.id && s.rooms.has(userRoomOf(userId))
      );
      if (remainingForUser.length === 0) {
        await prisma.user.update({
          where: { id: userId },
          data: { status: "offline", lastSeenAt: new Date() },
        });
        io.to(userRoomOf(userId)).emit("presence:update", { userId, status: "offline" });
        // Notify DM partners in their conversation rooms
        const dmMemberships = await prisma.conversationMember.findMany({
          where: { userId, conversation: { type: "DM" } },
          select: { conversationId: true },
        });
        for (const m of dmMemberships) {
          io.to(roomOf(m.conversationId)).emit("presence:update", { userId, status: "offline" });
        }
      }
    });

    // === inisialisasi async (presence + join rooms membership) → background, agar tidak memblokir handler ===
    void (async () => {
      try {
        await prisma.user.update({ where: { id: userId }, data: { status: "online" } });
        socket.to(userRoomOf(userId)).emit("presence:update", { userId, status: "online" });

        // Notify DM partners in their conversation rooms
        const dmMemberships = await prisma.conversationMember.findMany({
          where: { userId, conversation: { type: "DM" } },
          select: { conversationId: true },
        });
        for (const m of dmMemberships) {
          socket.to(roomOf(m.conversationId)).emit("presence:update", { userId, status: "online" });
        }

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

  let member = await prisma.conversationMember.findUnique({
    where: {
      conversationId_userId: { conversationId: data.conversationId, userId },
    },
  });

  // Auto-join public groups when user sends their first message
  if (!member && conversation.isPublic) {
    member = await prisma.conversationMember.create({
      data: { conversationId: data.conversationId, userId, role: "STAFF" },
    });
  }

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