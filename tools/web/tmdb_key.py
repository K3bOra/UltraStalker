#!/usr/bin/env python3
"""Print the TMDB key bundled in the plugin package, for the relay Worker.

Used only by .github/workflows/web-relay.yml, which pipes the value straight
into `wrangler secret put TMDB_KEY` so it is never written to the repo or the
log. Decodes builtin_credentials.py without running any of its code.
"""
import ast
import base64
import hashlib
import io
import sys
import tarfile
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NAME = "TMDB_API_KEY"


def member(ipk, suffix):
    data = Path(ipk).read_bytes()
    if not data.startswith(b"!<arch>\n"):
        raise SystemExit("not an ipk")
    pos = 8
    while pos < len(data):
        head = data[pos:pos + 60]
        name = head[:16].decode().strip().rstrip("/")
        size = int(head[48:58].decode().strip())
        body = data[pos + 60:pos + 60 + size]
        pos += 60 + size + (size & 1)
        if name.startswith("data.tar"):
            tar = tarfile.open(fileobj=io.BytesIO(body), mode="r:*")
            for m in tar.getmembers():
                if m.name.endswith(suffix):
                    return tar.extractfile(m).read().decode("utf-8")
    raise SystemExit("builtin_credentials.py not found")


def main():
    ipk = sys.argv[1] if len(sys.argv) > 1 else ROOT / "packages" / "Ultra_Stalker_Final.ipk"
    tree = ast.parse(member(ipk, "/builtin_credentials.py"))
    blobs = {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(getattr(t, "id", "") == "_BLOBS" for t in node.targets):
            blobs = ast.literal_eval(node.value)
    payload = blobs.get(NAME)
    if not payload:
        raise SystemExit("no bundled TMDB key")
    encrypted = base64.b85decode(payload.encode("ascii"))
    seed = hashlib.sha256(("UltraStalker|builtin|%s|R253" % NAME).encode("utf-8")).digest()
    stream, counter = bytearray(), 0
    while len(stream) < len(encrypted):
        stream.extend(hashlib.sha256(seed + counter.to_bytes(4, "big")).digest())
        counter += 1
    sys.stdout.write(zlib.decompress(bytes(a ^ b for a, b in zip(encrypted, stream))).decode("utf-8").strip())


if __name__ == "__main__":
    main()
