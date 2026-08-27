#!/bin/sh
set -eu
legacy_dir="$(mktemp -d)"
mkdir -p "$legacy_dir/drizzle/meta"
cp /app/apps/worker/drizzle/000[0-6]_*.sql "$legacy_dir/drizzle/"
cp /opt/odovi-acceptance/v0.1.1-journal.json "$legacy_dir/drizzle/meta/_journal.json"
cd "$legacy_dir"
node /app/apps/worker/dist/migrate.js
