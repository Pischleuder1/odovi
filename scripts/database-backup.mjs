#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, openSync, closeSync, statSync, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';

// Resolve the effective model rather than sourcing .env as shell code.
// https://docs.docker.com/reference/cli/docker/compose/config/
const [action, ...args] = process.argv.slice(2);
const compose = ['compose'];
let project, directory, confirmation;
function fail(message) { throw new Error(message); }
function docker(args, options = {}) {
  const result = spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) fail(`Docker command failed (${args.includes('config') ? 'configuration' : args.find(a => ['pg_dump','pg_restore','psql','inspect','ps'].includes(a)) ?? 'operation'}). Check the selected stack and credentials. ${result.error?.message ?? ''}`);
  return result.stdout?.trim() ?? '';
}
function dc(args, options) { return docker([...compose, ...args], options); }
async function checksum(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
function withArchive(path, args) {
  const fd = openSync(path, 'r');
  try { return dc(args, { stdio: [fd, 'pipe', 'pipe'] }); }
  finally { closeSync(fd); }
}

try {
  if (!['inspect', 'backup', 'restore'].includes(action)) fail('Usage: database-backup.mjs inspect|backup|restore --project NAME --file FILE [--file OVERRIDE] [--env-file FILE] [--directory DIR] [--confirm PROJECT/DATABASE]');
  for (let i = 0; i < args.length; i += 2) {
    const value = args[i + 1];
    if (!value || value.startsWith('--')) fail(`Missing value for ${args[i]}`);
    if (args[i] === '--project') { project = value; compose.push('--project-name', value); }
    else if (args[i] === '--file' || args[i] === '--env-file') compose.push(args[i], resolve(value));
    else if (args[i] === '--directory') directory = resolve(value);
    else if (args[i] === '--confirm') confirmation = value;
    else fail(`Unknown option ${args[i]}`);
  }
  if (!project || !/^[a-z0-9][a-z0-9_-]*$/.test(project) || !compose.includes('--file')) fail('Explicit --project and --file are required. Never infer the production stack from the working directory.');
  const model = JSON.parse(dc(['config', '--format', 'json']));
  if (model.name !== project) fail('Compose project identity does not match.');
  const db = model.services?.db;
  const user = db?.environment?.POSTGRES_USER;
  const database = db?.environment?.POSTGRES_DB;
  if (![user, database].every(v => typeof v === 'string' && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(v))) fail('db must explicitly configure safe POSTGRES_USER and POSTGRES_DB identifiers.');
  const mount = db.volumes?.find(v => v.target === '/var/lib/postgresql/data');
  const volume = mount?.type === 'volume' && model.volumes?.[mount.source]?.name;
  if (!volume) fail('A named PostgreSQL data volume is required for the supported backup/restore path.');
  const dbId = dc(['ps', '--all', '--quiet', 'db']);
  if (!dbId || dbId.includes('\n')) fail('Expected exactly one existing db container. Start only db before restore.');
  const runtime = JSON.parse(docker(['inspect', dbId]))[0];
  if (!runtime.State?.Running || runtime.Config?.Labels?.['com.docker.compose.project'] !== project || !runtime.Mounts?.some(m => m.Type === 'volume' && m.Name === volume && m.Destination === '/var/lib/postgresql/data')) fail('Running database does not match the configured project/volume. Refusing to touch it.');
  const identity = { project, user, database, volume, dbContainer: dbId };
  if (action === 'inspect') { console.log(JSON.stringify(identity, null, 2)); process.exit(0); }
  if (!directory) fail('--directory is required. Backups contain credentials and private location data.');
  for (const service of ['web', 'worker', 'migrate']) {
    if (model.services[service] && dc(['ps', '--status', 'running', '--quiet', service])) fail(`Stop ${service} before ${action}; no writes may occur during the recovery checkpoint.`);
  }
  const dump = join(directory, 'database.dump');
  const manifestFile = join(directory, 'manifest.json');
  if (action === 'backup') {
    // mkdir without recursive refuses existing paths instead of overwriting checkpoints.
    mkdirSync(directory, { mode: 0o700 });
    writeFileSync(join(directory, 'compose.resolved.json'), JSON.stringify(model, null, 2), { mode: 0o600, flag: 'wx' });
    const fd = openSync(dump, 'wx', 0o600);
    try {
      // Custom archives preserve data, schema, sequences and authentication tables.
      // https://www.postgresql.org/docs/17/app-pgdump.html
      dc(['exec', '-T', 'db', 'pg_dump', '--username', user, '--dbname', database, '--format=custom'], { stdio: ['ignore', fd, 'pipe'] });
    } finally { closeSync(fd); }
    const listing = withArchive(dump, ['exec', '-T', 'db', 'pg_restore', '--list']);
    if (!listing || statSync(dump).size === 0) fail('Backup archive is empty or unreadable. Do not upgrade.');
    writeFileSync(join(directory, 'archive-list.txt'), listing, { mode: 0o600, flag: 'wx' });
    writeFileSync(manifestFile, JSON.stringify({ schemaVersion: 1, ...identity, createdAt: new Date().toISOString(), sha256: await checksum(dump) }, null, 2), { mode: 0o600, flag: 'wx' });
    console.log(`Backup verified: ${directory}. Keep it private; test restore before upgrade.`);
  } else {
    const backup = JSON.parse(readFileSync(manifestFile, 'utf8'));
    if (backup.schemaVersion !== 1 || backup.user !== user || backup.database !== database) fail('Backup database/user differs from the configured destination. Restore the original identity.');
    if (confirmation !== `${project}/${database}`) fail(`Restore requires --confirm ${project}/${database}`);
    if (await checksum(dump) !== backup.sha256) fail('Backup checksum mismatch. Nothing restored.');
    const objects = dc(['exec', '-T', 'db', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', user, '-d', database, '-Atqc', "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in ('pg_catalog','information_schema') and n.nspname not like 'pg_toast%' and n.nspname not like 'pg_temp%' and c.relkind in ('r','p','v','m','S','f')"]);
    if (objects !== '0') fail('Destination database is not empty. Restore to a fresh named volume; never overwrite the existing archive.');
    // One transaction: an error leaves the empty destination unchanged. Never --clean/--create.
    // https://www.postgresql.org/docs/17/app-pgrestore.html
    withArchive(dump, ['exec', '-T', 'db', 'pg_restore', '--username', user, '--dbname', database, '--exit-on-error', '--single-transaction', '--no-owner', '--no-acl']);
    console.log(`Restored ${project}/${database} from verified checkpoint. Start the matching application version before migrating.`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
