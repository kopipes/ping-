import type { FastifyReply, FastifyRequest } from "fastify";
import type { Server as SocketServer } from "socket.io";
import { prisma } from "../lib/prisma.js";

// Payload yang disimpan di JWT access token
export interface JwtUser {
  id: string;
  role: string;
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    io: SocketServer;
  }
  interface FastifyRequest {
    user: JwtUser;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtUser;
    user: JwtUser;
  }
}

declare module "socket.io" {
  interface Socket {
    userId?: string;
  }
}

export const authenticate = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    await req.jwtVerify();
  } catch (err) {
    reply
      .code(401)
      .send({ error: "Unauthorized", message: "Token invalid atau expired" });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, role: true, status: true },
  });

  if (!user) {
    reply.code(401).send({ error: "Unauthorized", message: "User tidak ditemukan" });
    return;
  }

  // Offboarding (FR-1.4c): akun nonaktif tidak bisa login
  if (user.status === "disabled") {
    reply.code(403).send({ error: "Forbidden", message: "Akun dinonaktifkan" });
    return;
  }

  req.user = { id: user.id, role: user.role };
};

// Cek apakah role memenuhi minimal level yang dibutuhkan
// Urutan hierarki: SUPER_ADMIN > ADMIN > MANAGER > STAFF
const ROLE_RANK: Record<string, number> = {
  SUPER_ADMIN: 3,
  ADMIN: 2,
  MANAGER: 1,
  STAFF: 0,
};

export const requireRole = (minRole: "SUPER_ADMIN" | "ADMIN" | "MANAGER") => {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const rank = ROLE_RANK[req.user.role] ?? -1;
    if (rank < ROLE_RANK[minRole]) {
      reply
        .code(403)
        .send({ error: "Forbidden", message: "Role tidak memiliki izin" });
    }
  };
};

export const ROLE_RANKS = ROLE_RANK;