#!/usr/bin/env python3
"""Verify both public installer channels without receiver detection or install."""
from pathlib import Path

base = Path(__file__).resolve().parents[1]
source = (base / 'install.sh').read_text(encoding='utf-8')
marker = "<<'ULTRASTALKER_UNIFIED_PY'\n"
if source.count(marker) != 1:
    raise ValueError('Expected the unified installer Python entry point')
embedded = source.split(marker, 1)[1].split('\nULTRASTALKER_UNIFIED_PY', 1)[0]
namespace = {'__name__': 'installer_release_verification'}
exec(compile(embedded, 'install.sh embedded Python', 'exec'), namespace)
for channel in ('ipk', 'dreamos'):
    namespace['main']([channel, '--verify-only'])
print('Both public installer channels verified; no installation performed')
