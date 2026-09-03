import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { saveUpload } from "../services/upload.js";
import { notifyConversationMembers } from "../services/push.js";

const POLL_INCLUDE = {
  createdBy: { select: { id: true, name: true, avatarUrl: true } },
  options: {
    orderBy: { order: "asc" as const },
    include: {
      votes: { select: { userId: true, user: { select: { name: true } } } },
    },
  },
  votes: { select: { userId: true, optionId: true } },
};

function serializePoll(poll: any, viewerId: string) {
  const totalVotes = poll.votes.length;
  const myVotes = poll.votes.filter((v: any) => v.userId === viewerId).map((v: any) => v.optionId);
  return {
    id: poll.id,
    conversationId: poll.conversationId,
    question: poll.question,
    isMultiVote: poll.isMultiVote,
    isClosed: poll.isClosed,
    closedAt: poll.closedAt,
    createdAt: poll.createdAt,
    createdBy: poll.createdBy,
    totalVotes,
    myVotes,
    options: poll.options.map((opt: any) => ({
      id: opt.id,
      text: opt.text,
      imageUrl: opt.imageUrl,
      order: opt.order,
      voteCount: opt.votes.length,
      voters: opt.votes.map((v: any) => v.user.name),
    })),
  };
}

export async function pollRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // GET /api/polls/:conversationId — list polls for a conversation
  app.get("/:conversationId", async (req, reply) => {
    const { conversationId } = req.params as { conversationId: string };
    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: req.user.id } },
    });
    if (!member) return reply.code(403).send({ error: "Bukan member" });

    const polls = await prisma.poll.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      include: POLL_INCLUDE,
    });
    return polls.map((p) => serializePoll(p, req.user.id));
  });

  // GET /api/polls/item/:pollId — get single poll
  app.get("/item/:pollId", async (req, reply) => {
    const { pollId } = req.params as { pollId: string };
    const poll = await prisma.poll.findUnique({ where: { id: pollId }, include: POLL_INCLUDE });
    if (!poll) return reply.code(404).send({ error: "Poll tidak ditemukan" });
    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: poll.conversationId, userId: req.user.id } },
    });
    if (!member) return reply.code(403).send({ error: "Bukan member" });
    return serializePoll(poll, req.user.id);
  });

  // POST /api/polls/:conversationId — create poll (with optional image uploads)
  app.post("/:conversationId", async (req, reply) => {
    const { conversationId } = req.params as { conversationId: string };
    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: req.user.id } },
    });
    if (!member) return reply.code(403).send({ error: "Bukan member" });

    const body = req.body as {
      question: string;
      isMultiVote?: boolean;
      options: { text?: string; imageUrl?: string; order?: number }[];
    };

    if (!body.question?.trim()) return reply.code(400).send({ error: "Pertanyaan wajib diisi" });
    if (!body.options || body.options.length < 2) return reply.code(400).send({ error: "Minimal 2 opsi" });
    if (body.options.length > 6) return reply.code(400).send({ error: "Maksimal 6 opsi" });

    const poll = await prisma.poll.create({
      data: {
        conversationId,
        createdById: req.user.id,
        question: body.question.trim(),
        isMultiVote: body.isMultiVote ?? false,
        options: {
          create: body.options.map((opt, i) => ({
            text: opt.text?.trim() || null,
            imageUrl: opt.imageUrl || null,
            order: opt.order ?? i,
          })),
        },
      },
      include: POLL_INCLUDE,
    });

    const serialized = serializePoll(poll, req.user.id);
    const io = (app as any).io;
    if (io) {
      io.to(`convo:${conversationId}`).emit("poll:new", { poll: serialized });
    }

    // Push notification
    const creator = await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true } });
    const convo = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { name: true, type: true } });
    notifyConversationMembers({
      conversationId,
      senderUserId: req.user.id,
      senderName: creator?.name ?? "Seseorang",
      conversationName: convo?.name ?? "Chat",
      messageContent: `📊 Poll baru: ${body.question.trim()}`,
      hasAttachment: false,
    }).catch(() => {});

    return serialized;
  });

  // POST /api/polls/:pollId/vote — vote on poll
  app.post("/:pollId/vote", async (req, reply) => {
    const { pollId } = req.params as { pollId: string };
    const { optionIds } = req.body as { optionIds: string[] };

    if (!optionIds?.length) return reply.code(400).send({ error: "Pilih minimal 1 opsi" });

    const poll = await prisma.poll.findUnique({
      where: { id: pollId },
      include: { options: { select: { id: true } } },
    });
    if (!poll) return reply.code(404).send({ error: "Poll tidak ditemukan" });
    if (poll.isClosed) return reply.code(400).send({ error: "Poll sudah ditutup" });

    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: poll.conversationId, userId: req.user.id } },
    });
    if (!member) return reply.code(403).send({ error: "Bukan member" });

    const validOptionIds = poll.options.map((o) => o.id);
    const toVote = optionIds.filter((id) => validOptionIds.includes(id));
    if (!toVote.length) return reply.code(400).send({ error: "Opsi tidak valid" });

    // Single vote: remove all existing votes before re-voting
    if (!poll.isMultiVote) {
      await prisma.pollVote.deleteMany({ where: { pollId, userId: req.user.id } });
      await prisma.pollVote.create({ data: { pollId, optionId: toVote[0], userId: req.user.id } });
    } else {
      // Multi-vote: toggle each option
      for (const optionId of toVote) {
        const existing = await prisma.pollVote.findUnique({
          where: { pollId_optionId_userId: { pollId, optionId, userId: req.user.id } },
        });
        if (existing) {
          await prisma.pollVote.delete({ where: { id: existing.id } });
        } else {
          await prisma.pollVote.create({ data: { pollId, optionId, userId: req.user.id } });
        }
      }
    }

    const updated = await prisma.poll.findUnique({ where: { id: pollId }, include: POLL_INCLUDE });
    const serialized = serializePoll(updated!, req.user.id);
    const io = (app as any).io;
    if (io) {
      io.to(`convo:${poll.conversationId}`).emit("poll:vote", { poll: serialized });
    }
    return serialized;
  });

  // PATCH /api/polls/:pollId/close — close poll (creator or admin)
  app.patch("/:pollId/close", async (req, reply) => {
    const { pollId } = req.params as { pollId: string };
    const poll = await prisma.poll.findUnique({ where: { id: pollId } });
    if (!poll) return reply.code(404).send({ error: "Poll tidak ditemukan" });

    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { role: true } });
    const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
    if (poll.createdById !== req.user.id && !isAdmin) {
      return reply.code(403).send({ error: "Hanya pembuat poll atau admin yang bisa menutup poll" });
    }

    const updated = await prisma.poll.update({
      where: { id: pollId },
      data: { isClosed: true, closedAt: new Date() },
      include: POLL_INCLUDE,
    });
    const serialized = serializePoll(updated, req.user.id);
    const io = (app as any).io;
    if (io) {
      io.to(`convo:${poll.conversationId}`).emit("poll:vote", { poll: serialized });
    }
    return serialized;
  });

  // DELETE /api/polls/:pollId — delete poll (creator or admin)
  app.delete("/:pollId", async (req, reply) => {
    const { pollId } = req.params as { pollId: string };
    const poll = await prisma.poll.findUnique({ where: { id: pollId } });
    if (!poll) return reply.code(404).send({ error: "Poll tidak ditemukan" });

    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { role: true } });
    const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
    if (poll.createdById !== req.user.id && !isAdmin) {
      return reply.code(403).send({ error: "Hanya pembuat poll atau admin yang bisa hapus poll" });
    }

    await prisma.poll.delete({ where: { id: pollId } });
    const io = (app as any).io;
    if (io) {
      io.to(`convo:${poll.conversationId}`).emit("poll:deleted", { pollId });
    }
    return { ok: true };
  });
}
