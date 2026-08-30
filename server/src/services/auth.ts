import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const ACCESS_EXP = process.env.JWT_ACCESS_EXP || "15m";
const REFRESH_EXP_SECONDS = 7 * 24 * 60 * 60; // 7 hari

export function hashPassword(password: string) {
  return argon2.hash(password);
}

export function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password);
}

export function signAccessToken(user: { id: string; role: string }) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, {
    expiresIn: ACCESS_EXP as jwt.SignOptions["expiresIn"],
  });
}

export function signRefreshToken(userId: string) {
  return jwt.sign({ id: userId, type: "refresh" }, JWT_SECRET, {
    expiresIn: `${REFRESH_EXP_SECONDS}s`,
  });
}

export function verifyRefreshToken(token: string): { id: string } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { id: string; type?: string };
    if (payload.type !== "refresh") return null;
    return { id: payload.id };
  } catch {
    return null;
  }
}

export const REFRESH_COOKIE_MAX_AGE = REFRESH_EXP_SECONDS * 1000;

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) return null;

  const ok = await verifyPassword(user.passwordHash, password).catch(() => false);
  if (!ok) return null;

  if (user.status === "disabled") {
    throw new Error("Akun dinonaktifkan");
  }

  const accessToken = signAccessToken({ id: user.id, role: user.role });
  const refreshToken = signRefreshToken(user.id);
  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      division: user.division,
      role: user.role,
      locale: user.locale,
    },
  };
}