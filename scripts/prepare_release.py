#!/usr/bin/env python3
"""Refresh update.json for a new Ultra Stalker release.

Reads the IPK in packages/, computes its size and SHA-256, verifies the package
version inside the IPK matches what you pass, and writes update.json pointing at
the official release asset URL.

Usage:
    python3 scripts/prepare_release.py --version 9.2.3 --revision 570
    python3 scripts/prepare_release.py --version 9.2.4 --revision 571 \
        --notes-en "Fix ..." --notes-ar "إصلاح ..."

Then create a GitHub release tagged v<version> and attach BOTH
packages/Ultra_Stalker_Final.ipk and update.json.
"""
import argparse
import hashlib
import io
import json
import os
import re
import sys
import tarfile

REPO = "K3bOra/UltraStalker"
PACKAGE = "enigma2-plugin-extensions-ultrastalker"
ASSET = "Ultra_Stalker_Final.ipk"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read_control_version(payload):
    if payload[:8] != b"!<arch>\n":
        raise SystemExit("packages/%s is not a valid IPK" % ASSET)
    off = 8
    while off + 60 <= len(payload):
        header = payload[off:off + 60]
        size = int(header[48:58].strip())
        name = header[:16].decode("ascii").strip().rstrip("/")
        off += 60
        body = payload[off:off + size]
        off += size + size % 2
        if name == "control.tar.gz":
            with tarfile.open(fileobj=io.BytesIO(body), mode="r:gz") as tar:
                member = next(m for m in tar if m.name.lstrip("./") == "control")
                control = tar.extractfile(member).read().decode("utf-8")
            pkg = re.search(r"^Package:\s*(\S+)", control, re.M)
            ver = re.search(r"^Version:\s*(\S+)", control, re.M)
            return (pkg.group(1) if pkg else ""), (ver.group(1) if ver else "")
    raise SystemExit("control.tar.gz not found in IPK")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", required=True, help="e.g. 9.2.3")
    ap.add_argument("--revision", required=True, type=int, help="e.g. 570")
    ap.add_argument("--name", default=None)
    ap.add_argument("--notes-en", default=None)
    ap.add_argument("--notes-ar", default=None)
    args = ap.parse_args()

    if not re.fullmatch(r"\d+\.\d+\.\d+", args.version):
        raise SystemExit("version must look like 9.2.3")

    ipk_path = os.path.join(ROOT, "packages", ASSET)
    if not os.path.exists(ipk_path):
        raise SystemExit("missing packages/%s" % ASSET)
    payload = open(ipk_path, "rb").read()

    pkg, ctrl_ver = read_control_version(payload)
    if pkg != PACKAGE:
        raise SystemExit("package name inside IPK is %r, expected %r" % (pkg, PACKAGE))
    if ctrl_ver != args.version:
        raise SystemExit(
            "version inside IPK is %r but you passed %r; rebuild the IPK so they match"
            % (ctrl_ver, args.version)
        )

    manifest_path = os.path.join(ROOT, "update.json")
    old = {}
    if os.path.exists(manifest_path):
        try:
            old = json.load(open(manifest_path))
        except Exception:
            old = {}

    notes_en = args.notes_en or (old.get("notes_i18n", {}) or {}).get("en") or old.get("notes") or ""
    notes_ar = args.notes_ar or (old.get("notes_i18n", {}) or {}).get("ar") or notes_en

    manifest = {
        "version": args.version,
        "revision": args.revision,
        "name": args.name or ("Ultra Stalker Final V%s" % args.version),
        "ipk": "https://raw.githubusercontent.com/%s/main/packages/%s" % (REPO, ASSET),
        "sha256": hashlib.sha256(payload).hexdigest(),
        "size": len(payload),
        "notes": notes_en,
        "notes_i18n": {"en": notes_en, "ar": notes_ar},
    }
    with open(manifest_path, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    print("update.json written:")
    print("  version : %s (revision %d)" % (manifest["version"], manifest["revision"]))
    print("  size    : %d bytes" % manifest["size"])
    print("  sha256  : %s" % manifest["sha256"])
    print("  ipk     : %s" % manifest["ipk"])
    print("\nNext: commit packages/%s and update.json to main." % ASSET)
    print("      The installer and online updater read both straight from the repo.")


if __name__ == "__main__":
    sys.exit(main())
