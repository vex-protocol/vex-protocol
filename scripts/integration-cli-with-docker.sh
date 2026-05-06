#!/usr/bin/env bash
# Ensure Docker is reachable, Spire + nginx compose is up, then run integration:cli.
# Usage (from vex-protocol/): pnpm run integration:cli [-- stress-cli-sweep args…]
# Defaults when omitted (later argv wins): --host 127.0.0.1:16777, --walls 10,
# --clients 10, --conc 20, --scenario chat, --seconds 180, --stop-on-fail
# (omit --stop-on-fail if you pass --informational). Prints a RESULT: line from exit code.
set -euo pipefail

PROTOCOL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SPIRE_DIR="${PROTOCOL_ROOT}/apps/spire"
STATUS_URL="${SPIRE_STRESS_STATUS_URL:-http://127.0.0.1:16777/status}"
STACK_WAIT_SEC="${SPIRE_STRESS_STACK_WAIT_SEC:-120}"
DOCKER_WAIT_SEC="${SPIRE_STRESS_DOCKER_WAIT_SEC:-180}"
REBUILD_STACK="${SPIRE_STRESS_REBUILD:-0}"

for a in "$@"; do
    if [[ "$a" == "--help" || "$a" == "-h" ]]; then
        if [[ ! -d "$SPIRE_DIR" ]]; then
            echo "[integration-cli] Expected Spire app at ${SPIRE_DIR}" >&2
            exit 1
        fi
        cd "$SPIRE_DIR"
        export SPIRE_STRESS_TRACE="${SPIRE_STRESS_TRACE:-0}"
        exec pnpm run integration:cli -- "$@"
    fi
done

docker_info_ok() {
    docker info >/dev/null 2>&1
}

wait_for_docker() {
    local deadline=$((SECONDS + DOCKER_WAIT_SEC))
    while ((SECONDS < deadline)); do
        if docker_info_ok; then
            return 0
        fi
        sleep 2
    done
    return 1
}

maybe_start_docker_desktop() {
    case "$(uname -s)" in
        Darwin)
            if command -v open >/dev/null 2>&1; then
                echo "[integration-cli] Docker daemon not reachable — launching Docker Desktop (macOS)…" >&2
                open -a Docker 2>/dev/null || true
            fi
            ;;
        *)
            echo "[integration-cli] Docker daemon not reachable — start the Docker engine, then retry." >&2
            echo "[integration-cli]   Linux: sudo systemctl start docker   (or your distro’s service)" >&2
            return 1
            ;;
    esac
}

if ! docker_info_ok; then
    maybe_start_docker_desktop || exit 1
    echo "[integration-cli] Waiting for Docker daemon (up to ${DOCKER_WAIT_SEC}s)…" >&2
    if ! wait_for_docker; then
        echo "[integration-cli] Docker did not become ready within ${DOCKER_WAIT_SEC}s." >&2
        exit 1
    fi
fi

if [[ ! -d "$SPIRE_DIR" ]]; then
    echo "[integration-cli] Expected Spire app at ${SPIRE_DIR}" >&2
    exit 1
fi

if [[ ! -f "${SPIRE_DIR}/.env" ]]; then
    echo "[integration-cli] Missing ${SPIRE_DIR}/.env" >&2
    echo "[integration-cli] Create it before running (e.g. SPK, JWT_SECRET, DEV_API_KEY — see apps/spire README / gen-spk)." >&2
    exit 1
fi

has_host=0
has_walls=0
has_clients=0
has_conc=0
has_scenario=0
has_seconds=0
has_informational=0
has_stop_on_fail=0
for a in "$@"; do
    case "$a" in
        --host | --host=*)
            has_host=1
            ;;
        --walls | --walls=*)
            has_walls=1
            ;;
        --clients | --clients=*)
            has_clients=1
            ;;
        --conc | --conc=* | --concurrency | --concurrency=*)
            has_conc=1
            ;;
        --scenario | --scenario=*)
            has_scenario=1
            ;;
        --seconds | --seconds=*)
            has_seconds=1
            ;;
        --informational)
            has_informational=1
            ;;
        --stop-on-fail)
            has_stop_on_fail=1
            ;;
    esac
done
def=()
[[ "$has_host" -eq 0 ]] && def+=(--host "127.0.0.1:16777")
[[ "$has_walls" -eq 0 ]] && def+=(--walls 10)
[[ "$has_clients" -eq 0 ]] && def+=(--clients 10)
[[ "$has_conc" -eq 0 ]] && def+=(--conc 20)
[[ "$has_scenario" -eq 0 ]] && def+=(--scenario chat)
[[ "$has_seconds" -eq 0 ]] && def+=(--seconds 180)
if [[ "$has_informational" -eq 0 && "$has_stop_on_fail" -eq 0 ]]; then
    def+=(--stop-on-fail)
fi
set -- "${def[@]}" "$@"

cd "$SPIRE_DIR"

# The compose file is production-safe by default, but the local stress stack
# normally uses DEV_API_KEY from apps/spire/.env. Keep that bypass out of
# production while allowing the integration harness to exercise the container.
export SPIRE_DOCKER_NODE_ENV="${SPIRE_DOCKER_NODE_ENV:-development}"

if [[ "$REBUILD_STACK" == "1" || "$REBUILD_STACK" == "true" ]]; then
    echo "[integration-cli] Rebuilding stack (SPIRE_STRESS_REBUILD=${REBUILD_STACK}) …" >&2
    docker compose up -d --build --force-recreate
    echo "[integration-cli] Waiting for ${STATUS_URL} (up to ${STACK_WAIT_SEC}s)…" >&2
    deadline=$((SECONDS + STACK_WAIT_SEC))
    while ((SECONDS < deadline)); do
        if curl -fsS "$STATUS_URL" >/dev/null 2>&1; then
            break
        fi
        sleep 1
    done
    if ! curl -fsS "$STATUS_URL" >/dev/null 2>&1; then
        echo "[integration-cli] Stack did not become ready. Try: cd apps/spire && docker compose ps && docker compose logs" >&2
        exit 1
    fi
elif curl -fsS "$STATUS_URL" >/dev/null 2>&1; then
    echo "[integration-cli] Stack already healthy (${STATUS_URL})" >&2
else
    echo "[integration-cli] Stack not ready — docker compose up -d --build …" >&2
    docker compose up -d --build
    echo "[integration-cli] Waiting for ${STATUS_URL} (up to ${STACK_WAIT_SEC}s)…" >&2
    deadline=$((SECONDS + STACK_WAIT_SEC))
    while ((SECONDS < deadline)); do
        if curl -fsS "$STATUS_URL" >/dev/null 2>&1; then
            break
        fi
        sleep 1
    done
    if ! curl -fsS "$STATUS_URL" >/dev/null 2>&1; then
        echo "[integration-cli] Stack did not become ready. Try: cd apps/spire && docker compose ps && docker compose logs" >&2
        exit 1
    fi
fi

export SPIRE_STRESS_TRACE="${SPIRE_STRESS_TRACE:-0}"

echo "[integration-cli] pnpm run integration:cli -- $*" >&2
set +e
pnpm run integration:cli -- "$@"
integration_exit=$?
set -e

if [[ "$integration_exit" -eq 0 ]]; then
    echo "[integration-cli] RESULT: PASS (exit 0)" >&2
elif [[ "$integration_exit" -eq 2 ]]; then
    echo "[integration-cli] RESULT: FAIL — target unreachable (exit 2)" >&2
else
    echo "[integration-cli] RESULT: FAIL (exit $integration_exit)" >&2
fi
exit "$integration_exit"
