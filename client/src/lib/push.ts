import { api, apiBase } from "./api";

/** Konversi VAPID public key dari Base64URL ke Uint8Array untuk PushManager.subscribe() */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buf = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < rawData.length; i++) {
    view[i] = rawData.charCodeAt(i);
  }
  return view;
}

/** Ambil VAPID public key dari server */
async function fetchVapidPublicKey(): Promise<string> {
  const res = await fetch(`${apiBase}/api/push/vapid-public-key`);
  if (!res.ok) throw new Error("Gagal mengambil VAPID public key");
  const data = await res.json();
  return data.vapidPublicKey as string;
}

/** Cek apakah Push Notification didukung browser ini */
export function isPushSupported(): boolean {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Minta izin notifikasi. Return true jika granted. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isPushSupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

/** Ambil status izin notifikasi saat ini */
export function getNotificationPermission(): NotificationPermission {
  if (!isPushSupported()) return "denied";
  return Notification.permission;
}

/**
 * Subscribe ke push notifications.
 * - Minta izin notifikasi
 * - Daftarkan ke PushManager
 * - Kirim subscription ke server
 */
export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) throw new Error("Browser tidak mendukung push notifications");

  const granted = await requestNotificationPermission();
  if (!granted) return false;

  const reg = await navigator.serviceWorker.ready;
  if (!reg.pushManager) throw new Error("PushManager tidak tersedia");

  // Cek apakah sudah subscribe
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    // sudah ada, pastikan server tahu
    await sendSubscriptionToServer(existing);
    return true;
  }

  const vapidPublicKey = await fetchVapidPublicKey();
  const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  });

  await sendSubscriptionToServer(subscription);
  return true;
}

/** Kirim PushSubscription ke server */
async function sendSubscriptionToServer(sub: PushSubscription) {
  const json = sub.toJSON();
  await api("/api/push/subscribe", {
    method: "POST",
    body: {
      endpoint: json.endpoint,
      keys: {
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
      },
    },
  });
}

/**
 * Unsubscribe dari push notifications.
 * - Hapus subscription dari PushManager
 * - Beritahu server untuk menghapus dari DB
 */
export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;

  const reg = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;

  // Hapus dari browser dulu
  await subscription.unsubscribe();

  // Beritahu server
  try {
    await api("/api/push/unsubscribe", {
      method: "DELETE",
      body: { endpoint },
    });
  } catch {
    // Tidak kritis jika server gagal — subscription sudah dihapus dari browser
  }
}

/** Cek apakah device ini sudah subscribe */
export async function isPushSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub !== null;
  } catch {
    return false;
  }
}
