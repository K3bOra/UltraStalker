#!/usr/bin/env python3
"""Prepare and verify official Ultra Stalker releases without executing the IPK."""
import argparse
import ast
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import tarfile

REPO = 'K3bOra/UltraStalker'
PACKAGE = 'enigma2-plugin-extensions-ultrastalker'
ASSET = 'Ultra_Stalker_Final.ipk'
PREFIX = 'usr/lib/enigma2/python/Plugins/Extensions/UltraStalker/'
BASE = Path(__file__).resolve().parents[1]
LIMIT = 64 * 1024 * 1024


def members(payload):
    if payload[:8] != b'!<arch>\n':
        raise ValueError('Not an IPK archive')
    offset, result = 8, {}
    while offset < len(payload):
        header = payload[offset:offset + 60]
        if len(header) != 60 or header[-2:] != b'`\n':
            raise ValueError('Invalid IPK member header')
        size = int(header[48:58].strip())
        name = header[:16].decode('ascii').strip().rstrip('/')
        if size < 0 or name in result:
            raise ValueError('Invalid or duplicate IPK member')
        offset += 60
        result[name] = payload[offset:offset + size]
        if len(result[name]) != size:
            raise ValueError('Truncated IPK member')
        offset += size + size % 2
    if offset != len(payload) or set(result) != {'debian-binary', 'control.tar.gz', 'data.tar.gz'} or result['debian-binary'] != b'2.0\n':
        raise ValueError('Unexpected IPK archive layout')
    return result


def inspect_package(path):
    payload = path.read_bytes()
    if path.name != ASSET or not 0 < len(payload) <= LIMIT:
        raise ValueError('Unexpected IPK filename or size')
    parts = members(payload)
    with tarfile.open(fileobj=io.BytesIO(parts['control.tar.gz']), mode='r:gz') as archive:
        controls = [m for m in archive if m.name.removeprefix('./') == 'control' and m.isfile()]
        if len(controls) != 1 or controls[0].size > 16384:
            raise ValueError('Missing or invalid package control')
        control = archive.extractfile(controls[0]).read().decode('utf-8')
    def field(name):
        matches = re.findall(r'^' + name + r':\s*(\S+)', control, re.M)
        if len(matches) != 1:
            raise ValueError('Missing or duplicate control field: ' + name)
        return matches[0]
    if field('Package') != PACKAGE or field('Architecture') != 'all':
        raise ValueError('Wrong plugin or architecture')
    version = field('Version')
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('Only stable package versions may be released')
    present, values, payload_hashes = set(), {}, {}
    payload_manifest = None
    with tarfile.open(fileobj=io.BytesIO(parts['data.tar.gz']), mode='r:gz') as archive:
        for item in archive:
            normalized = item.name.removeprefix('./')
            if item.name.startswith('/') or '..' in PurePosixPath(item.name).parts or not (item.isdir() or item.isfile()):
                raise ValueError('Unsafe package path or entry: ' + item.name)
            if item.isfile():
                if normalized in present:
                    raise ValueError('Duplicate package path')
                present.add(normalized)
                if normalized.startswith(PREFIX):
                    data = archive.extractfile(item).read()
                    relative = normalized[len(PREFIX):]
                    if relative == '.install_payload.sha256':
                        payload_manifest = data.decode('utf-8')
                    else:
                        payload_hashes[relative] = hashlib.sha256(data).hexdigest()
                if normalized == PREFIX + 'version.py':
                    tree = ast.parse(archive.extractfile(item).read().decode('utf-8'))
                    for node in tree.body:
                        if isinstance(node, ast.Assign):
                            for target in node.targets:
                                if isinstance(target, ast.Name) and target.id in ('PLUGIN_VERSION', 'PLUGIN_REVISION'):
                                    values[target.id] = ast.literal_eval(node.value)
    if payload_manifest is None:
        raise ValueError('Missing internal payload checksum manifest')
    checked = set()
    for line in payload_manifest.splitlines():
        match = re.fullmatch(r'([a-fA-F0-9]{64}) [ *](.+)', line)
        if not match:
            raise ValueError('Malformed internal payload checksum')
        digest, relative = match.groups()
        relative = relative.removeprefix('./')
        if relative in checked or payload_hashes.get(relative) != digest.lower():
            raise ValueError('Internal payload checksum mismatch or duplicate: ' + relative)
        checked.add(relative)
    if checked != set(payload_hashes):
        raise ValueError('Internal payload checksum coverage is incomplete')
    required = ('__init__.py', 'plugin.py', 'plugin.png', 'ui.py', 'updater.py', 'version.py', 'services/player.py')
    missing = [name for name in required if PREFIX + name not in present]
    if missing:
        raise ValueError('Incomplete plugin: ' + ', '.join(missing))
    if values.get('PLUGIN_VERSION') != version or type(values.get('PLUGIN_REVISION')) is not int or values['PLUGIN_REVISION'] < 1:
        raise ValueError('Runtime version/revision does not match package metadata')
    return {'version': version, 'revision': values['PLUGIN_REVISION'],
            'name': 'Ultra Stalker Final V' + version,
            'ipk': 'https://github.com/' + REPO + '/releases/download/v' + version + '/' + ASSET,
            'sha256': hashlib.sha256(payload).hexdigest(), 'size': len(payload)}


def prepare(version=None, revision=None, name=None, notes_en=None, notes_ar=None):
    if os.environ.get('GITHUB_REPOSITORY', REPO).lower() != REPO.lower():
        raise ValueError('Release workflow belongs to ' + REPO)
    packages = list((BASE / 'packages').glob('*.ipk'))
    if len(packages) != 1:
        raise ValueError('Keep exactly one current IPK in packages/')
    meta = inspect_package(packages[0])
    if version is not None and version != meta['version']:
        raise ValueError('Requested version differs from IPK')
    if revision is not None and revision != meta['revision']:
        raise ValueError('Requested revision differs from IPK')
    if name is not None:
        meta['name'] = name
    notes = json.loads((BASE / 'release-notes.json').read_text(encoding='utf-8'))
    if notes.get('version') != meta['version']:
        raise ValueError('Release notes version differs from IPK')
    for key in ('notes', 'notes_ar'):
        if not isinstance(notes.get(key), list) or not notes[key] or not all(isinstance(x, str) and x.strip() for x in notes[key]):
            raise ValueError('Missing release notes: ' + key)
    en = notes_en or '\n'.join('• ' + x for x in notes['notes'])
    ar = notes_ar or '\n'.join('• ' + x for x in notes['notes_ar'])
    meta.update(notes=en, notes_i18n={'en': en, 'ar': ar})
    dest = BASE / 'dist'
    dest.mkdir(exist_ok=True)
    for old in dest.glob('*.ipk'):
        old.unlink()
    shutil.copyfile(packages[0], dest / ASSET)
    shutil.copyfile(BASE / 'install.sh', dest / 'install.sh')
    (dest / 'update.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (dest / 'SHA256SUMS').write_text(''.join(hashlib.sha256((dest / n).read_bytes()).hexdigest() + '  ' + n + '\n' for n in (ASSET, 'update.json', 'install.sh')), encoding='utf-8')
    title = 'Ultra Stalker Final'
    (dest / 'release-info.json').write_text(json.dumps({'tag': 'v' + meta['version'], 'version': meta['version'], 'title': title}) + '\n')
    body = '# ' + title + '\n\n## What’s new\n\n' + '\n'.join('- ' + x for x in notes['notes']) + '\n\n## الجديد بالعربي\n\n' + '\n'.join('- ' + x for x in notes['notes_ar']) + '\n\n## Install / التثبيت\n\n```sh\nwget -qO- https://raw.githubusercontent.com/' + REPO + '/main/install.sh | /bin/sh\n```\n\nEnigma2 · Python 3.12–3.15 · opkg · root\n\nAttach the IPK for manual installation. The installer and plugin updater use the attached update.json. SHA256SUMS covers the IPK, manifest and installer.\n'
    (dest / 'notes.md').write_text(body, encoding='utf-8')
    print('Prepared v%s / revision %d: %s (%d bytes)' % (meta['version'], meta['revision'], meta['sha256'], meta['size']))


def verify(directory):
    expected = json.loads((BASE / 'dist/update.json').read_text(encoding='utf-8'))
    actual = json.loads((directory / 'update.json').read_text(encoding='utf-8'))
    if actual != expected:
        raise ValueError('Downloaded manifest differs from prepared manifest')
    if [p.name for p in directory.glob('*.ipk')] != [ASSET]:
        raise ValueError('Published release must have exactly the official IPK')
    info = inspect_package(directory / ASSET)
    if any(actual.get(key) != value for key, value in info.items()):
        raise ValueError('Downloaded IPK differs from manifest')
    for name in (ASSET, 'update.json', 'install.sh', 'SHA256SUMS'):
        if (directory / name).read_bytes() != (BASE / 'dist' / name).read_bytes():
            raise ValueError('Published asset differs: ' + name)
    print('All four downloaded release assets verified')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify-published', type=Path)
    parser.add_argument('--version')
    parser.add_argument('--revision', type=int)
    parser.add_argument('--name')
    parser.add_argument('--notes-en')
    parser.add_argument('--notes-ar')
    args = parser.parse_args()
    if args.verify_published:
        verify(args.verify_published)
    else:
        prepare(args.version, args.revision, args.name, args.notes_en, args.notes_ar)
