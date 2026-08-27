import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const command = fileURLToPath(new URL('./collect-license-notices.mjs', import.meta.url));
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'odovi-notices-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (name, content) => { const path = join(root, name); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); };
  const pkg = (name, data) => put(`${name}/package.json`, JSON.stringify(data));
  put('pnpm-lock.yaml', 'lockfileVersion: 9.0\n');
  pkg('apps/web', { name: '@odovi/web', version: '0.2.0', dependencies: { example: '1.0.0' }, devDependencies: { excluded: '1.0.0' } });
  pkg('node_modules/example', { name: 'example', version: '1.0.0', license: 'MIT', optionalDependencies: { unavailable: '1.0.0' } });
  put('node_modules/example/LICENSE', 'Copyright Example\nMIT terms\n');
  return { root, put, pkg, run: () => spawnSync(process.execPath, [command, 'apps/web', 'notices'], { cwd: root, encoding: 'utf8' }) };
}

test('ships production and bundled notices without local paths or development dependencies', t => {
  const f = fixture(t);
  f.put('node_modules/example/dist/compiled/vendor/NOTICE.txt', 'Bundled component notice\n');
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const raw = readFileSync(join(f.root, 'notices/inventory.json'), 'utf8');
  const inventory = JSON.parse(raw);
  assert.equal(inventory.packages.length, 1);
  assert.equal(inventory.packages[0].name, 'example');
  assert.equal(inventory.packages[0].notices.length, 2);
  assert.equal(readFileSync(join(f.root, 'notices/example_1.0.0/dist/compiled/vendor/NOTICE.txt'), 'utf8'), 'Bundled component notice\n');
  assert(!raw.includes(f.root));
  assert.match(inventory.lockfileSha256, /^[a-f0-9]{64}$/);
});

test('refuses a production package without license text', t => {
  const f = fixture(t);
  rmSync(join(f.root, 'node_modules/example/LICENSE'));
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing license\/notice files/);
});

test('refuses missing required dependencies instead of producing a partial inventory', t => {
  const f = fixture(t);
  f.pkg('node_modules/example', { name: 'example', version: '1.0.0', license: 'MIT', dependencies: { missing: '1.0.0' } });
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing production dependency missing/);
});

test('preserves attribution and includes standard terms when upstream omits a license file', t => {
  const f = fixture(t);
  rmSync(join(f.root, 'node_modules/example/LICENSE'));
  f.pkg('node_modules/example', { name: 'example', version: '1.0.0', license: 'MIT', author: 'Example Author' });
  f.put('security/license-texts/MIT.txt', 'MIT license terms supplied by the reviewed text inventory\n');
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const inventory = JSON.parse(readFileSync(join(f.root, 'notices/inventory.json')));
  assert.deepEqual(inventory.packages[0].standardLicenseTexts, ['license-texts/MIT.txt']);
  assert.equal(inventory.packages[0].attribution, 'Example Author');
  assert.match(readFileSync(join(f.root, 'notices/example_1.0.0/package-metadata.json'), 'utf8'), /Example Author/);
  assert.match(readFileSync(join(f.root, 'notices/license-texts/MIT.txt'), 'utf8'), /MIT license terms/);
});
