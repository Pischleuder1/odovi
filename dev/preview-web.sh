#!/usr/bin/env bash
# Launch wrapper for the preview harness: injects the dev env (DB URL, timezone,
# and a short-lived setup token for local verification).
set -euo pipefail
export DATABASE_URL="${DATABASE_URL:-postgres://odovi:odovi@localhost:5432/odovi}"
export APP_TIMEZONE="${APP_TIMEZONE:-Europe/Zurich}"
cd "$(dirname "$0")/.."
export ODOVI_SETUP_TOKEN="${ODOVI_SETUP_TOKEN:-$(node scripts/generate-setup-token.mjs)}"
printf 'Local Odovi setup token: %s\n' "$ODOVI_SETUP_TOKEN" >&2
exec pnpm --filter @odovi/web dev
