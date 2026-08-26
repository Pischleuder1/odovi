#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$repo_root/acceptance/release-stack/docker-compose.yml"
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
git_commit="$(git -C "$repo_root" rev-parse HEAD)"
short_commit="$(git -C "$repo_root" rev-parse --short=12 HEAD)"
version="${ODOVI_ACCEPTANCE_VERSION:-0.2.0-dev.${short_commit}}"
tag_version="$(printf '%s' "$version" | tr '/+ ' '---' | tr -cd '[:alnum:]_.-')"
project="${ODOVI_ACCEPTANCE_PROJECT:-odovi-acceptance-${short_commit}-$$}"
port="${ODOVI_ACCEPTANCE_PORT:-$(node -e 'const n=require("node:net");const s=n.createServer();s.listen(0,"127.0.0.1",()=>{process.stdout.write(String(s.address().port));s.close()})')}"
run_id="${ODOVI_ACCEPTANCE_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-${short_commit}}"
evidence_dir="${ODOVI_ACCEPTANCE_EVIDENCE_DIR:-$repo_root/acceptance-results/$run_id}"
build_images="${ODOVI_ACCEPTANCE_BUILD:-1}"
keep_stack="${ODOVI_ACCEPTANCE_KEEP_STACK:-0}"
setup_token="${ODOVI_ACCEPTANCE_SETUP_TOKEN:-$(node "$repo_root/scripts/generate-setup-token.mjs")}"

export ODOVI_ACCEPTANCE_STARTED_AT="$started_at"
export ODOVI_ACCEPTANCE_GIT_COMMIT="$git_commit"
export ODOVI_ACCEPTANCE_VERSION="$version"
export ODOVI_ACCEPTANCE_PROJECT="$project"
export ODOVI_ACCEPTANCE_PORT="$port"
export ODOVI_ACCEPTANCE_EVIDENCE_DIR="$evidence_dir"
export ODOVI_ACCEPTANCE_BASE_URL="http://127.0.0.1:$port"
export ODOVI_ACCEPTANCE_READINESS_PATH="${ODOVI_ACCEPTANCE_READINESS_PATH:-/api/health}"
export ODOVI_ACCEPTANCE_READINESS_URL="$ODOVI_ACCEPTANCE_BASE_URL$ODOVI_ACCEPTANCE_READINESS_PATH"
export ODOVI_EXPECT_RELEASE_IDENTITY="${ODOVI_EXPECT_RELEASE_IDENTITY:-1}"
export ODOVI_WEB_IMAGE="${ODOVI_WEB_IMAGE:-odovi-web:$tag_version}"
export ODOVI_WORKER_IMAGE="${ODOVI_WORKER_IMAGE:-odovi-worker:$tag_version}"
export ODOVI_FIXTURES_IMAGE="${ODOVI_FIXTURES_IMAGE:-odovi-fixtures:$tag_version}"
export ODOVI_ACCEPTANCE_EGRESS_ALLOWLIST="${ODOVI_ACCEPTANCE_EGRESS_ALLOWLIST:-api.open-meteo.com,archive-api.open-meteo.com,tile.openstreetmap.org,nominatim.openstreetmap.org,router.project-osrm.org}"
export ODOVI_ACCEPTANCE_BROWSER_EGRESS_LOG="$evidence_dir/browser-egress.ndjson"
export ODOVI_ACCEPTANCE_SETUP_TOKEN="$setup_token"

compose=(docker compose --project-name "$project" --file "$compose_file")
run_status="failed"
stack_owned="0"

mkdir -p "$evidence_dir"
touch "$evidence_dir/container-egress.ndjson" "$evidence_dir/browser-egress.ndjson"
chmod 666 "$evidence_dir/container-egress.ndjson" "$evidence_dir/browser-egress.ndjson"

capture_evidence() {
  set +e
  if [[ "$stack_owned" == "1" ]]; then
    "${compose[@]}" ps --format json >"$evidence_dir/compose-ps.json" 2>&1
    "${compose[@]}" logs --no-color --timestamps >"$evidence_dir/compose.log" 2>&1
  fi
  node "$repo_root/acceptance/release-stack/verify-egress.mjs" \
    "$evidence_dir/container-egress.ndjson" \
    "$evidence_dir/browser-egress.ndjson" >"$evidence_dir/egress-summary.json" 2>&1
  node "$repo_root/acceptance/release-stack/write-manifest.mjs" \
    "$evidence_dir/manifest.json" "$run_status"
  if [[ "$stack_owned" == "1" && "$keep_stack" != "1" ]]; then
    "${compose[@]}" down --volumes --remove-orphans --timeout 10 \
      >"$evidence_dir/compose-down.log" 2>&1
  fi
}
trap capture_evidence EXIT

wait_for_http() {
  local url="$1"
  local label="$2"
  local attempts="${3:-90}"
  for ((i = 1; i <= attempts; i++)); do
    if curl --silent --show-error --fail --max-time 3 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo "Timed out waiting for $label at $url" >&2
  return 1
}

wait_for_fixture_day() {
  local day
  for ((i = 1; i <= 90; i++)); do
    day="$("${compose[@]}" exec -T db psql -U odovi -d odovi -Atqc \
      "select coalesce(to_char(max(start_time at time zone 'Europe/Zurich'), 'YYYY-MM-DD'), '') from drives" \
      2>/dev/null || true)"
    if [[ "$day" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
      export ODOVI_ACCEPTANCE_DAY="$day"
      return 0
    fi
    sleep 2
  done
  echo "Timed out waiting for the first synchronized synthetic drive" >&2
  return 1
}

run_playwright() {
  (
    cd "$repo_root/acceptance/release-stack"
    npm exec -- playwright test --config playwright.config.ts "$@"
  )
}

command -v docker >/dev/null
command -v curl >/dev/null
docker info >/dev/null

existing_resources="$({
  docker ps --all --quiet --filter "label=com.docker.compose.project=$project"
  docker volume ls --quiet --filter "label=com.docker.compose.project=$project"
  docker network ls --quiet --filter "label=com.docker.compose.project=$project"
} | sed '/^$/d')"
if [[ -n "$existing_resources" ]]; then
  echo "Refusing to reuse Compose project '$project'; choose a fresh ODOVI_ACCEPTANCE_PROJECT." >&2
  exit 1
fi

for image in "$ODOVI_WEB_IMAGE" "$ODOVI_WORKER_IMAGE" "$ODOVI_FIXTURES_IMAGE"; do
  if [[ "$image" == *":latest" || ! "$image" =~ (@sha256:|:[^/]+$) ]]; then
    echo "Acceptance images must use an explicit non-latest tag or digest: $image" >&2
    exit 1
  fi
done

"${compose[@]}" config \
  | sed -E 's/^([[:space:]]+ODOVI_SETUP_TOKEN:).*/\1 <redacted>/' \
  >"$evidence_dir/compose-config.yml"

if [[ "$build_images" == "1" ]]; then
  # `migrate` and `worker` deliberately share one exact worker image.
  "${compose[@]}" build seed migrate web
else
  "${compose[@]}" build seed
  "${compose[@]}" pull web worker
fi

docker image inspect "$ODOVI_WEB_IMAGE" "$ODOVI_WORKER_IMAGE" "$ODOVI_FIXTURES_IMAGE" \
  >"$evidence_dir/image-inspect.json"

stack_owned="1"
"${compose[@]}" up --detach --remove-orphans
wait_for_http "$ODOVI_ACCEPTANCE_BASE_URL/api/health" "web liveness"
wait_for_fixture_day

export ODOVI_ACCEPTANCE_PHASE="journey"
run_playwright \
  --project=setup-desktop \
  tests/release-journey.spec.ts

export ODOVI_ACCEPTANCE_PHASE="coverage"
run_playwright \
  --project=desktop --project=mobile \
  tests/coverage.spec.ts

"${compose[@]}" restart web worker
wait_for_http "$ODOVI_ACCEPTANCE_BASE_URL/api/health" "web after restart"
wait_for_http "$ODOVI_ACCEPTANCE_READINESS_URL" "configured readiness contract"

export ODOVI_ACCEPTANCE_PHASE="restart"
run_playwright \
  --project=desktop \
  tests/restart.spec.ts

node "$repo_root/acceptance/release-stack/verify-egress.mjs" \
  "$evidence_dir/container-egress.ndjson" \
  "$evidence_dir/browser-egress.ndjson" >"$evidence_dir/egress-summary.json"

run_status="passed"
echo "Release acceptance passed. Evidence: $evidence_dir"
