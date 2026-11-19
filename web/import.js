/* Ultra Stalker Web — clean, check and add server files without replacing saved sources. */
(() => {
  "use strict";
  const engine = window.USEngine;
  const $ = (id) => document.getElementById(id);
  const macPattern = /\b(?:[a-f0-9]{2}[:-]){5}[a-f0-9]{2}\b/gi;
  const urlPattern = /(?:https?|m3u8?):\/\/[^\s|<>"']+/gi;
  const statusLabels = {
    pending: "Pending", checking: "Checking…", working: "Working", expired: "Expired",
    blocked: "Blocked", inactive: "Inactive", auth_failed: "Login rejected",
    access_denied: "Access denied", no_stream: "Stream not confirmed",
    timeout: "Timed out", unreachable: "Unreachable",
  };
  const kinds = { portal: "Stalker", xtream: "Xtream", m3u: "M3U" };

  function sourceUrl(value, allowBare = false) {
    let url = String(value || "").trim().replace(/^[("'\[]+|[)"',;]+$/g, "").replace(/&amp;/gi, "&");
    if (!url) return null;
    url = url.replace(/^m3u8?:\/\//i, "http://");
    if (allowBare && !url.includes("://") && /^(?:[\w-]+\.)+[\w-]+(?::\d+)?(?:\/|$)/.test(url)) url = "http://" + url;
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return null;
      parsed.hash = "";
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function parseFile(text) {
    const list = [];
    const keys = new Set();
    let duplicates = 0;
    const add = (url, kind, mac = "", name = "") => {
      if (kind === "portal" && !/^(?:[a-f0-9]{2}[:-]){5}[a-f0-9]{2}$|^[a-f0-9]{12}$/i.test(mac)) return;
      const portal = url.href.replace(/\/$/, "");
      const profile = engine.normalizeProfile({
        portal, mac, name: name || url.host, source: "web",
        source_type: kind === "portal" ? "stalker" : "m3u",
        playlist_mode: kind, explicit_http_accepted: url.protocol === "http:",
      });
      if (!profile) return;
      const key = engine.keyText(engine.profileKey(profile));
      if (keys.has(key)) {
        duplicates++;
        return;
      }
      keys.add(key);
      list.push({ profile, key, kind, host: url.host, status: "pending" });
    };
    const addXtream = (url, user, pass, name) => {
      if (!url || !user || !pass) return;
      const base = url.origin + url.pathname.replace(/\/(?:get|player_api)\.php$/i, "").replace(/\/+$/, "");
      add(new URL(engine.xtreamPlaylist(base, user, pass)), "xtream", "", name);
    };
    const addPlaylist = (url, name, explicit = false) => {
      const credentials = engine.xtreamCreds(url.href);
      if (credentials && /\/(?:get|player_api)\.php$/i.test(url.pathname)) {
        addXtream(url, credentials.user, credentials.pass, name);
        return true;
      }
      if (explicit || engine.looksLikeM3u(url.href)) {
        add(url, "m3u", "", name);
        return true;
      }
      return false;
    };

    function parseText(value) {
      let current = null, pending = [], login = {};
      const label = (line, names) => {
        const match = line.match(new RegExp("(?:^|[\\s|;,])(?:" + names + ")\\s*[:=]\\s*(?:\"([^\"]+)\"|'([^']+)'|([^|;,\\s]+))", "i"));
        return match ? match[1] || match[2] || match[3] : "";
      };
      for (const raw of value.split(/\r\n|\r|\n/)) {
        const line = raw.trim();
        if (!line) {
          current = null;
          pending = [];
          login = {};
          continue;
        }
        if (/^(?:#|;|\/\/)/.test(line)) continue;
        const user = label(line, "username|user");
        const pass = label(line, "password|pass");
        const host = label(line, "server(?:\\s+url)?|host|url|dns|portal(?:\\s+url)?");
        const urls = (line.match(urlPattern) || []).map((part) => sourceUrl(part)).filter(Boolean);
        if (host && !urls.length) {
          const url = sourceUrl(host, true);
          if (url) urls.push(url);
        }
        const macs = (line.match(macPattern) || []).concat(
          [...line.matchAll(/\bmac(?:\s+address)?\s*[:=]\s*([a-f0-9]{12})\b/gi)].map((match) => match[1])
        );
        if (urls.length) {
          if (current) login = {};
          current = null;
          for (const url of urls) {
            if (addPlaylist(url)) {
              pending = [];
              continue;
            }
            current = url;
            if (macs.length || pending.length) {
              for (const mac of macs.concat(pending)) add(url, "portal", mac);
              pending = [];
            }
          }
        } else if (macs.length) {
          if (current) for (const mac of macs) add(current, "portal", mac);
          else pending.push(...macs);
        }
        if (user) login.user = user;
        if (pass) login.pass = pass;
        if (current && login.user && login.pass) {
          addXtream(current, login.user, login.pass);
          current = null;
          login = {};
          pending = [];
        }
      }
    }

    function parseJson(value, depth = 0) {
      if (depth > 24 || value == null) return;
      if (typeof value === "string") {
        parseText(value);
        return;
      }
      if (Array.isArray(value)) {
        for (const row of value) parseJson(row, depth + 1);
        return;
      }
      if (typeof value !== "object") return;
      const url = sourceUrl(value.portal || value.url || value.host || value.server || value.m3u, true);
      if (url) {
        const user = value.username || value.user;
        const pass = value.password || value.pass;
        const name = typeof value.name === "string" ? value.name : "";
        const macs = value.macs || value.mac;
        if (user && pass) addXtream(url, String(user), String(pass), name);
        else if (macs && value.source_type !== "m3u") {
          for (const mac of Array.isArray(macs) ? macs : [macs]) add(url, "portal", String(mac), name);
        } else {
          addPlaylist(url, name, [value.kind, value.source_type, value.playlist_mode].includes("m3u"));
        }
        return;
      }
      for (const key of ["profiles", "portals", "portalGroups", "xtream", "m3u", "playlists", "servers", "connections", "sources", "data"]) {
        parseJson(value[key], depth + 1);
      }
    }

    if (/^\s*[[{]/.test(text)) {
      let json;
      try { json = JSON.parse(text); } catch (_) {}
      if (json) parseJson(json);
      else parseText(text);
    } else {
      parseText(text);
    }
    return { list, duplicates };
  }

  const notice = $("importNotice");
  const savedNotice = $("importSaved");
  const results = $("importResults");
  const resultList = $("importRows");
  const progress = $("importProgress");
  let rows = [], duplicates = 0, job = null, fileRequest = 0;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function updateRow(row) {
    row.badge.textContent = row.saved ? "Saved" : statusLabels[row.status];
    row.badge.dataset.status = row.saved ? "working" : row.status;
    row.details.textContent = row.label + (row.expiry ? " · Expiry " + row.expiry : "") +
      (row.previouslySaved ? " · Already saved" : "");
    row.check.disabled = row.saved || row.previouslySaved || row.status !== "working";
    if (row.check.disabled) row.check.checked = false;
    row.button.disabled = row.check.disabled;
  }

  function renderRows() {
    const fragment = document.createDocumentFragment();
    for (const [index, row] of rows.entries()) {
      const li = element("li", "import-row");
      const identity = element("div", "import-identity");
      const suffix = row.kind === "portal" ? " · MAC …" + row.profile.mac.slice(-5) : "";
      row.label = kinds[row.kind] + suffix + " · #" + (index + 1);
      identity.append(element("strong", "", row.host));
      row.details = element("small");
      identity.append(row.details);
      row.badge = element("span", "import-status");
      row.check = element("input");
      row.check.type = "checkbox";
      row.check.setAttribute("aria-label", "Select " + row.host + " " + row.label);
      row.check.addEventListener("change", updateControls);
      row.button = element("button", "btn", "Add");
      row.button.type = "button";
      row.button.setAttribute("aria-label", "Add " + row.host + " " + row.label);
      row.button.addEventListener("click", () => addRows([row]));
      updateRow(row);
      li.append(row.check, identity, row.badge, row.button);
      fragment.append(li);
    }
    resultList.replaceChildren(fragment);
  }

  function updateControls() {
    const working = rows.filter((row) => row.status === "working");
    $("importWorking").disabled = !working.length;
    $("importAll").disabled = !working.some((row) => !row.check.disabled);
    $("importSelected").disabled = !working.some((row) => row.check.checked && !row.check.disabled);
    $("importCheck").hidden = !!job || !rows.length;
    $("importStop").hidden = !job;
    const pending = rows.filter((row) => ["pending", "checking"].includes(row.status)).length;
    const done = rows.length - pending;
    progress.max = rows.length || 1;
    progress.value = done;
    notice.className = "connection-result";
    notice.textContent = rows.length + " found · " + duplicates + " duplicates removed · " + done + " checked · " +
      working.length + " working · " + (done - working.length) + " not verified" + (pending ? " · " + pending + " pending" : "");
  }

  async function checkRows() {
    const controller = new AbortController();
    job = controller;
    const queue = rows.filter((row) => !row.saved);
    for (const row of queue) {
      row.status = "pending";
      row.expiry = "";
      updateRow(row);
    }
    updateControls();
    // Keep the checks light enough for a phone and avoid testing one provider concurrently.
    const hosts = new Set();
    async function run() {
      while (!controller.signal.aborted) {
        const row = queue.find((candidate) => candidate.status === "pending" && !hosts.has(candidate.host));
        if (!row) return;
        hosts.add(row.host);
        row.status = "checking";
        updateRow(row);
        try {
          const result = await engine.checkImportedProfile(row.profile, controller.signal);
          Object.assign(row, controller.signal.aborted ? { status: "pending" } : result);
        } catch (_) {
          row.status = controller.signal.aborted ? "pending" : "unreachable";
        } finally {
          hosts.delete(row.host);
        }
        if (job !== controller) return;
        updateRow(row);
        updateControls();
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, queue.length) }, run));
    if (job !== controller) return;
    job = null;
    updateControls();
  }

  async function addRows(chosen) {
    const selected = chosen.filter((row) => !row.check.disabled);
    if (!selected.length) return;
    savedNotice.hidden = false;
    try {
      const { saved, duplicates: existing } = engine.appendProfiles(selected.map(({ profile, expiry }) => ({
        ...profile, expiry: expiry || "", state: "Working", health: "working",
      })));
      for (const row of selected) {
        row.saved = true;
        updateRow(row);
      }
      updateControls();
      savedNotice.className = "connection-result good";
      savedNotice.textContent = saved + " added to this browser · " + existing + " already saved.";
      await loadManager();
      document.dispatchEvent(new Event("us-servers-imported"));
    } catch (_) {
      savedNotice.className = "connection-result bad";
      savedNotice.textContent = "The browser could not save these servers. Free some storage and try again.";
    }
  }

  function download(which) {
    const lines = rows.filter((row) => which === "cleaned" || row.status === "working").map(({ kind, profile }) =>
      kind === "portal" ? profile.portal + "|" + profile.mac : profile.portal
    );
    if (!lines.length) return;
    const link = element("a");
    link.href = URL.createObjectURL(new Blob([lines.join("\n") + "\n"], { type: "text/plain;charset=utf-8" }));
    link.download = "UltraStalker-" + which + ".txt";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
  }

  $("importFile").addEventListener("change", async (event) => {
    const [file] = event.target.files;
    event.target.value = "";
    if (!file) return;
    const request = ++fileRequest;
    if (job) job.abort();
    job = null;
    rows = [];
    duplicates = 0;
    results.hidden = true;
    savedNotice.hidden = true;
    updateControls();
    notice.textContent = "Reading " + file.name + "…";
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Choose a server file under 5 MB.");
      const bytes = await file.arrayBuffer();
      const start = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
      const encoding = start[0] === 0xff && start[1] === 0xfe ? "utf-16le"
        : start[0] === 0xfe && start[1] === 0xff ? "utf-16be" : "utf-8";
      const parsed = parseFile(new TextDecoder(encoding).decode(bytes));
      if (request !== fileRequest) return;
      await engine.ready;
      if (request !== fileRequest) return;
      if (!parsed.list.length) throw new Error("No server subscriptions found. Use Stalker URL and MAC pairs, Xtream details, or M3U subscription links.");
      if (parsed.list.length > 1000) throw new Error("This file has more than 1,000 subscriptions. Split it into smaller server files.");
      rows = parsed.list;
      duplicates = parsed.duplicates;
      const existing = new Set(engine.activeProfiles().map((p) => engine.keyText(engine.profileKey(p))));
      for (const row of rows) if (existing.has(row.key)) row.previouslySaved = true;
      renderRows();
      results.hidden = false;
      checkRows();
    } catch (error) {
      if (request !== fileRequest) return;
      notice.className = "connection-result bad";
      notice.textContent = error.message || "The file could not be read.";
    }
  });

  $("importCheck").addEventListener("click", () => checkRows());
  $("importStop").addEventListener("click", () => job?.abort());
  $("importClean").addEventListener("click", () => download("cleaned"));
  $("importWorking").addEventListener("click", () => download("working"));
  $("importSelected").addEventListener("click", () => addRows(rows.filter((row) => row.check.checked)));
  $("importAll").addEventListener("click", () => addRows(rows));
})();
