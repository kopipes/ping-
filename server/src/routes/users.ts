import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../plugins/auth.js";
import { createUser } from "../services/users.js";
import { hashPassword, makeInvitePassword } from "../services/auth-session.js";
import { verifyPassword } from "../services/auth.js";
import { json } from "../lib/json.js";

export async function userRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/me", async (req) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        division: true,
        role: true,
        locale: true,
        status: true,
        lastSeenAt: true,
        createdAt: true,
      },
    });
    return user;
  });

  app.patch("/me", async (req, reply) => {
    const body = (req.body ?? {}) as {
      name?: string;
      avatarUrl?: string;
      division?: string;
      locale?: string;
    };
    const data: Record<string, string> = {};
    if (typeof body.name === "string") data.name = body.name;
    if (typeof body.avatarUrl === "string") data.avatarUrl = body.avatarUrl;
    if (typeof body.division === "string") data.division = body.division;
    if (body.locale === "id" || body.locale === "en") data.locale = body.locale;

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        division: true,
        role: true,
        locale: true,
      },
    });
    return user;
  });

  // Change password
  app.post("/me/change-password", async (req, reply) => {
    const body = (req.body ?? {}) as { currentPassword?: string; newPassword?: string };
    if (!body.currentPassword || !body.newPassword) {
      reply.code(400).send({ error: "Password lama dan baru wajib diisi" });
      return;
    }
    if (body.newPassword.length < 6) {
      reply.code(400).send({ error: "Password baru minimal 6 karakter" });
      return;
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      reply.code(404).send({ error: "User tidak ditemukan" });
      return;
    }
    const valid = await verifyPassword(user.passwordHash, body.currentPassword);
    if (!valid) {
      reply.code(401).send({ error: "Password lama tidak sesuai" });
      return;
    }
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash: await hashPassword(body.newPassword) },
    });
    return { ok: true };
  });

  // List semua user (untuk mulai DM) — FR-4.1
  app.get("/", async (req, reply) => {
    const q = ((req.query as { q?: string }).q ?? "").toLowerCase();
    const users = await prisma.user.findMany({
      where: q
        ? { OR: [{ name: { contains: q } }, { email: { contains: q } }] }
        : undefined,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        division: true,
        role: true,
        status: true,
        lastSeenAt: true,
      },
      take: 50,
    });
    return users.map((u) =>
      u.id === req.user.id ? { ...u, isMe: true } : u
    );
  });

  // Invite user baru (FR-1.4) — ADMIN ke atas
  app.post("/invite", { preHandler: requireRole("ADMIN") }, async (req, reply) => {
    const body = (req.body ?? {}) as {
      name?: string;
      email?: string;
      role?: string;
      division?: string;
      password?: string; // custom password (opsional — jika kosong, auto-generate)
    };
    if (!body.name || !body.email) {
      reply.code(400).send({ error: "nama dan email wajib diisi" });
      return;
    }
    const exists = await prisma.user.findUnique({
      where: { email: body.email.trim().toLowerCase() },
    });
    if (exists) {
      reply.code(409).send({ error: "Email sudah terdaftar" });
      return;
    }

    const tempPassword = body.password?.trim() || makeInvitePassword();
    if (tempPassword.length < 6) {
      reply.code(400).send({ error: "Password minimal 6 karakter" });
      return;
    }

    const user = await createUser({
      name: body.name,
      email: body.email,
      passwordHash: await hashPassword(tempPassword),
      role: body.role,
      division: body.division,
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: "USER_CREATE",
        targetId: user.id,
        metadata: json({ role: user.role }),
      },
    });

    reply.code(201).send({ ...user, tempPassword });
  });

  // Public (authenticated) division list — used in profile/registration dropdowns
  app.get("/divisions", async () => {
    const setting = await prisma.auditLog.findFirst({
      where: { action: "DIVISIONS_SET" },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    const divisions: string[] = setting?.metadata ? JSON.parse(setting.metadata) : [];
    return { divisions };
  });

  // Lihat daftar Topic/DM yang diikuti user tertentu (FR-1.4d) — ADMIN ke atas
  app.get(
    "/:id/conversations",
    { preHandler: requireRole("ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const memberships = await prisma.conversationMember.findMany({
        where: { userId: id },
        include: {
          conversation: {
            select: { id: true, name: true, type: true, isPinnedTop: true, isArchived: true },
          },
        },
      });
      return memberships.map((m) => m.conversation);
    }
  );

  // GET /presence — return online status for all DM partners
  app.get("/presence", async (req) => {
    const userId = req.user.id;
    // Find all DM partners
    const dmMemberships = await prisma.conversationMember.findMany({
      where: { userId, conversation: { type: "DM" } },
      include: { conversation: { include: { members: { select: { userId: true } } } } },
    });
    const partnerIds = new Set<string>();
    for (const m of dmMemberships) {
      for (const member of m.conversation.members) {
        if (member.userId !== userId) partnerIds.add(member.userId);
      }
    }
    if (partnerIds.size === 0) return {};
    const users = await prisma.user.findMany({
      where: { id: { in: [...partnerIds] } },
      select: { id: true, status: true },
    });
    const result: Record<string, string> = {};
    for (const u of users) result[u.id] = u.status || "offline";
    return result;
  });
}