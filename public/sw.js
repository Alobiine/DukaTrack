const CACHE = "dukatrack-v2";
const SHELL = ["/", "/icon.svg", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png"];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});
// Keep previous version assets: an already-open page may still reference its chunks.
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("fetch", (event) => {
  const r = event.request,
    u = new URL(r.url);
  if (
    r.method !== "GET" ||
    u.origin !== location.origin ||
    u.pathname.startsWith("/api/")
  )
    return;
  const asset = /\.(js|css|svg|png|webmanifest)$/.test(u.pathname);
  const cacheKey = r.mode === "navigate" ? u.pathname : r;
  if (r.mode !== "navigate" && !asset) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(r);
        // Never replace the HTML shell with a React Server Component response.
        if (
          response.ok &&
          (asset || response.headers.get("content-type")?.includes("text/html"))
        ) {
          await cache
            .put(cacheKey, response.clone())
            .catch(() => {});
        }
        return response;
      } catch {
        return (
          (await caches.match(cacheKey)) ||
          Response.error()
        );
      }
    })(),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_ASSETS" || !Array.isArray(event.data.urls))
    return;
  const urls = event.data.urls.filter((value) => {
    try {
      const u = new URL(value, location.origin);
      return u.origin === location.origin && /\.(js|css)$/.test(u.pathname);
    } catch {
      return false;
    }
  });
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.all(urls.map((u) => c.add(u).catch(() => {})))),
  );
});
