/* Turns on cross-origin isolation (see coi-sw.js) so the Ultra engine can use all CPU
   cores. Chromium (Chrome, Brave, Edge, Opera) and Firefox only: they support COEP
   "credentialless"; Safari doesn't, and isolating it would block posters and logos.
   The first visit reloads once when the helper is ready; later visits start isolated. */
(function () {
  "use strict";
  try {
    if (self.crossOriginIsolated || !window.isSecureContext || !("serviceWorker" in navigator)) return;
    const ua = navigator.userAgent || "";
    const chromium = /Chrome\/(\d+)/.exec(ua);
    const firefox = /Firefox\/(\d+)/.exec(ua);
    if (!((chromium && +chromium[1] >= 96) || (firefox && +firefox[1] >= 119))) return;
    if (/iPhone|iPad|iPod/.test(ua)) return; // iOS browsers are all Safari underneath
    const tried = sessionStorage.getItem("us-coi");
    navigator.serviceWorker
      .register("coi-sw.js")
      .then((reg) => {
        if (navigator.serviceWorker.controller) {
          // Controlled but still not isolated (e.g. a hard reload bypassed the helper):
          // one soft reload fixes it.
          if (!tried) {
            sessionStorage.setItem("us-coi", "1");
            location.reload();
          }
          return;
        }
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (sessionStorage.getItem("us-coi")) return;
          sessionStorage.setItem("us-coi", "1");
          location.reload();
        });
        return reg;
      })
      .catch(() => {});
  } catch (_) {}
})();
