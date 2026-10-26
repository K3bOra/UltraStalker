# Packages

This folder holds the current Ultra Stalker IPK. The installer and the in-plugin
online updater download it **straight from this repository**, so no GitHub
release is required.

- **`Ultra_Stalker_Final.ipk`** — the current build (see [`../update.json`](../update.json)
  for its version, revision, size and SHA-256).

## Publishing a new version

1. Drop the new `Ultra_Stalker_Final.ipk` here (same file name).
2. Run [`../scripts/prepare_release.py`](../scripts/prepare_release.py) to refresh
   `../update.json` (version, revision, size and SHA-256).
3. Commit both files to `main`.

Every receiver reads `update.json` and the IPK from `main`, so the update reaches
users as soon as the commit lands — no release step needed.
