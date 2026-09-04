// Service worker cho Web Push (VAPID) -- payload khớp `NotificationEvent`
// (lib/redis/channels.ts): { id, type, title, body, data, createdAt }.
// Không cache asset gì -- chỉ xử lý push event khi tab đã đóng.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "SmartHire", body: event.data.text() };
  }

  const { id, title, body, data } = payload;

  event.waitUntil(
    self.registration.showNotification(title || "SmartHire", {
      body: body || "",
      data: data || {},
      icon: "/logo.svg",
      // Cùng id thay thế notification cũ thay vì chồng nhiều cái lên nhau
      // khi user không kịp đọc.
      tag: id,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.href || "/admin";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(targetUrl) && "focus" in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      }),
  );
});
