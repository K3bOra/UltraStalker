# Packages

This folder holds the current Ultra Stalker IPK that is published as a GitHub
release asset.

- **`Ultra_Stalker_Final.ipk`** — the current build (see [`../update.json`](../update.json)
  for its version, revision and SHA-256).

## Publishing a new version

1. Drop the new `Ultra_Stalker_Final.ipk` here.
2. Run [`../scripts/prepare_release.py`](../scripts/prepare_release.py) to refresh
   `../update.json` (version, revision, size and SHA-256).
3. Create a GitHub release tagged `v<version>` (e.g. `v9.2.3`) and attach **both**
   `Ultra_Stalker_Final.ipk` and `update.json`.

The online updater and `install.sh` always read `update.json` from the **latest**
published release, so only the newest release needs to be correct.
