/* Ultra Stalker Web — Remove button for Manage Servers, and the Backup panel. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const tr = (v) => (window.usTr ? window.usTr(v) : String(v));

  /* ----------------------------------------------------- remove a server */
  const del = $("managerDeleteBtn");
  const syncDelete = () => {
    if (del) del.disabled = !managerCurrent || managerSaving;
  };
  if (del) {
    $("managerSelect").addEventListener("change", syncDelete);
    document.querySelectorAll(".manager-group-tab").forEach((b) => b.addEventListener("click", () => setTimeout(syncDelete)));
    setInterval(syncDelete, 600);
    del.addEventListener("click", async () => {
      if (!managerCurrent) return;
      const label = managerCurrent.name || managerCurrent.url;
      if (!confirm("Remove “" + label + "” from this site?")) return;
      del.disabled = true;
      try {
        const res = await fetch("api/connection-delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: managerCurrent.key }) });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "Remove failed");
        await loadManager();
        $("managerResult").className = "connection-result good";
        $("managerResult").textContent = "Removed “" + label + "”.";
        refreshBackup();
      } catch (e) {
        $("managerResult").className = "connection-result bad";
        $("managerResult").textContent = e.message || "Remove failed";
      } finally {
        syncDelete();
      }
    });
  }

  /* --------------------------------------------------------------- backup */
  const result = $("backupResult");
  const badge = $("backupBadgeText");
  function say(text, kind) {
    result.className = "connection-result" + (kind ? " " + kind : "");
    result.textContent = text;
  }
  function when(ms) {
    if (!ms) return "";
    try {
      return new Date(ms).toLocaleString();
    } catch (_) {
      return "";
    }
  }
  async function refreshBackup(message, kind) {
    try {
      const s = await USBackup.status();
      badge.textContent = s.sources + " sources · " + s.favorites + " favorites";
      if (message) return say(message, kind);
      if (s.base) say("Loaded receiver backup: " + s.base.name + (s.base.created_at ? " (made " + when(s.base.created_at) + ")" : "") + ".\nSaving a backup keeps everything else from that file (settings, history, keys).");
      else if (s.sources) say("No receiver backup loaded yet. You can still save a backup, but the receiver's own settings and watch history would go back to defaults after restoring it. Load a receiver backup first to keep them.");
      else say("Nothing saved on this site yet. Load your receiver backup to bring your servers and Favorites here.");
    } catch (e) {
      say("This browser blocks local storage, so backups can't be kept here. " + (e.message || ""), "bad");
    }
  }
  $("backupFile").addEventListener("change", async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!file) return;
    const s = await USBackup.status().catch(() => ({ sources: 0, favorites: 0 }));
    if ((s.sources || s.favorites) && !confirm("Replace the " + s.sources + " servers and " + s.favorites + " favorites on this site with the ones in " + file.name + "?")) return;
    say("Reading " + file.name + "…");
    try {
      const r = await USBackup.importFile(file);
      let msg = "Loaded " + file.name + ":\n" + r.portals + " Stalker portals, " + r.playlists + " Xtream / M3U, " + r.favorites + " favorites.";
      if (r.receiverOnly) msg += "\n" + r.receiverOnly + " playlist file(s) live on the receiver's disk and can only be opened there.";
      await loadManager();
      refreshBackup(msg, "good");
    } catch (e) {
      say(e.message || "This backup could not be read.", "bad");
    }
  });
  $("backupSaveBtn").addEventListener("click", async () => {
    const b = $("backupSaveBtn");
    b.disabled = true;
    say("Preparing the backup…");
    try {
      const r = await USBackup.exportZip();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(r.blob);
      a.download = r.name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 4000);
      say("Saved " + r.name + " (" + r.sources + " servers, " + r.favorites + " favorites).\nCopy it to /media/hdd/UltraStalker/Backup on the receiver, then open Backup & Restore › Restore backup in Ultra Stalker." + (r.fromReceiver ? "" : "\nNo receiver backup was loaded, so the receiver's settings will go back to defaults after this restore."), "good");
    } catch (e) {
      say(e.message || "The backup could not be made.", "bad");
    } finally {
      b.disabled = false;
    }
  });
  refreshBackup();
  ["connSaveBtn", "managerSaveBtn"].forEach((id) => $(id) && $(id).addEventListener("click", () => setTimeout(() => refreshBackup(), 900)));
  if (location.hash) {
    const el = document.querySelector(location.hash);
    if (el) setTimeout(() => el.scrollIntoView({ block: "start" }), 120);
  }
})();
