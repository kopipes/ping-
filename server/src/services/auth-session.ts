import { prisma } from "../lib/prisma.js";
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "./auth.js";

const denylist = new Set<string>();

export function logoutService(token?: string) {
  if (token) denylist.add(token);
}

async function publicUser(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      division: true,
      role: true,
      locale: true,
      status: true,
    },
  });
  if (!user) return null;
  return user;
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (!user) return null;

  const ok = await verifyPassword(user.passwordHash, password).catch(() => false);
  if (!ok) return null;

  if (user.status === "disabled") {
    throw new Error("Akun dinonaktifkan");
  }

  if (user.status === "pending") {
    throw new Error("Akun belum disetujui admin. Harap tunggu persetujuan.");
  }

  const accessToken = signAccessToken({ id: user.id, role: user.role });
  const refreshToken = signRefreshToken(user.id);

  // Set status to online on login
  await prisma.user.update({ where: { id: user.id }, data: { status: "online" } });

  return {
    accessToken,
    refreshToken,
    user: await publicUser(user.id),
  };
}

export async function refreshTokenService(token?: string) {
  if (!token || denylist.has(token)) return null;
  const payload = verifyRefreshToken(token);
  if (!payload) return null;

  const user = await publicUser(payload.id);
  if (!user || user.role === undefined) {
    // role undefined berarti akun dihapus/nonaktif
    const raw = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!raw) return null;
    if (raw.status === "disabled") {
      denylist.add(token);
      return null;
    }
  }

  return {
    accessToken: signAccessToken({ id: payload.id, role: user?.role ?? "STAFF" }),
    user,
  };
}

export { hashPassword };

export function makeInvitePassword(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}