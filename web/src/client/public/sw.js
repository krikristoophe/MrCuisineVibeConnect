// Service worker Claudimix : notifications (push sans contenu, on lit la dernière notification) et
// coquille de l'appli hors ligne.
const SHELL = "claudimix-shell-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(["/", "/icon.svg", "/manifest.webmanifest"])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Pages : réseau d'abord, la coquille en cache si hors ligne. Les appels /api ne sont jamais mis en cache.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => caches.match("/")));
  } else if (url.pathname.startsWith("/assets/")) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(SHELL).then((c) => c.put(e.request, copy));
      return res;
    })));
  }
});

self.addEventListener("push", (e) => {
  e.waitUntil((async () => {
    let n = { title: "Claudimix", body: "", url: "/" };
    try {
      const res = await fetch("/api/notifications/latest", { credentials: "include" });
      const d = await res.json();
      if (d.notification) n = d.notification;
    } catch {}
    await self.registration.showNotification(n.title, { body: n.body, icon: "/icon-192.png", badge: "/icon-192.png", data: { url: n.url }, tag: "claudimix" });
  })());
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((list) => {
    for (const c of list) if ("focus" in c) { c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
