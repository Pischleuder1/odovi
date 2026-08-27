#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

const [entry, destination] = process.argv.slice(2);
if (!entry || !destination) throw new Error('Usage: collect-license-notices.mjs <workspace> <output>');
const root = process.cwd();
const output = resolve(destination);
const visited = new Set();
const packages = new Map();
const problems = [];
const noticeName = /^(?:licen[cs]e|notice|copying|copyright|authors|readme)(?:[._-]|$)/i;
const standardDirectory = join(root, 'security/license-texts');

function resolveDependency(from, name) {
  for (let directory = from; ; directory = dirname(directory)) {
    const candidate = join(directory, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate);
    if (dirname(directory) === directory) return undefined;
  }
}

function noticeFiles(directory, prefix = '') {
  const files = [];
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    if (item.name === 'node_modules' || item.name === '.git') continue;
    const path = join(prefix, item.name);
    if (item.isDirectory()) files.push(...noticeFiles(join(directory, item.name), path));
    else if (item.isFile() && noticeName.test(item.name)) files.push(path);
  }
  return files.sort();
}

function visit(directory) {
  directory = realpathSync(directory);
  if (visited.has(directory)) return;
  visited.add(directory);
  const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  const isWorkspace = /^(?:apps|packages)\//.test(relative(root, directory).replaceAll('\\', '/'));
  if (!isWorkspace) {
    const id = `${manifest.name}@${manifest.version}`;
    let license = typeof manifest.license === 'string' ? manifest.license
      : manifest.license?.type ?? manifest.licenses?.map(item => item.type).join(' OR ');
    const notices = noticeFiles(directory);
    if (!license && notices.some(file => /^(?:licen[cs]e|copying)(?:[._-]|$)/i.test(file))) license = 'SEE INCLUDED LICENSE FILE';
    if (!license) problems.push(`Missing license declaration for ${id}`);
    const identifiers = (license ?? '').split(/[()\s]+/).filter(part => part && !['AND', 'OR'].includes(part));
    const standardLicenseTexts = identifiers.filter(id => /^[a-zA-Z0-9.+-]+$/.test(id) && existsSync(join(standardDirectory, `${id}.txt`)));
    const hasLicenseText = notices.some(file => /^(?:licen[cs]e|copying|notice)(?:[._-]|$)/i.test(basename(file)));
    if (!hasLicenseText && (!standardLicenseTexts.length || standardLicenseTexts.length !== identifiers.length)) {
      problems.push(`Missing license/notice files or standard terms for ${id}`);
    }
    if (!packages.has(id)) {
      const folder = id.replace(/[^a-zA-Z0-9._-]/g, '_');
      mkdirSync(join(output, folder), { recursive: true });
      for (const notice of notices) {
        const target = join(output, folder, notice);
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(join(directory, notice), target);
      }
      packages.set(id, { name: manifest.name, version: manifest.version, license,
        attribution: manifest.author, repository: manifest.repository,
        standardLicenseTexts: standardLicenseTexts.map(id => `license-texts/${id}.txt`),
        notices: notices.map(file => `${folder}/${file.replaceAll('\\', '/')}`) });
      writeFileSync(join(output, folder, 'package-metadata.json'), JSON.stringify({
        name: manifest.name, version: manifest.version, license: manifest.license,
        licenses: manifest.licenses, author: manifest.author, copyright: manifest.copyright,
        repository: manifest.repository,
      }, null, 2) + '\n');
      if (existsSync(join(directory, 'versions.json'))) {
        copyFileSync(join(directory, 'versions.json'), join(output, folder, 'versions.json'));
      }
    }
  }
  const optional = manifest.optionalDependencies ?? {};
  const dependencies = { ...manifest.dependencies, ...optional, ...manifest.peerDependencies };
  for (const name of Object.keys(dependencies).sort()) {
    const dependency = resolveDependency(directory, name);
    if (dependency) visit(dependency);
    else if (!(name in optional) && !(name in (manifest.peerDependencies ?? {}))) {
      throw new Error(`Missing production dependency ${name} for ${manifest.name}`);
    }
  }
}

visit(resolve(entry));
if (problems.length) throw new Error(problems.join('\n') + '\nDeclared licenses: ' + [...new Set([...packages.values()].map(p => p.license))].sort().join(', '));
if (!packages.size) throw new Error('No production dependency notices collected');
mkdirSync(output, { recursive: true });
if (existsSync(standardDirectory)) {
  mkdirSync(join(output, 'license-texts'), { recursive: true });
  for (const file of readdirSync(standardDirectory)) {
    copyFileSync(join(standardDirectory, file), join(output, 'license-texts', file));
  }
}
const inventory = { schemaVersion: 1,
  lockfileSha256: createHash('sha256').update(readFileSync(join(root, 'pnpm-lock.yaml'))).digest('hex'),
  packages: [...packages.values()].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`)) };
writeFileSync(join(output, 'inventory.json'), JSON.stringify(inventory, null, 2) + '\n');
console.log(`Collected license notices for ${packages.size} installed production packages.`);
