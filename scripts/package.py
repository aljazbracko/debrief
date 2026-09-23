"""Package only reviewed runtime files. Uses Python's standard library."""
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'manifest.json').read_text())['version']
files = [
    'manifest.json', 'devtools.html', 'devtools.js', 'panel.html', 'panel.css',
    'panel.js', 'store.js', 'probe.js', 'redact.js', 'format.js', 'filters.js',
    'inspector.js', 'LICENSE', 'SECURITY.md', 'CAPTURE.md', 'PRIVACY.md',
    'icons/icon16.png', 'icons/icon32.png', 'icons/icon48.png', 'icons/icon128.png',
    'icons/icon.svg',
]
output = root / 'dist'
output.mkdir(exist_ok=True)
archive = output / f'debrief-{version}.zip'
with ZipFile(archive, 'w', compression=ZIP_DEFLATED, compresslevel=9) as package:
    for name in sorted(files):
        source = root / name
        if source.is_symlink() or not source.is_file():
            raise ValueError(f'Unexpected package source: {name}')
        info = ZipInfo(name, (2026, 1, 1, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        package.writestr(info, source.read_bytes())
    info = ZipInfo('INSTALL.txt', (2026, 1, 1, 0, 0, 0))
    info.external_attr = 0o100644 << 16
    package.writestr(info, 'Extract this archive. Open chrome://extensions, enable Developer mode, choose Load unpacked and select this folder. Open DevTools and select Debrief. HTTP-only is the default. Turn it off to enable optional page context; this clears capture. See SECURITY.md, PRIVACY.md and CAPTURE.md for limitations. Full docs: https://github.com/aljazbracko/debrief\n')
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(output / f'{archive.name}.sha256').write_text(f'{digest}  {archive.name}\n')
print(f'Packaged {archive.name}: {len(files) + 1} allowlisted entries, SHA-256 {digest}')
