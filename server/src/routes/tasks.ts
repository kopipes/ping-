import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { sendPushToUser } from "../services/push.js";

const TASK_INCLUDE = {
  createdBy: { select: { id: true, name: true, avatarUrl: true } },
  assignee:  { select: { id: true, name: true, avatarUrl: true } },
  doneBy:    { select: { id: true, name: true } },
};

export async function taskRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // GET /api/tasks/:conversationId — list open tasks for a conversation
  app.get("/:conversationId", async (req, reply) => {
    const { conversationId } = req.params as { conversationId: string };
    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: req.user.id } },
    });
    if (!member) return reply.code(403).send({ error: "Bukan member" });

    const tasks = await prisma.task.findMany({
      where: { conversationId, isDone: false },
      orderBy: { createdAt: "asc" },
      include: TASK_INCLUDE,
    });
    return tasks;
  });

  // POST /api/tasks/:conversationId — create a task
  app.post("/:conversationId", async (req, reply) => {
    const { conversationId } = req.params as { conversationId: string };
    const { content, messageId, assigneeId } = req.body as {
      content: string;
      messageId?: string;
      assigneeId?: string | null;
    };
    if (!content?.trim()) return reply.code(400).send({ error: "Isi task wajib diisi" });

    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: req.user.id } },
    });
    if (!member) return reply.code(403).send({ error: "Bukan member" });

    // Validate assignee is a member of this conversation
    if (assigneeId) {
      const assigneeMember = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId: assigneeId } },
      });
      if (!assigneeMember) return reply.code(400).send({ error: "Assignee bukan member conversation ini" });
    }

    const task = await prisma.task.create({
      data: {
        conversationId,
        content: content.trim(),
        messageId: messageId ?? null,
        createdById: req.user.id,
        assigneeId: assigneeId ?? null,
      },
      include: TASK_INCLUDE,
    });

    // Broadcast to conversation room
    const io = (app as any).io;
    if (io) {
      io.to(`convo:${conversationId}`).emit("task:created", { task });
    }

    // Push notify assignee if different from creator
    if (assigneeId && assigneeId !== req.user.id) {
      const creator = await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true } });
      sendPushToUser(assigneeId, {
        title: `Task dari ${creator?.name ?? "Seseorang"}`,
        body: content.trim(),
        conversationId,
        senderName: creator?.name ?? "Seseorang",
      }).catch(() => {});
    }

    return task;
  });

  // PATCH /api/tasks/:taskId/done — mark task as done
  app.patch("/:taskId/done", async (req, reply) => {
    const { taskId } = req.params as { taskId: string };
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        createdBy: { select: { name: true } },
        assignee: { select: { name: true } },
      },
    });
    if (!task) return reply.code(404).send({ error: "Task tidak ditemukan" });

    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: task.conversationId, userId: req.user.id } },
    });
    if (!member) return reply.code(403).send({ error: "Bukan member" });

    const doneBy = await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true } });

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: { isDone: true, doneById: req.user.id, doneAt: new Date() },
      include: TASK_INCLUDE,
    });

    // System message — include assignee info if present
    const assigneePart = task.assignee ? ` (ditugaskan ke *${task.assignee.name}*)` : "";
    const systemMsg = await prisma.message.create({
      data: {
        conversationId: task.conversationId,
        userId: req.user.id,
        content: `✅ *${doneBy?.name ?? "Seseorang"}* menyelesaikan task: _${task.content}_${assigneePart}`,
      },
    });

    const io = (app as any).io;
    if (io) {
      io.to(`convo:${task.conversationId}`).emit("task:done", { task: updated });
      const fullMsg = await prisma.message.findUnique({
        where: { id: systemMsg.id },
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
          attachments: true,
          reactions: true,
        },
      });
      if (fullMsg) {
        io.to(`convo:${task.conversationId}`).emit("message:new", {
          message: { ...fullMsg, status: "sent", replyTo: null },
        });
      }
    }

    return updated;
  });

  // DELETE /api/tasks/:taskId — delete a task (creator or admin)
  app.delete("/:taskId", async (req, reply) => {
    const { taskId } = req.params as { taskId: string };
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return reply.code(404).send({ error: "Task tidak ditemukan" });

    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { role: true } });
    const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
    if (task.createdById !== req.user.id && !isAdmin) {
      return reply.code(403).send({ error: "Tidak bisa hapus task orang lain" });
    }

    await prisma.task.delete({ where: { id: taskId } });

    const io = (app as any).io;
    if (io) {
      io.to(`convo:${task.conversationId}`).emit("task:deleted", { taskId });
    }

    return { ok: true };
  });
}
