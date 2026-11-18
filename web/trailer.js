(function () {
  "use strict";
  if (window.US_APP) return;

  const mobile = window.matchMedia("(max-width: 1099px), (pointer: coarse)");
  const dialog = document.getElementById("trailerDialog");
  const heading = document.getElementById("trailerTitle");
  const player = dialog.querySelector(".trailer-frame");
  const youtubeLink = dialog.querySelector("a");
  const videoId = /^[a-zA-Z0-9_-]{11}$/;

  function pickTrailer(payload) {
    const trailers = (payload?.videos?.results || []).filter(
      (entry) => entry.site === "YouTube" && entry.type === "Trailer" && videoId.test(entry.key),
    );
    return (trailers.find((entry) => entry.official) || trailers[0])?.key;
  }

  async function lookupTrailer(path) {
    const load = (language) => window.USEngine.tmdbGet(path, { language, append_to_response: "videos" });
    const metadata = await load("en-US");
    const trailer = pickTrailer(metadata);
    const original = metadata?.original_language;
    if (trailer || !/^[a-z]{2}$/.test(original) || original === "en") return trailer;
    return pickTrailer(await load(original));
  }

  function openTrailer(key, title) {
    heading.textContent = title ? "Trailer · " + title : "Trailer";
    youtubeLink.href = "https://www.youtube.com/watch?v=" + key;
    const frame = document.createElement("iframe");
    frame.title = heading.textContent;
    frame.allow = "autoplay; encrypted-media; fullscreen; picture-in-picture";
    frame.allowFullscreen = true;
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    // Android Chromium uses the site's cross-origin-isolated player environment.
    frame.setAttribute("credentialless", "");
    dialog.showModal();
    frame.src = "https://www.youtube-nocookie.com/embed/" + key + "?autoplay=1&playsinline=1";
    player.replaceChildren(frame);
  }

  dialog.addEventListener("close", () => player.replaceChildren());
  window.addEventListener("popstate", () => {
    if (dialog.open) dialog.close();
  });

  document.addEventListener("us-details", async ({ detail }) => {
    if (!mobile.matches || !["vod", "series"].includes(detail?.media)) return;
    const series = detail.media === "series";
    const prefix = series ? "series" : "movie";
    const stage = document.getElementById(series ? "seasonsStage" : "movieStage");
    const actions = document.getElementById(prefix + "HeroActions");
    const title = document.getElementById(prefix + "Title");
    const current = () => !stage.classList.contains("hidden") && (series ? activeSeries : activeMovie)?.id === detail.item;
    if (!current() || actions.querySelector(".trailer-actions")) return;

    const buttonRow = document.createElement("div");
    buttonRow.className = "trailer-actions";
    const favorite = actions.querySelector(".favorite-action");
    actions.insertBefore(buttonRow, favorite || actions.querySelector(".series-season-stack"));
    if (favorite) buttonRow.append(favorite);
    if (!detail.tmdb) return;

    const key = await lookupTrailer((series ? "tv/" : "movie/") + detail.tmdb);
    if (!key || !current() || !buttonRow.isConnected) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "detail-trailer";
    button.setAttribute("aria-haspopup", "dialog");
    const icon = document.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "▶";
    button.append(icon, "Trailer");
    button.addEventListener("click", () => openTrailer(key, title.textContent));
    buttonRow.append(button);
  });
})();
