import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../plugins/auth.js";
import { json } from "../lib/json.js";
import {
  getDashboardStats,
  getStorageInfo,
  getRetentionSettings,
  setRetentionSettings,
  previewArchive,
  runArchive,
  getEditWindowMinutes,
  setEditWindowMinutes,
} from "../services/admin.js";
import { hashPassword } from "../services/auth-session.js";

export async function adminRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get(
    "/dashboard/stats",
    { preHandler: requireRole("ADMIN") },
    async () => getDashboardStats()
  );

  app.get(
    "/dashboard/storage",
    { preHandler: requireRole("ADMIN") },
    async () => getStorageInfo()
  );

  app.get(
    "/audit-log",
    { preHandler: requireRole("ADMIN") },
    async (req) => {
      const query = req.query as { page?: string; limit?: string };
      const page = Math.max(Number(query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
          include: { user: { select: { id: true, name: true, email: true } } },
        }),
        prisma.auditLog.count(),
      ]);
      return { logs, total, page, limit };
    }
  );

  // FR-12.x — Data Retention
  app.get(
    "/retention-settings",
    { preHandler: requireRole("ADMIN") },
    async () => getRetentionSettings()
  );

  app.patch(
    "/retention-settings",
    { preHandler: requireRole("SUPER_ADMIN") },
    async (req, reply) => {
      const body = (req.body ?? {}) as { mode?: string; months?: number };
      if (body.mode !== "forever" && body.mode !== "auto-archive") {
        reply.code(400).send({ error: "mode harus 'forever' atau 'auto-archive'" });
        return;
      }
      const policy = await setRetentionSettings(req.user.id, {
        mode: body.mode,
        months: body.mode === "auto-archive" ? Number(body.months) || 6 : undefined,
      });
      return policy;
    }
  );

  app.post(
    "/retention/preview",
    { preHandler: requireRole("ADMIN") },
    async () => previewArchive()
  );

  app.post(
    "/retention/run-archive",
    { preHandler: requireRole("ADMIN") },
    async (req) => runArchive(req.user.id)
  );

  // Edit window settings
  app.get(
    "/edit-window",
    { preHandler: requireRole("ADMIN") },
    async () => ({ minutes: await getEditWindowMinutes() })
  );

  app.patch(
    "/edit-window",
    { preHandler: requireRole("SUPER_ADMIN") },
    async (req, reply) => {
      const { minutes } = (req.body ?? {}) as { minutes?: number };
      const m = Number(minutes);
      if (!m || m < 1 || m > 10080) {
        reply.code(400).send({ error: "minutes harus antara 1 dan 10080 (7 hari)" });
        return;
      }
      return setEditWindowMinutes(req.user.id, m);
    }
  );

  // Pending users (self-registered, awaiting approval)
  app.get(
    "/users/pending",
    { preHandler: requireRole("ADMIN") },
    async () => {
      return prisma.user.findMany({
        where: { status: "pending" },
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, email: true, division: true, role: true, createdAt: true, status: true },
      });
    }
  );

  app.post(
    "/users/:id/approve",
    { preHandler: requireRole("ADMIN") },
    async (req) => {
      const { id } = req.params as { id: string };
      const user = await prisma.user.update({
        where: { id },
        data: { status: "offline" },
        select: { id: true, name: true, email: true, role: true, status: true },
      });
      // onboard ke system topics
      const { onboardUser } = await import("../services/users.js");
      await onboardUser(id);
      await prisma.auditLog.create({
        data: { userId: req.user.id, action: "USER_APPROVE", targetId: id },
      });
      return user;
    }
  );

  app.post(
    "/users/:id/reject",
    { preHandler: requireRole("ADMIN") },
    async (req) => {
      const { id } = req.params as { id: string };
      await prisma.user.delete({ where: { id } });
      await prisma.auditLog.create({
        data: { userId: req.user.id, action: "USER_REJECT", targetId: id },
      });
      return { ok: true };
    }
  );

  // Toggle isPinnedTop (starred group) for any conversation
  app.patch(
    "/conversations/:id/pinned-top",
    { preHandler: requireRole("ADMIN") },
    async (req) => {
      const { id } = req.params as { id: string };
      const { isPinnedTop } = (req.body ?? {}) as { isPinnedTop?: boolean };
      // When pinning: also set isPublic=true so all users can see it
      // When unpinning: set isPublic=false so it returns to member-only
      const convo = await prisma.conversation.update({
        where: { id },
        data: { isPinnedTop: !!isPinnedTop, isPublic: !!isPinnedTop },
        select: { id: true, name: true, isPinnedTop: true, isPublic: true },
      });
      await prisma.auditLog.create({
        data: {
          userId: req.user.id,
          action: isPinnedTop ? "GROUP_PIN_TOP" : "GROUP_UNPIN_TOP",
          targetId: id,
        },
      });
      return convo;
    }
  );

  // Toggle isReadOnly (who can write) for any conversation
  app.patch(
    "/conversations/:id/read-only",
    { preHandler: requireRole("ADMIN") },
    async (req) => {
      const { id } = req.params as { id: string };
      const { isReadOnly } = (req.body ?? {}) as { isReadOnly?: boolean };
      const convo = await prisma.conversation.update({
        where: { id },
        data: { isReadOnly: !!isReadOnly },
        select: { id: true, name: true, isReadOnly: true },
      });
      await prisma.auditLog.create({
        data: {
          userId: req.user.id,
          action: isReadOnly ? "GROUP_SET_READONLY" : "GROUP_SET_WRITABLE",
          targetId: id,
        },
      });
      return convo;
    }
  );

  // Clear all messages in a conversation (admin only)
  app.delete(
    "/conversations/:id/messages",
    { preHandler: requireRole("ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const conv = await prisma.conversation.findUnique({
        where: { id },
        select: { name: true, type: true },
      });
      if (!conv) {
        reply.code(404).send({ error: "Conversation tidak ditemukan" });
        return;
      }
      await prisma.reaction.deleteMany({ where: { message: { conversationId: id } } });
      await prisma.attachment.deleteMany({ where: { message: { conversationId: id } } });
      await prisma.pinnedItem.deleteMany({ where: { conversationId: id } });
      await prisma.message.deleteMany({ where: { conversationId: id } });
      await prisma.auditLog.create({
        data: {
          userId: req.user.id,
          action: "CONVERSATION_CLEAR",
          targetId: id,
          metadata: json({ name: conv.name, type: conv.type }),
        },
      });
      reply.send({ ok: true });
    }
  );

  // FR-14.3 — User management: change role, toggle status, edit, delete
  app.patch(
    "/users/:id/role",
    { preHandler: requireRole("ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { role } = (req.body ?? {}) as { role?: string };
      const validRoles = ["STAFF", "MANAGER", "ADMIN", "SUPER_ADMIN"];
      if (!role || !validRoles.includes(role)) {
        reply.code(400).send({ error: "Role tidak valid" });
        return;
      }
      // Hanya SUPER_ADMIN yang bisa assign SUPER_ADMIN
      if (role === "SUPER_ADMIN" && req.user.role !== "SUPER_ADMIN") {
        reply.code(403).send({ error: "Hanya Super Admin yang bisa assign role SUPER_ADMIN" });
        return;
      }
      const user = await prisma.user.update({
        where: { id },
        data: { role },
        select: { id: true, name: true, role: true },
      });
      await prisma.auditLog.create({
        data: { userId: req.user.id, action: "ROLE_CHANGE", targetId: id, metadata: JSON.stringify({ role }) },
      });
      return user;
    }
  );

  app.patch(
    "/users/:id/status",
    { preHandler: requireRole("ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { status } = (req.body ?? {}) as { status?: string };
      const validStatuses = ["online", "offline", "away", "disabled"];
      if (!status || !validStatuses.includes(status)) {
        reply.code(400).send({ error: "Status tidak valid" });
        return;
      }
      const user = await prisma.user.update({
        where: { id },
        data: { status },
        select: { id: true, name: true, status: true },
      });
      await prisma.auditLog.create({
        data: { userId: req.user.id, action: status === "disabled" ? "USER_DISABLE" : "USER_ENABLE", targetId: id },
      });
      return user;
    }
  );

  // Edit user profile (admin)
  app.patch(
    "/users/:id",
    { preHandler: requireRole("ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { name, division, email } = (req.body ?? {}) as { name?: string; division?: string; email?: string };
      const data: any = {};
      if (name?.trim()) data.name = name.trim();
      if (division !== undefined) data.division = division?.trim() || null;
      if (email?.trim()) {
        // check email uniqueness
        const existing = await prisma.user.findFirst({ where: { email: email.trim(), NOT: { id } } });
        if (existing) { reply.code(400).send({ error: "Email sudah digunakan" }); return; }
        data.email = email.trim();
      }
      const user = await prisma.user.update({
        where: { id }, data,
        select: { id: true, name: true, email: true, division: true, role: true, status: true },
      });
      await prisma.auditLog.create({
        data: { userId: req.user.id, action: "USER_EDIT", targetId: id },
      });
      return user;
    }
  );

  // Reset user password (admin) — generates new password
  app.post(
    "/users/:id/reset-password",
    { preHandler: requireRole("ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { password } = (req.body ?? {}) as { password?: string };
      if (!password || password.length < 6) {
        reply.code(400).send({ error: "Password minimal 6 karakter" });
        return;
      }
      const hash = await hashPassword(password);
      await prisma.user.update({ where: { id }, data: { passwordHash: hash } });
      await prisma.auditLog.create({
        data: { userId: req.user.id, action: "USER_RESET_PASSWORD", targetId: id },
      });
      return { ok: true };
    }
  );

  // ── Division master data ─────────────────────────────────────────────────────
  app.get("/divisions", async () => {
    const setting = await prisma.auditLog.findFirst({
      where: { action: "DIVISIONS_SET" },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    const divisions: string[] = setting?.metadata ? JSON.parse(setting.metadata) : [];
    return { divisions };
  });

  app.put(
    "/divisions",
    { preHandler: requireRole("ADMIN") },
    async (req, reply) => {
      const { divisions } = (req.body ?? {}) as { divisions?: string[] };
      if (!Array.isArray(divisions)) { reply.code(400).send({ error: "divisions harus array" }); return; }
      const cleaned = divisions.map((d) => d.trim()).filter(Boolean);
      await prisma.auditLog.create({
        data: { userId: req.user.id, action: "DIVISIONS_SET", metadata: JSON.stringify(cleaned) },
      });
      return { divisions: cleaned };
    }
  );

  // Delete user (admin) — permanent
  app.delete(
    "/users/:id",
    { preHandler: requireRole("SUPER_ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (id === req.user.id) {
        reply.code(400).send({ error: "Tidak bisa hapus akun sendiri" });
        return;
      }
      // Remove memberships, messages authored kept (isDeleted by userId)
      await prisma.conversationMember.deleteMany({ where: { userId: id } });
      await prisma.user.delete({ where: { id } });
      await prisma.auditLog.create({
        data: { userId: req.user.id, action: "USER_DELETE", targetId: id },
      });
      return { ok: true };
    }
  );
}