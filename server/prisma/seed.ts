import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import {
  SYSTEM_ANNOUNCEMENT_NAME,
  SYSTEM_GENERAL_NAME,
} from "../src/lib/constants.js";

const prisma = new PrismaClient();

async function ensureSystemTopic(name: string, opts: { isReadOnly: boolean; icon: string }) {
  const existing = await prisma.conversation.findFirst({
    where: { name, isPinnedTop: true },
  });
  if (existing) return existing;

  return prisma.conversation.create({
    data: {
      type: "TOPIC",
      name,
      icon: opts.icon,
      isPinnedTop: true,
      isReadOnly: opts.isReadOnly,
    },
  });
}

async function enrollAll(topicId: string) {
  const users = await prisma.user.findMany({ select: { id: true } });
  for (const u of users) {
    await prisma.conversationMember
      .create({ data: { conversationId: topicId, userId: u.id } })
      .catch(() => {});
  }
}

async function main() {
  // SUPER_ADMIN
  const superAdminEmail = process.env.SEED_ADMIN_EMAIL || "admin@pvc.local";
  let superAdmin = await prisma.user.findUnique({
    where: { email: superAdminEmail },
  });
  if (!superAdmin) {
    superAdmin = await prisma.user.create({
      data: {
        name: "Super Admin",
        email: superAdminEmail,
        passwordHash: await argon2.hash(process.env.SEED_ADMIN_PASSWORD || "admin123"),
        role: "SUPER_ADMIN",
        division: "IT",
      },
    });
    console.log(`> SUPER_ADMIN dibuat: ${superAdminEmail}`);
  }

  // Sample STAFF utk demo
  const staffEmail = "sari@pvc.local";
  let _ = await prisma.user.findUnique({ where: { email: staffEmail } });
  if (!_) {
    _ = await prisma.user.create({
      data: {
        name: "Sari",
        email: staffEmail,
        passwordHash: await argon2.hash("sari123"),
        role: "STAFF",
        division: "Marketing",
      },
    });
  }

  // System topics otomatis (FR-2.6)
  const announcement = await ensureSystemTopic(SYSTEM_ANNOUNCEMENT_NAME, {
    isReadOnly: true,
    icon: "📢",
  });
  const general = await ensureSystemTopic(SYSTEM_GENERAL_NAME, {
    isReadOnly: false,
    icon: "💬",
  });

  await enrollAll(announcement.id);
  await enrollAll(general.id);

  // Sample Topic Level 1 + Sub-topic
  const itTopic = await prisma.conversation.findFirst({
    where: { name: "IT", parentId: null, isPinnedTop: false },
  });
  const it =
    itTopic ??
    (await prisma.conversation.create({
      data: {
        type: "TOPIC",
        name: "IT",
        icon: "📁",
        ownerId: superAdmin.id,
      },
    }));
  await prisma.conversationMember
    .create({ data: { conversationId: it.id, userId: superAdmin.id, role: "ADMIN" } })
    .catch(() => {});

  const bugReport = await prisma.conversation.findFirst({
    where: { name: "Bug Report", parentId: it.id },
  });
  if (!bugReport) {
    const sub = await prisma.conversation.create({
      data: {
        type: "TOPIC",
        name: "Bug Report",
        icon: "🐞",
        parentId: it.id,
        ownerId: superAdmin.id,
      },
    });
    await prisma.conversationMember
      .create({ data: { conversationId: sub.id, userId: superAdmin.id, role: "ADMIN" } })
      .catch(() => {});
  }

  console.log("> Seed selesai.");
  console.log("> Login demo: admin@pvc.local / admin123 | sari@pvc.local / sari123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());