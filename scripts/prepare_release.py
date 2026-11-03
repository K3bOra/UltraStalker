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
DREAM_ASSET = 'Ultra_Stalker_DreamOS_Py2.deb'
ASSETS = (ASSET, DREAM_ASSET)
MANIFESTS = ('update.json', 'update-ipk.json', 'update-dreamos-py2.json', 'update-dreamos.json')
RELEASE_ASSETS = ASSETS + MANIFESTS + ('install.sh', 'RELEASE_NOTES.md', 'SHA256SUMS')
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
    controls=[n for n in result if re.fullmatch(r'control\.tar\.(gz|xz)',n)]
    data=[n for n in result if re.fullmatch(r'data\.tar\.(gz|xz)',n)]
    if offset != len(payload) or len(controls)!=1 or len(data)!=1 or set(result)!={'debian-binary',*controls,*data} or result['debian-binary'] != b'2.0\n':
        raise ValueError('Unexpected IPK archive layout')
    return result


def inspect_package(path):
    payload = path.read_bytes()
    if path.name not in ASSETS or not 0 < len(payload) <= LIMIT:
        raise ValueError('Unexpected IPK filename or size')
    parts = members(payload)
    with tarfile.open(fileobj=io.BytesIO(parts[next(n for n in parts if n.startswith('control.tar.'))]), mode='r:*') as archive:
        controls = [m for m in archive if m.name.removeprefix('./') == 'control' and m.isfile()]
        if len(controls) != 1 or controls[0].size > 16384:
            raise ValueError('Missing or invalid package control')
        control = archive.extractfile(controls[0]).read().decode('utf-8')
        md5_entries=[m for m in archive if m.name.removeprefix('./')=='md5sums' and m.isfile()]
        md5_manifest=archive.extractfile(md5_entries[0]).read().decode('utf-8') if len(md5_entries)==1 else None
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
    present, values, payload_hashes, package_md5 = set(), {}, {}, {}
    payload_manifest = None
    with tarfile.open(fileobj=io.BytesIO(parts[next(n for n in parts if n.startswith('data.tar.'))]), mode='r:*') as archive:
        for item in archive:
            normalized = item.name.removeprefix('./')
            if item.name.startswith('/') or '..' in PurePosixPath(item.name).parts or not (item.isdir() or item.isfile()):
                raise ValueError('Unsafe package path or entry: ' + item.name)
            if item.isfile():
                if normalized in present:
                    raise ValueError('Duplicate package path')
                present.add(normalized)
                data=archive.extractfile(item).read()
                package_md5[normalized]=hashlib.md5(data).hexdigest()
                if normalized.endswith(('.pyc','.pyo')) or '__pycache__' in PurePosixPath(normalized).parts:
                    raise ValueError('Bundled Python bytecode: '+normalized)
                if normalized.endswith('.py'):ast.parse(data.decode('utf-8'),filename=normalized)
                if normalized.startswith(PREFIX):
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
    if payload_manifest is None and path.suffix=='.ipk':
        raise ValueError('Missing internal payload checksum manifest')
    checked = set()
    for line in (payload_manifest or '').splitlines():
        match = re.fullmatch(r'([a-fA-F0-9]{64}) [ *](.+)', line)
        if not match:
            raise ValueError('Malformed internal payload checksum')
        digest, relative = match.groups()
        relative = relative.removeprefix('./')
        if relative in checked or payload_hashes.get(relative) != digest.lower():
            raise ValueError('Internal payload checksum mismatch or duplicate: ' + relative)
        checked.add(relative)
    if payload_manifest is not None and checked != set(payload_hashes):
        raise ValueError('Internal payload checksum coverage is incomplete')
    if path.suffix=='.deb':
        if not md5_manifest:raise ValueError('Missing DEB checksum inventory')
        checked_md5={}
        for line in md5_manifest.splitlines():
            digest,relative=line.split('  ',1)
            if relative in checked_md5 or package_md5.get(relative)!=digest:raise ValueError('DEB checksum mismatch: '+relative)
            checked_md5[relative]=digest
        if set(checked_md5)!=set(package_md5):raise ValueError('DEB checksum coverage incomplete')
    required = ('__init__.py', 'plugin.py', 'plugin.png', 'ui.py', 'updater.py', 'version.py', 'services/player.py')
    missing = [name for name in required if PREFIX + name not in present]
    if missing:
        raise ValueError('Incomplete plugin: ' + ', '.join(missing))
    if values.get('PLUGIN_VERSION') != version or type(values.get('PLUGIN_REVISION')) is not int or values['PLUGIN_REVISION'] < 1:
        raise ValueError('Runtime version/revision does not match package metadata')
    return {'version': version, 'revision': values['PLUGIN_REVISION'],
            'name': 'Ultra Stalker Final V' + version,
            ('ipk' if path.suffix=='.ipk' else 'deb'): 'https://github.com/' + REPO + '/releases/download/v' + version + '/' + path.name,
            'sha256': hashlib.sha256(payload).hexdigest(), 'size': len(payload)}


def prepare(version=None, revision=None, name=None, notes_en=None, notes_ar=None):
    if os.environ.get('GITHUB_REPOSITORY', REPO).lower()!=REPO.lower():
        raise ValueError('Release workflow belongs to '+REPO)
    directory=BASE/'packages'
    if set(p.name for p in directory.iterdir() if p.suffix in ('.ipk','.deb'))!=set(ASSETS):
        raise ValueError('Keep exactly one official IPK and one DreamOS DEB in packages/')
    metas=[inspect_package(directory/asset) for asset in ASSETS]
    meta,dream=metas
    if any(m['version']!=meta['version'] or m['revision']!=meta['revision'] for m in metas):
        raise ValueError('Both platform versions and revisions must match')
    if version is not None and version!=meta['version']:raise ValueError('Requested version differs from package')
    if revision is not None and revision!=meta['revision']:raise ValueError('Requested revision differs from package')
    notes=json.loads((BASE/'release-notes.json').read_text(encoding='utf-8'))
    if notes.get('version')!=meta['version']:raise ValueError('Release notes version differs from packages')
    for key in ('notes','notes_ar'):
        if not isinstance(notes.get(key),list) or not notes[key] or not all(isinstance(x,str) and x.strip() for x in notes[key]):
            raise ValueError('Missing release notes: '+key)
    en=notes_en or '\n'.join('• '+x for x in notes['notes'])
    ar=notes_ar or '\n'.join('• '+x for x in notes['notes_ar'])
    for m in metas:
        if name:m['name']=name
        m.update(notes=en,notes_i18n={'en':en,'ar':ar})
    dream['platform']='dreamos-py2'
    dest=BASE/'dist';dest.mkdir(exist_ok=True)
    for filename in RELEASE_ASSETS:
        path=dest/filename
        if path.exists():path.unlink()
    for asset in ASSETS:shutil.copyfile(directory/asset,dest/asset)
    shutil.copyfile(BASE/'install.sh',dest/'install.sh')
    for filenames,m in [(MANIFESTS[:2],meta),(MANIFESTS[2:],dream)]:
        for filename in filenames:(dest/filename).write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    title='Ultra Stalker Final V'+meta['version']+' - Enigma2 & DreamOS'
    body='# '+title+'\n\n**ipk '+meta['version']+' — Open / Enigma2**\n`'+ASSET+'` · `update-ipk.json`\n\n**dreamos '+meta['version']+' — Python 2.7**\n`'+DREAM_ASSET+'` · `update-dreamos.json`\n\n## What’s new\n\n'+'\n'.join('- '+x for x in notes['notes'])+'\n\n## الجديد بالعربي\n\n'+'\n'.join('- '+x for x in notes['notes_ar'])+'\n\n## Installation / التثبيت\n\nOpen: IPK (Python 3.12–3.15). DreamOS: DEB (Python 2.7).\nThe plugin updater uses the attached platform manifest. Existing manifest names remain supported.\n\n```sh\nwget -qO- https://raw.githubusercontent.com/'+REPO+'/main/install.sh | /bin/sh\n```\nThe command above is for Open/Python 3. DreamOS uses the DEB or its plugin updater.\n'
    (dest/'notes.md').write_text(body,encoding='utf-8')
    (dest/'RELEASE_NOTES.md').write_text(body,encoding='utf-8')
    (dest/'release-info.json').write_text(json.dumps({'tag':'v'+meta['version'],'version':meta['version'],'title':title})+'\n')
    (dest/'SHA256SUMS').write_text(''.join(hashlib.sha256((dest/n).read_bytes()).hexdigest()+'  '+n+'\n' for n in RELEASE_ASSETS if n!='SHA256SUMS'))
    print('Prepared both platforms v%s / revision %d'%(meta['version'],meta['revision']))


def verify(directory):
    dest=BASE/'dist'
    for name in RELEASE_ASSETS:
        if (directory/name).read_bytes()!=(dest/name).read_bytes():raise ValueError('Published asset differs: '+name)
    for asset,manifest in [(ASSET,'update.json'),(DREAM_ASSET,'update-dreamos-py2.json')]:
        info=inspect_package(directory/asset)
        actual=json.loads((directory/manifest).read_text(encoding='utf-8'))
        if any(actual.get(k)!=v for k,v in info.items()):raise ValueError('Package differs from manifest: '+asset)
    print('All nine downloaded release assets verified')


def verify_public():
    import tempfile
    from urllib.request import Request,urlopen
    tag=json.loads((BASE/'dist/release-info.json').read_text())['tag']
    with tempfile.TemporaryDirectory() as temp:
        directory=Path(temp)
        for name in RELEASE_ASSETS:
            url='https://github.com/'+REPO+'/releases/download/'+tag+'/'+name
            with urlopen(Request(url,headers={'User-Agent':'UltraStalker-release-verifier'}),timeout=120) as response:
                payload=response.read(LIMIT+1)
            if len(payload)>LIMIT:raise ValueError('Public asset exceeds limit: '+name)
            (directory/name).write_bytes(payload)
        verify(directory)
    print('Both public platform downloads and all update manifests verified')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify-published', type=Path)
    parser.add_argument('--verify-public', action='store_true')
    parser.add_argument('--version')
    parser.add_argument('--revision', type=int)
    parser.add_argument('--name')
    parser.add_argument('--notes-en')
    parser.add_argument('--notes-ar')
    args = parser.parse_args()
    if args.verify_public:
        verify_public()
    elif args.verify_published:
        verify(args.verify_published)
    else:
        prepare(args.version, args.revision, args.name, args.notes_en, args.notes_ar)

