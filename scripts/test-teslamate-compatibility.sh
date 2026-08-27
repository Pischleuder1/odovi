#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
requested_version="${1:-}"
supported_versions=("4.0.1" "4.2.0")

if [[ -n "$requested_version" ]]; then
  versions=("$requested_version")
else
  versions=("${supported_versions[@]}")
fi

command -v docker >/dev/null
docker info >/dev/null

for version in "${versions[@]}"; do
  case "$version" in
    4.0.1|4.2.0) ;;
    *)
      echo "No supported TeslaMate boundary fixture for '$version'. Expected 4.0.1 or 4.2.0." >&2
      exit 2
      ;;
  esac

  schema="$repo_root/dev/fixtures/teslamate/v$version/schema.sql"
  [[ -f "$schema" ]] || {
    echo "Missing TeslaMate fixture: $schema" >&2
    exit 1
  }

  port="$(node -e 'const n=require("node:net");const s=n.createServer();s.listen(0,"127.0.0.1",()=>{process.stdout.write(String(s.address().port));s.close()})')"
  container="odovi-teslamate-compat-${version//./-}-$$"

  cleanup() {
    docker rm --force "$container" >/dev/null 2>&1 || true
  }
  trap cleanup EXIT
  trap 'cleanup; exit 130' INT TERM

  docker run --detach --name "$container" \
    --publish "127.0.0.1:$port:5432" \
    --env POSTGRES_USER=teslamate \
    --env POSTGRES_PASSWORD=teslamate-compatibility \
    --env POSTGRES_DB=teslamate \
    --mount "type=bind,source=$schema,target=/docker-entrypoint-initdb.d/01_teslamate_schema.sql,readonly" \
    postgres:17-alpine >/dev/null

  ready=0
  for _ in {1..60}; do
    if docker exec "$container" pg_isready -h 127.0.0.1 -U teslamate -d teslamate >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 1
  done
  if [[ "$ready" != "1" ]]; then
    docker logs "$container" >&2
    echo "TeslaMate $version fixture database did not become ready." >&2
    exit 1
  fi

  database_url="postgres://teslamate:teslamate-compatibility@127.0.0.1:$port/teslamate"
  TESLAMATE_DATABASE_URL="$database_url" \
    corepack pnpm --filter @odovi/fixtures seed
  docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U teslamate -d teslamate \
    < "$repo_root/dev/fixtures/teslamate/readonly-role.sql"
  readonly_database_url="postgres://odovi_fixture_reader:fixture-reader-only@127.0.0.1:$port/teslamate"
  TESLAMATE_COMPATIBILITY_DATABASE_URL="$readonly_database_url" \
    TESLAMATE_FIXTURE_VERSION="$version" \
    corepack pnpm --filter @odovi/worker exec vitest run \
      src/teslamate/compatibility.integration.test.ts

  cleanup
  trap - EXIT INT TERM
done
