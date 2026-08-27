import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cli = new URL('./database-backup.mjs', import.meta.url).pathname;
const config = {
  name: 'custom-project',
  services: { db: { environment: { POSTGRES_USER: 'archive_owner', POSTGRES_DB: 'journey_archive' },
    volumes: [{ type: 'volume', source: 'data', target: '/var/lib/postgresql/data' }] }, web: {}, worker: {} },
  volumes: { data: { name: 'custom-volume' } },
};
function fixture(mode = '') {
  const dir = mkdtempSync(join(tmpdir(), 'odovi-backup-test-'));
  writeFileSync(join(dir, 'docker'), `#!/usr/bin/env node
const fs = require('node:fs'); const args=process.argv.slice(2);
fs.appendFileSync(process.env.CALLS, JSON.stringify(args)+'\\n');
if(args.includes('config')) console.log(process.env.CONFIG);
else if(args[0]==='inspect') console.log(JSON.stringify([{State:{Running:true},Config:{Labels:{'com.docker.compose.project':'custom-project'}},Mounts:[{Type:'volume',Name:'custom-volume',Destination:'/var/lib/postgresql/data'}]}]));
else if(args.includes('ps')) console.log(args.at(-1)==='db'?'db-id':(process.env.MODE==='running'?'writer-id':''));
else if(args.includes('pg_dump')) process.stdout.write('PGDMP-synthetic');
else if(args.includes('pg_restore')) { if(args.includes('--list')) console.log('archive contents'); }
else if(args.includes('psql')) console.log(process.env.MODE==='nonempty'?'1':'0');
`, { mode: 0o700 });
  const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`, CONFIG: JSON.stringify(config), CALLS: join(dir, 'calls'), MODE: mode };
  const run = (...args) => spawnSync(process.execPath, [cli, ...args, '--project', 'custom-project', '--file', '/tmp/custom-compose.yml'], { env, encoding: 'utf8' });
  return { dir, run, calls: () => readFileSync(env.CALLS, 'utf8') };
}
test('operator inspection resolves configured database, project and actual volume without exposing passwords', () => {
  const f = fixture(); const result = f.run('inspect');
  assert.equal(result.status, 0, result.stderr);
  const identity = JSON.parse(result.stdout);
  assert.deepEqual({ project: identity.project, user: identity.user, database: identity.database, volume: identity.volume },
    { project: 'custom-project', user: 'archive_owner', database: 'journey_archive', volume: 'custom-volume' });
});
test('backup refuses active writers, without starting a dump', () => {
  const f = fixture('running');
  const result = f.run('backup','--directory',join(f.dir,'backup'));
  assert.equal(result.status,1);
  assert.match(result.stderr,/Stop web/);
  assert.doesNotMatch(f.calls(),/pg_dump/);
});
test('backup and restore use configured database and keep checkpoints private and non-overwritable', () => {
  const f=fixture(); const directory=join(f.dir,'checkpoint');
  const backed=f.run('backup','--directory',directory);
  assert.equal(backed.status,0,backed.stderr);
  assert.equal(statSync(directory).mode & 0o777,0o700);
  assert.equal(statSync(join(directory,'database.dump')).mode & 0o777,0o600);
  assert.equal(f.run('backup','--directory',directory).status,1);
  assert.equal(f.run('restore','--directory',directory).status,1);
  const restored=f.run('restore','--directory',directory,'--confirm','custom-project/journey_archive');
  assert.equal(restored.status,0,restored.stderr);
  assert.match(f.calls(),/"--username","archive_owner","--dbname","journey_archive","--format=custom"/);
  assert.match(f.calls(),/"--exit-on-error","--single-transaction","--no-owner","--no-acl"/);
  assert.doesNotMatch(f.calls(),/"--clean"|"dropdb"/);
});
test('restore rejects tampered backup before invoking the restore command', () => {
  const f=fixture(); const directory=join(f.dir,'checkpoint');
  assert.equal(f.run('backup','--directory',directory).status,0);
  writeFileSync(join(directory,'database.dump'),'corrupted');
  const result=f.run('restore','--directory',directory,'--confirm','custom-project/journey_archive');
  assert.equal(result.status,1);
  assert.match(result.stderr,/checksum mismatch/);
  assert.doesNotMatch(f.calls(),/--single-transaction/);
});
test('restore refuses a nonempty destination instead of deleting any data', () => {
  const f=fixture('nonempty'); const directory=join(f.dir,'checkpoint');
  assert.equal(f.run('backup','--directory',directory).status,0);
  const result=f.run('restore','--directory',directory,'--confirm','custom-project/journey_archive');
  assert.equal(result.status,1);
  assert.match(result.stderr,/not empty/);
  assert.doesNotMatch(f.calls(),/--single-transaction/);
});
