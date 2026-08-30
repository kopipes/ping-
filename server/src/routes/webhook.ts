/**
 * Webhook API — allows external apps to send notifications into Ping!
 *
 * Authentication: Bearer token in Authorization header
 *   Authorization: Bearer <WEBHOOK_SECRET>
 *
 * POST /api/webhook/notify
 * {
 *   // Target — one of:
 *   "conversationId": "clxxx...",           // direct conversation ID
 *   "channelName": "general",               // find channel by name (first match)
 *   "userEmail": "sari@pvc.local",          // send DM to this user
 *
 *   // Message
 *   "text": "New project submitted",        // required — message body
 *   "title": "ProjectApp",                  // optional bold header line
 *   "source": "ProjectApp",                 // optional — shown as sender suffix
 * }
 *
 * POST /api/webhook/channels
 * Returns list of all non-DM conversations (id, name, type) for discovery.
 */

import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { createMessage } from "../services/messages.js";

const BOT_EMAIL = "pingbot@system.local";

function roomOf(conversationId: string) {
  return "convo:" + conversationId;
}

function userRoomOf(userId: string) {
  return "user:" + userId;
}

async function getBotUser() {
  // Find or create the system bot user
  let bot = await prisma.user.findUnique({ where: { email: BOT_EMAIL } });
  if (!bot) {
    bot = await prisma.user.create({
      data: {
        name: "Ping! Bot",
        email: BOT_EMAIL,
        passwordHash: "SYSTEM_NO_LOGIN",
        role: "STAFF",
        status: "online",
      },
    });
  }
  return bot;
}

function requireWebhookAuth(req: any, reply: any): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    reply.code(503).send({ error: "Webhook not configured on this server" });
    return false;
  }
  const auth = req.headers["authorization"] || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (token !== secret) {
    reply.code(401).send({ error: "Invalid webhook token" });
    return false;
  }
  return true;
}

export async function webhookRoutes(app: FastifyInstance) {
  // List all channels (for discovery by external apps)
  app.get("/channels", async (req, reply) => {
    if (!requireWebhookAuth(req, reply)) return;
    const convos = await prisma.conversation.findMany({
      where: { type: "TOPIC", isArchived: false },
      select: {
        id: true,
        name: true,
        type: true,
        parentId: true,
        isPinnedTop: true,
        isPublic: true,
      },
      orderBy: { name: "asc" },
    });
    return { channels: convos };
  });

  // Send a notification
  app.post("/notify", async (req, reply) => {
    if (!requireWebhookAuth(req, reply)) return;

    const body = (req.body ?? {}) as {
      conversationId?: string;
      channelName?: string;
      userEmail?: string;
      text?: string;
      title?: string;
      source?: string;
    };

    if (!body.text?.trim()) {
      reply.code(400).send({ error: "text is required" });
      return;
    }

    const bot = await getBotUser();

    let conversationId: string | null = null;

    // Resolve target
    if (body.conversationId) {
      // Direct conversation ID
      const conv = await prisma.conversation.findUnique({
        where: { id: body.conversationId },
        select: { id: true, isReadOnly: true },
      });
      if (!conv) {
        reply.code(404).send({ error: "Conversation not found" });
        return;
      }
      conversationId = conv.id;

    } else if (body.channelName) {
      // Find channel by name (case-insensitive via JS filter)
      const convos = await prisma.conversation.findMany({
        where: { type: "TOPIC", isArchived: false },
        select: { id: true, name: true },
      });
      const conv = convos.find(
        (c) => (c.name || "").toLowerCase() === body.channelName!.toLowerCase()
      );
      if (!conv) {
        reply.code(404).send({ error: `Channel "${body.channelName}" not found` });
        return;
      }
      conversationId = conv.id;

    } else if (body.userEmail) {
      // Find or create DM with this user
      const targetUser = await prisma.user.findUnique({
        where: { email: body.userEmail.toLowerCase() },
        select: { id: true, name: true },
      });
      if (!targetUser) {
        reply.code(404).send({ error: `User "${body.userEmail}" not found` });
        return;
      }

      // Look for existing DM between bot and target user
      const existingDM = await prisma.conversation.findFirst({
        where: {
          type: "DM",
          members: { some: { userId: bot.id } },
          AND: [{ members: { some: { userId: targetUser.id } } }],
        },
        select: { id: true },
      });

      if (existingDM) {
        conversationId = existingDM.id;
      } else {
        // Create new DM
        const dm = await prisma.conversation.create({
          data: {
            type: "DM",
            members: {
              create: [
                { userId: bot.id },
                { userId: targetUser.id },
              ],
            },
          },
        });
        conversationId = dm.id;
      }
    } else {
      reply.code(400).send({ error: "Provide conversationId, channelName, or userEmail" });
      return;
    }

    // Ensure bot is a member of the conversation
    await prisma.conversationMember.upsert({
      where: { conversationId_userId: { conversationId, userId: bot.id } },
      create: { conversationId, userId: bot.id, role: "STAFF" },
      update: {},
    });

    // Build message content
    const parts: string[] = [];
    if (body.title) parts.push(`**${body.title}**`);
    parts.push(body.text.trim());
    if (body.source) parts.push(`\n_— ${body.source}_`);
    const content = parts.join("\n");

    // Create message and broadcast via Socket.IO
    const message = await createMessage({
      conversationId,
      userId: bot.id,
      content,
      parentId: null,
      attachments: [],
    });

    if (!message) {
      reply.code(500).send({ error: "Failed to create message" });
      return;
    }

    // Broadcast via Socket.IO if available
    // Also emit to each member's personal user room so recipients get it
    // even if they haven't joined the conversation room yet (e.g. first DM from bot)
    const io = (app as any).io;
    if (io) {
      io.to(roomOf(conversationId)).emit("message:new", { message });
      const members = await prisma.conversationMember.findMany({
        where: { conversationId },
        select: { userId: true },
      });
      for (const m of members) {
        if (m.userId !== bot.id) {
          io.to(userRoomOf(m.userId)).emit("message:new", { message });
        }
      }
    }

    reply.code(201).send({
      ok: true,
      messageId: message.id,
      conversationId,
    });
  });
}
