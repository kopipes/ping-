import webpush from "web-push";
import { prisma } from "../lib/prisma.js";

let vapidInitialized = false;

function ensureVapid() {
  if (vapidInitialized) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys not configured — set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in .env");
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidInitialized = true;
}

export function getVapidPublicKey(): string {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) throw new Error("VAPID_PUBLIC_KEY tidak dikonfigurasi");
  return key;
}

export async function saveSubscription(params: {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}) {
  const { userId, endpoint, p256dh, auth } = params;
  // upsert — kalau endpoint sudah ada, update key-nya (misalnya browser re-subscribe)
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId, endpoint, p256dh, auth },
    update: { userId, p256dh, auth },
  });
}

export async function deleteSubscription(endpoint: string, userId: string) {
  await prisma.pushSubscription.deleteMany({
    where: { endpoint, userId },
  });
}

export interface PushPayload {
  title: string;
  body: string;
  conversationId: string;
  conversationName?: string;
  senderName: string;
  icon?: string;
}

/**
 * Kirim push notification ke semua device milik userId tertentu.
 * Expired/invalid subscriptions dihapus otomatis.
 */
export async function sendPushToUser(userId: string, payload: PushPayload) {
  ensureVapid();

  const subs = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  if (subs.length === 0) return;

  const data = JSON.stringify(payload);
  const stale: string[] = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          data,
          { TTL: 60 * 60 * 24 } // 24 jam
        );
      } catch (err: any) {
        // 410 Gone / 404 Not Found — subscription sudah tidak valid
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          stale.push(sub.endpoint);
        }
        // Error lain (jaringan, dll) — abaikan, jangan hapus
      }
    })
  );

  if (stale.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: { in: stale } },
    });
  }
}

/**
 * Kirim push notification ke semua member suatu conversation,
 * kecuali pengirim pesan itu sendiri.
 * Status online/offline diabaikan — browser/OS yang menentukan apakah notif ditampilkan.
 */
export async function notifyConversationMembers(params: {
  conversationId: string;
  senderUserId: string;
  senderName: string;
  conversationName: string;
  messageContent: string | null;
  hasAttachment: boolean;
}) {
  const {
    conversationId,
    senderUserId,
    senderName,
    conversationName,
    messageContent,
    hasAttachment,
  } = params;

  // Cari semua member conversation yang bukan pengirim
  const members = await prisma.conversationMember.findMany({
    where: {
      conversationId,
      userId: { not: senderUserId },
    },
    select: { userId: true },
  });

  if (members.length === 0) return;

  // Susun body notifikasi
  let body: string;
  if (messageContent) {
    body = messageContent.length > 100
      ? messageContent.slice(0, 97) + "…"
      : messageContent;
  } else if (hasAttachment) {
    body = "📎 Mengirim lampiran";
  } else {
    body = "Pesan baru";
  }

  const payload: PushPayload = {
    title: `${senderName} di ${conversationName}`,
    body,
    conversationId,
    conversationName,
    senderName,
  };

  await Promise.allSettled(
    members.map((m) => sendPushToUser(m.userId, payload))
  );
}
