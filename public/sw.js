const CACHE_PREFIX = "any-given-pick-";
const CACHE_NAME = `${CACHE_PREFIX}v7-web-push`;
const APP_SHELL = ["/offline.html", "/manifest.webmanifest", "/pwa-icon-192.png", "/pwa-icon-512.png"];

function isCacheableStaticRequest(request) {
  if (request.method !== "GET") return false;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (APP_SHELL.includes(url.pathname)) return true;

  return url.pathname.startsWith("/_next/static/") &&
    ["font", "image", "script", "style"].includes(request.destination);
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method === "GET" && event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/offline.html")),
    );
    return;
  }

  if (!isCacheableStaticRequest(event.request)) return;

  event.respondWith(
    caches.match(event.request).then((cached) =>
      cached || fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }),
    ),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const notification = payload.notification ?? payload;
  const title = notification.title ?? "Any Given Pick";
  const url = notification.navigate ?? notification.data?.url ?? "https://anygivenpick.app/";
  const options = {
    body: notification.body ?? "There is a new update on your call sheet.",
    icon: notification.icon ?? "/pwa-icon-192.png",
    badge: notification.badge ?? "/pwa-icon-192.png",
    tag: notification.tag ?? "any-given-pick-update",
    data: { ...(notification.data ?? {}), url },
  };
  event.waitUntil(Promise.all([
    self.registration.showNotification(title, options),
    "setAppBadge" in self.registration
      ? self.registration.setAppBadge(1).catch(() => undefined)
      : Promise.resolve(),
  ]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = new URL(event.notification.data?.url ?? "/", self.location.origin);
  if (destination.origin !== self.location.origin) destination.href = self.location.origin;
  event.waitUntil((async () => {
    if ("clearAppBadge" in self.registration) {
      await self.registration.clearAppBadge().catch(() => undefined);
    }
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === destination.origin);
    if (existing) {
      await existing.navigate(destination.href);
      return existing.focus();
    }
    return self.clients.openWindow(destination.href);
  })());
});
