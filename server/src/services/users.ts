import { prisma } from "../lib/prisma.js";
import { SYSTEM_GENERAL_NAME, SYSTEM_ANNOUNCEMENT_NAME } from "../lib/constants.js";

interface NewUser {
  name: string;
  email: string;
  passwordHash: string;
  role?: string;
  division?: string;
  locale?: string;
}

// FR-1.4b Onboarding: user baru otomatis member Announcement & General Chat
export async function onboardUser(userId: string) {
  // Enroll user in ALL pinned channels (isPinnedTop = true)
  // This covers system channels (Announcement, General Chat) + any admin-pinned groups
  const pinnedTopics = await prisma.conversation.findMany({
    where: { isPinnedTop: true },
    select: { id: true },
  });

  for (const topic of pinnedTopics) {
    await prisma.conversationMember.create({
      data: { conversationId: topic.id, userId },
    }).catch(() => {
      /* duplicate ignore */
    });
  }
}

export async function createUser(data: NewUser) {
  const role = (["SUPER_ADMIN", "ADMIN", "MANAGER", "STAFF"].includes(
    data.role || ""
  )
    ? data.role
    : "STAFF") as "SUPER_ADMIN" | "ADMIN" | "MANAGER" | "STAFF";

  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email.trim().toLowerCase(),
      passwordHash: data.passwordHash,
      role,
      division: data.division ?? null,
      locale: data.locale ?? "id",
    },
  });

  await onboardUser(user.id);
  return user;
}

export function publicUser(user: {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  division: string | null;
  role: string;
  status: string;
  lastSeenAt: Date | null;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    division: user.division,
    role: user.role,
    status: user.status,
    lastSeenAt: user.lastSeenAt,
  };
}