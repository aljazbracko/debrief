import assert from 'node:assert/strict';
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions, []);
for (const key of ['host_permissions', 'optional_permissions', 'optional_host_permissions', 'background', 'content_scripts', 'externally_connectable', 'web_accessible_resources']) assert.ok(!(key in manifest), key);
const required = ['README.md', 'LICENSE', 'SECURITY.md', 'PRIVACY.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'AGENTS.md', 'docs/EXAMPLE.md', 'docs/images/preview.png'];
for (const file of required) assert.ok(lstatSync(join(root, file)).isFile(), file);
const panel = readFileSync(join(root, 'panel.html'), 'utf8');
assert.ok(panel.includes(`id="version">${manifest.version}<`), 'Visible version must match manifest');
assert.ok(readFileSync(join(root, 'README.md'), 'utf8').includes(`debrief-${manifest.version}.zip`));
assert.ok(readFileSync(join(root, 'CHANGELOG.md'), 'utf8').includes(`## ${manifest.version}`));

let count = 0;
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (['.git', 'dist', '.DS_Store'].includes(name)) continue;
    const file = join(dir, name), path = relative(root, file), stat = lstatSync(file);
    assert.ok(!stat.isSymbolicLink(), `Symlink is not publishable: ${path}`);
    assert.ok(!/^(?:\.env(?:\.|$)|node_modules$)/.test(name), `Unexpected private/dependency path: ${path}`);
    if (stat.isDirectory()) { walk(file); continue; }
    assert.ok(!/\.(?:har|heapsnapshot|cpuprofile|log|pem|key|p12|pfx)$/i.test(name), `Captured/sensitive file: ${path}`);
    count++;
    if (name.endsWith('.png')) {
      const png = readFileSync(file);
      assert.equal(png.subarray(1, 4).toString(), 'PNG');
      for (let offset = 8; offset < png.length;) {
        const size = png.readUInt32BE(offset), chunk = png.toString('ascii', offset + 4, offset + 8);
        assert.ok(!['tEXt', 'zTXt', 'iTXt', 'eXIf'].includes(chunk), `Image metadata needs review: ${path}`);
        offset += size + 12;
      }
      continue;
    }
    const text = readFileSync(file, 'utf8');
    assert.ok(!/(?:\/Users\/|\/home\/)[a-z0-9_.-]+\//i.test(text), `Absolute home path: ${path}`);
    assert.ok(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/]{20}/.test(text), `Possible private key: ${path}`);
    if (name.endsWith('.md')) {
      for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
        const target = match[1];
        if (/^(?:https?:|#)/.test(target)) continue;
        assert.ok(lstatSync(join(dir, target.split('#')[0])).isFile(), `Broken local link: ${path} → ${target}`);
      }
    }
  }
}
walk(root);
console.log(`Release checks passed for ${count} files. Manual privacy and security review is still required.`);
