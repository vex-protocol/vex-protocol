#!/bin/sh
# Docker HEALTHCHECK: GET /healthz through BusyBox wget.
set -euf
P="$(/bin/sh /app/deploy/resolve-spire-listen-port.sh)"
exec wget -q -O /dev/null "http://127.0.0.1:${P}/healthz"
