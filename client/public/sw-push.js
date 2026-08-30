/**
 * sw-push.js — Custom service worker untuk menangani Web Push events.
 * File ini di-import oleh Workbox-generated SW via importScripts() di vite.config.ts.
 */

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "PVC", body: event.data.text(), conversationId: "" };
  }

  const title = payload.title || "PVC";
  const options = {
    body: payload.body || "Pesan baru",
    icon: "/icon.svg",
    badge: "/icon.svg",
    tag: `pvc-conv-${payload.conversationId || "general"}`,
    renotify: true,
    data: {
      conversationId: payload.conversationId,
      url: payload.conversationId
        ? `/?conv=${payload.conversationId}`
        : "/",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const targetUrl = data.url || "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // Kalau app sudah terbuka, fokus ke tab yang ada dan navigasi
        for (const client of windowClients) {
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client) {
              client.navigate(targetUrl);
            }
            return;
          }
        }
        // Kalau tidak ada tab yang terbuka, buka baru
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});
