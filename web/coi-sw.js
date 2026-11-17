/* Ultra Stalker Web — cross-origin isolation for GitHub Pages.

   The Ultra engine (FFmpeg decoders in WebAssembly) can only split its work across
   several CPU cores when the page is "cross-origin isolated", which needs two response
   headers that GitHub Pages can't send. This worker adds them to the site's own files
   and changes nothing else: no caching, other sites' requests are not touched.
   COEP "credentialless" keeps cross-origin images (posters, channel logos) working. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.cache === "only-if-cached" && r.mode !== "same-origin") return;
  let same = false;
  try {
    same = new URL(r.url).origin === self.location.origin;
  } catch (_) {}
  if (!same) return;
  e.respondWith(
    fetch(r).then((res) => {
      if (!res || res.status === 0 || res.type === "opaqueredirect") return res;
      const h = new Headers(res.headers);
      h.set("Cross-Origin-Embedder-Policy", "credentialless");
      h.set("Cross-Origin-Opener-Policy", "same-origin");
      h.set("Cross-Origin-Resource-Policy", "same-origin");
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
    }),
  );
});
