#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SPIRE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${SPIRE_LOCAL_ENV_FILE:-$SPIRE_DIR/.env.local}"

cd "$SPIRE_DIR"

write_env() {
    printf "%s=%q\n" "$1" "$2"
}

if [[ ! -f "$ENV_FILE" ]]; then
    {
        node scripts/gen-spk.js
        write_env DB_TYPE "sqlite3"
        write_env API_PORT "${API_PORT:-16777}"
        write_env DEV_API_KEY "${DEV_API_KEY:-local-dev}"
        write_env SPIRE_PASSKEY_RP_ID "${SPIRE_PASSKEY_RP_ID:-localhost}"
        write_env SPIRE_PASSKEY_RP_NAME "${SPIRE_PASSKEY_RP_NAME:-Vex Local}"
        write_env SPIRE_PASSKEY_ORIGINS "${SPIRE_PASSKEY_ORIGINS:-http://localhost:5180,http://127.0.0.1:5180}"
        write_env SPIRE_STUN_URLS "${SPIRE_STUN_URLS:-stun:stun.l.google.com:19302}"
        echo "# Optional Cloudflare TURN credentials. Keep these server-side."
        echo "# SPIRE_CLOUDFLARE_TURN_KEY_ID="
        echo "# SPIRE_CLOUDFLARE_TURN_API_TOKEN="
        echo "# SPIRE_CLOUDFLARE_TURN_TTL_SECONDS=86400"
    } > "$ENV_FILE"
    echo "Created $ENV_FILE"
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

export API_PORT="${API_PORT:-16777}"
export DB_TYPE="${DB_TYPE:-sqlite3}"
export DEV_API_KEY="${DEV_API_KEY:-local-dev}"
export SPIRE_PASSKEY_RP_ID="${SPIRE_PASSKEY_RP_ID:-localhost}"
export SPIRE_PASSKEY_RP_NAME="${SPIRE_PASSKEY_RP_NAME:-Vex Local}"
export SPIRE_PASSKEY_ORIGINS="${SPIRE_PASSKEY_ORIGINS:-http://localhost:5180,http://127.0.0.1:5180}"
export SPIRE_STUN_URLS="${SPIRE_STUN_URLS:-stun:stun.l.google.com:19302}"
export SPIRE_CLOUDFLARE_TURN_TTL_SECONDS="${SPIRE_CLOUDFLARE_TURN_TTL_SECONDS:-86400}"

echo "Starting local Spire on http://localhost:${API_PORT}"
if [[ -n "${SPIRE_CLOUDFLARE_TURN_KEY_ID:-}" && -n "${SPIRE_CLOUDFLARE_TURN_API_TOKEN:-}" ]]; then
    echo "Cloudflare TURN: enabled"
else
    echo "Cloudflare TURN: disabled"
fi
echo "Desktop local dev: VITE_SERVER_URL=localhost:5180 VITE_PROXY_TARGET=http://localhost:${API_PORT}"
echo "Mobile local dev: EXPO_PUBLIC_ENABLE_DEV_SERVER=1 EXPO_PUBLIC_SERVER_URL=localhost:${API_PORT}"

exec pnpm start
