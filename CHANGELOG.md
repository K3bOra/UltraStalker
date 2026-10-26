# Ultra Stalker — Change Log

> For the authoritative current version and localized update notes, see [`update.json`](update.json). Download links and hashes in that file are used by the online-update mechanism.

## V9.2.3 (Revision 570) — 2026-10-26

- Subtitle preservation fix for late-mounted storage (HDD/USB that appears after boot).
- Buffered reader handoff fix for smoother, more reliable playback.
- General stability and reliability improvements.
- **Clean release model:** online updates and `install.sh` now read `update.json` from the **latest** GitHub release, and accept any official Ultra Stalker release asset (no single frozen download location). The package name is unchanged, so this installs as a normal upgrade over earlier builds.

## Documentation refresh — 2026-10-26

- Reorganized the public README with an Enigma2 introduction, premium gallery, categorized feature overview, installation instructions and bilingual guidance.
- Added custom dark/red/emerald brand SVG assets for headers and separators.
- Prepared 15 gallery screenshots. The Portal Manager image permanently masks every visible MAC address and the displayed server URL.
- **No plugin, installer, release, or online-update metadata was changed as part of this documentation package.**

## Current installer target

- **Version:** 9.2.3
- **Revision:** 570
- **Manifest:** [`update.json`](update.json)
- **Installer:** [`install.sh`](install.sh)

Refer to the localized notes inside `update.json` for software changes; this file is not a replacement for official release metadata.
