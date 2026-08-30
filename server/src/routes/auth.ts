import type { FastifyInstance } from "fastify";
import {
  login,
  refreshTokenService,
  logoutService,
} from "../services/auth-session.js";
import { hashPassword } from "../services/auth.js";
import { prisma } from "../lib/prisma.js";

export async function authRoutes(app: FastifyInstance) {
  app.post("/login", async (req, reply) => {
    const body = (req.body ?? {}) as { email?: string; password?: string };
    if (!body.email || !body.password) {
      reply.code(400).send({ error: "email dan password wajib diisi" });
      return;
    }

    const refresh = await login(body.email, body.password);
    if (!refresh) {
      reply.code(401).send({ error: "Login gagal", message: "Email atau password salah" });
      return;
    }

    reply.setCookie("refreshToken", refresh.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });

    reply.send({ accessToken: refresh.accessToken, user: refresh.user });
  });

  // Self-registration — akun dibuat dengan status "pending", harus diapprove admin
  app.post("/register", async (req, reply) => {
    const body = (req.body ?? {}) as {
      name?: string; email?: string; password?: string; division?: string;
    };
    if (!body.name || !body.email || !body.password) {
      reply.code(400).send({ error: "Nama, email, dan password wajib diisi" });
      return;
    }
    if (body.password.length < 6) {
      reply.code(400).send({ error: "Password minimal 6 karakter" });
      return;
    }
    const exists = await prisma.user.findUnique({ where: { email: body.email.trim().toLowerCase() } });
    if (exists) {
      reply.code(409).send({ error: "Email sudah terdaftar" });
      return;
    }
    const user = await prisma.user.create({
      data: {
        name: body.name.trim(),
        email: body.email.trim().toLowerCase(),
        passwordHash: await hashPassword(body.password),
        role: "STAFF",
        division: body.division?.trim() || null,
        status: "pending", // menunggu persetujuan admin
        locale: "id",
      },
    });
    reply.code(201).send({
      message: "Pendaftaran berhasil. Akun Anda menunggu persetujuan admin.",
      userId: user.id,
    });
  });

  app.post("/refresh", async (req, reply) => {
    const token = (req.cookies as { refreshToken?: string } | undefined)?.refreshToken;
    const result = await refreshTokenService(token);
    if (!result) {
      reply.code(401).send({ error: "Unauthorized", message: "Refresh token tidak valid" });
      return;
    }
    reply.send({ accessToken: result.accessToken, user: result.user });
  });

  app.post("/logout", async (req, reply) => {
    const token = (req.cookies as { refreshToken?: string } | undefined)?.refreshToken;
    logoutService(token);
    reply.clearCookie("refreshToken", { path: "/" });
    reply.send({ ok: true });
  });
}