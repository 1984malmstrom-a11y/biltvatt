/* Network-only shell: no fetch interception, no caches, no offline sales queue.
   Browser updates this file without an HTTP cache. No automatic page reloads. */
self.addEventListener("install", (event) =>
  event.waitUntil(self.skipWaiting()),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
const safeText = (value, fallback, max) =>
  typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : fallback;
function destination(value) {
  try {
    const url = new URL(value, self.location.origin);
    if (
      url.origin === self.location.origin &&
      url.pathname === "/" &&
      !url.hash &&
      (!url.search || url.search === "?view=stats")
    )
      return url.href;
  } catch {
    /* fall back to the public start page */
  }
  return self.location.origin + "/";
}
self.addEventListener("push", (event) => {
  let data = {};
  try {
    const parsed = event.data?.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      data = parsed;
  } catch {
    /* valid defaults for malformed/empty payloads */
  }
  event.waitUntil(
    self.registration.showNotification(
      safeText(data.title, "Tvättligan", 100),
      {
        body: safeText(
          data.body,
          "Öppna Tvättligan för lagets senaste resultat.",
          500,
        ),
        icon: "/icons/tvattligan-192.png",
        badge: "/icons/tvattligan-192.png",
        tag: safeText(data.tag, "tvattligan", 100),
        data: {
          url: destination(data.url),
          type: safeText(data.type, "message", 40),
        },
      },
    ),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = destination(event.notification.data?.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const open = windows.find(
        (client) => new URL(client.url).origin === self.location.origin,
      );
      if (open) {
        // Never navigate/reload an open tab: it could have an unconfirmed sale receipt.
        open.postMessage({
          type: "TVATTLIGAN_OPEN",
          view:
            new URL(url).searchParams.get("view") === "stats"
              ? "stats"
              : "home",
        });
        await open.focus();
      } else await self.clients.openWindow(url);
    })(),
  );
});
