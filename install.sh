#!/bin/sh
# Ultra Stalker Final - verified official installer.
set -u
if ! command -v python3 >/dev/null 2>&1; then
    printf '%s\n' '[ERROR] Ultra Stalker requires Python 3.12 or newer from the receiver image.'
    exit 1
fi
python3 - "$@" <<'ULTRASTALKER_INSTALL_PY'
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import tarfile
import tempfile
import time
from urllib.parse import urlsplit
from urllib.request import Request, HTTPRedirectHandler, build_opener

REPO = 'K3bOra/UltraStalker'
PACKAGE = 'enigma2-plugin-extensions-ultrastalker'
TITLE = 'Ultra Stalker Final'
LIMIT = 64 * 1024 * 1024
MANIFEST = 'https://github.com/' + REPO + '/releases/latest/download/update.json'
ASSET_RE = re.compile(r'Ultra_?Stalker[-_A-Za-z0-9.]*\.ipk', re.I)


def github_https(url):
    p = urlsplit(url)
    host = p.hostname or ''
    if (p.scheme != 'https' or p.username or p.password or p.port
            or not (host == 'github.com' or host.endswith('.githubusercontent.com'))):
        raise ValueError('Only GitHub HTTPS downloads are allowed')


class GitHubRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        github_https(newurl)
        return HTTPRedirectHandler.redirect_request(self, req, fp, code, msg, headers, newurl)


def download(url, limit):
    github_https(url)
    request = Request(url, headers={'User-Agent': 'UltraStalker-Installer', 'Cache-Control': 'no-cache'})
    progress = limit > 64 * 1024
    if progress:
        print('[DOWNLOAD] Connecting to GitHub package server...', flush=True)
    started = time.monotonic()
    response = build_opener(GitHubRedirect()).open(request, timeout=20)
    try:
        github_https(response.geturl())
        length = response.headers.get('Content-Length', '')
        total = int(length) if length.isdigit() else 0
        if total > limit:
            raise ValueError('Download exceeds size limit')
        data = bytearray()
        reader = getattr(response, 'read1', response.read)
        last_report = 0.0
        while True:
            now = time.monotonic()
            if now - started > 300:
                raise TimeoutError('Download took over five minutes; check the receiver connection and retry')
            chunk = reader(min(16 * 1024, limit + 1 - len(data)))
            if not chunk:
                break
            data.extend(chunk)
            if len(data) > limit:
                raise ValueError('Download exceeds size limit')
            now = time.monotonic()
            if progress and (now - last_report >= 2 or (total and len(data) == total)):
                if total:
                    detail = '%3d%% | %.2f / %.2f MB' % (min(100, len(data) * 100 // total), len(data) / 1048576.0, total / 1048576.0)
                else:
                    detail = '%.2f MB received' % (len(data) / 1048576.0)
                print('\r[DOWNLOAD] ' + detail, end='', flush=True)
                last_report = now
        if total and len(data) != total:
            raise ValueError('Download was interrupted; package is incomplete')
        return bytes(data)
    finally:
        response.close()
        if progress:
            print('', flush=True)


def verify_manifest(meta):
    if not isinstance(meta, dict) or not isinstance(meta.get('version'), str):
        raise ValueError('Invalid release manifest')
    if not re.fullmatch(r'\d+\.\d+\.\d+', meta['version']):
        raise ValueError('Invalid release version')
    if type(meta.get('size')) is not int or not 0 < meta['size'] <= LIMIT:
        raise ValueError('Invalid package size')
    if not isinstance(meta.get('sha256'), str) or not re.fullmatch(r'[a-fA-F0-9]{64}', meta['sha256']):
        raise ValueError('Missing SHA-256')
    if not isinstance(meta.get('ipk'), str):
        raise ValueError('Missing package URL')
    p = urlsplit(meta['ipk'])
    prefix = '/' + REPO + '/releases/download/'
    if (p.scheme != 'https' or p.hostname != 'github.com' or p.username or p.password or p.port
            or p.query or p.fragment or not p.path.startswith(prefix)):
        raise ValueError('Package must belong to the official repository')
    parts = p.path[len(prefix):].split('/')
    if (len(parts) != 2 or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]*', parts[0]) or '..' in parts[0]
            or not ASSET_RE.fullmatch(parts[1])):
        raise ValueError('Invalid release asset URL')
    return meta


def verify_package(meta, payload):
    if len(payload) != meta['size'] or hashlib.sha256(payload).hexdigest() != meta['sha256'].lower():
        raise ValueError('Package size or SHA-256 verification failed')
    if payload[:8] != b'!<arch>\n':
        raise ValueError('Downloaded file is not an IPK')
    offset = 8
    control = None
    while offset + 60 <= len(payload):
        header = payload[offset:offset + 60]
        if header[-2:] != b'`\n':
            raise ValueError('Malformed archive header')
        size = int(header[48:58].strip())
        if size < 0:
            raise ValueError('Malformed archive size')
        name = header[:16].decode('ascii').strip().rstrip('/')
        offset += 60
        body = payload[offset:offset + size]
        if len(body) != size:
            raise ValueError('Truncated archive')
        offset += size + size % 2
        if name == 'control.tar.gz':
            with tarfile.open(fileobj=io.BytesIO(body), mode='r:gz') as archive:
                member = next((m for m in archive if m.name.lstrip('./') == 'control' and m.isfile()), None)
                if member is None or member.size > 16384:
                    raise ValueError('Invalid package metadata')
                control = archive.extractfile(member).read().decode('utf-8')
    if control is None:
        raise ValueError('Missing package metadata')
    for key, expected in [('Package', PACKAGE), ('Version', meta['version']), ('Architecture', 'all')]:
        found = re.search(r'^' + key + r':\s*(\S+)', control, re.M)
        if not found or found.group(1) != expected:
            raise ValueError('Unexpected package ' + key)


def install_args(installed, target, path):
    args = ['opkg', 'install']
    if installed and installed != target:
        def version(v):
            match = re.match(r'^(\d+)\.(\d+)\.(\d+)', v)
            if not match:
                raise ValueError('Unrecognized installed version; no changes made')
            return tuple(int(x) for x in match.groups())
        if version(installed) > version(target):
            raise ValueError('A newer official version is installed; downgrade refused')
    args.append(path)
    return args


def main(argv):
    if sys.version_info[:2] < (3, 12):
        raise RuntimeError('Python 3.12 or newer is required')
    if argv not in ([], ['--verify-only']):
        raise ValueError('Supported option: --verify-only')
    print('\n======================================================', flush=True)
    print(TITLE, flush=True)
    print('======================================================', flush=True)
    print('[1/4] Reading the official GitHub release...', flush=True)
    meta = verify_manifest(json.loads(download(MANIFEST, 128 * 1024).decode('utf-8')))
    print('[2/4] Downloading and verifying the IPK...', flush=True)
    payload = download(meta['ipk'], LIMIT)
    verify_package(meta, payload)
    print('[OK] SHA-256, size, package name and version verified: ' + meta['version'], flush=True)
    if argv == ['--verify-only']:
        print('[VERIFIED] Download verified; no installation performed.', flush=True)
        return
    if os.geteuid() != 0:
        raise RuntimeError('Run this installer as root on the receiver')
    try:
        status = subprocess.check_output(['opkg', 'status', PACKAGE], stderr=subprocess.STDOUT).decode('utf-8', 'replace')
    except subprocess.CalledProcessError:
        status = ''
    found = re.search(r'^Version:\s*(\S+)', status, re.M)
    installed = found.group(1) if found else ''
    if installed == meta['version'] and re.search(r'^Status:.* installed$', status, re.M):
        print('[OK] This official version is already installed.', flush=True)
        return
    args = install_args(installed, meta['version'], '')
    print('[3/4] Refreshing the image package lists once...', flush=True)
    if subprocess.call(['opkg', 'update']):
        print('[WARN] Some image feeds did not refresh; using available package lists.', flush=True)
    fd, path = tempfile.mkstemp(prefix='ultrastalker_official_', suffix='.ipk', dir='/tmp')
    try:
        with os.fdopen(fd, 'wb') as handle:
            handle.write(payload)
        args[-1] = path
        print('[4/4] Installing Ultra Stalker; portals, favorites and settings are preserved...', flush=True)
        if subprocess.call(args):
            raise RuntimeError('OPKG installation failed; review the output above')
        print('[OK] Package installed. Ultra Stalker will finish setup and restart the GUI.', flush=True)
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


if __name__ == '__main__':
    try:
        main(sys.argv[1:])
    except Exception as error:
        print('[ERROR] ' + str(error), file=sys.stderr)
        sys.exit(1)
ULTRASTALKER_INSTALL_PY
install_result=$?
case "$0" in /tmp/ultrastalker_install.sh) rm -f -- "$0" ;; esac
exit "$install_result"
