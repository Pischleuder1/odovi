import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, mkdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const script = resolve(dirname(fileURLToPath(import.meta.url)), 'check-publication.mjs');
function repository(t) {
  const directory = mkdtempSync(join(tmpdir(), 'odovi-publication-test-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const git=(...args)=>execFileSync('git',args,{cwd:directory,stdio:'pipe'});
  git('init','--quiet'); git('config','user.name','Test'); git('config','user.email','test@example.invalid');
  git('config','commit.gpgsign','false');
  const file=(path,text='example\n')=>{mkdirSync(dirname(join(directory,path)),{recursive:true});writeFileSync(join(directory,path),text);};
  const check=(...args)=>spawnSync(process.execPath,[script,...args],{cwd:directory,encoding:'utf8'});
  return {git,file,check};
}
test('accepts product code and reviewed documentation',t=>{
  const r=repository(t);r.file('apps/web/example.ts');r.file('docs/runtime-configuration.md');r.git('add','.');
  assert.equal(r.check('--staged').status,0);
});
test('rejects private paths even when their contents match a public file',t=>{
  const r=repository(t);r.file('public.txt');r.file('.private/example.txt');r.git('add','.');
  assert.equal(r.check('--staged').status,1);
});
test('rejects marketing source and unreviewed extensionless documents',t=>{
  const r=repository(t);r.file('apps/marketing/page.tsx');r.file('docs/notes');r.git('add','.');
  const result=r.check('--staged');assert.equal(result.status,1);assert.match(result.stderr,/apps\/marketing/);assert.match(result.stderr,/docs\/notes/);
});
test('checks staged bytes rather than a cleaned working copy',t=>{
  const r=repository(t);r.file('notes.md','#'+'# Road'+'map\nExample future plan\n');r.git('add','.');r.file('notes.md','Public notes');
  assert.equal(r.check('--staged').status,1);
});
test('history rejects a previously committed private file after deletion',t=>{
  const r=repository(t);r.file('.private/example.txt');r.git('add','.');r.git('commit','--quiet','-m','Initial');r.git('rm','.private/example.txt');r.git('commit','--quiet','-m','Remove file');
  assert.equal(r.check('--history','HEAD').status,1);
});
test('history checks commit messages without printing sensitive contents',t=>{
  const r=repository(t);r.file('public.txt');r.git('add','.');r.git('commit','--quiet','-m','#'+'# Road'+'map\nExample future plan');
  const result=r.check('--history','HEAD');assert.equal(result.status,1);assert.doesNotMatch(result.stderr,/Example future plan/);
});
