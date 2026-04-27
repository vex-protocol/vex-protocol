#!/bin/sh
# Match Spire listen port (src/spireListenPort.ts) using the same rules as
# deploy/resolve-spire-listen-port.sh.
set -euf
PORT="$(/bin/sh /opt/resolve-spire-listen-port.sh)"
# sed delimiter must not appear in the port; use # for special chars
sed "s#__SPIRE_UPSTREAM_PORT__#$PORT#g" /etc/nginx/nginx.conf.template > /tmp/nginx.conf

echo "[nginx-entrypoint] rendered /tmp/nginx.conf for upstream port: $PORT"
echo "[nginx-entrypoint] active redacted logging lines:"
grep -n "map \$uri \$route_static\|log_format redacted\|access_log " /tmp/nginx.conf || true
echo "[nginx-entrypoint] active device route mappings:"
grep -n "/device/:id/" /tmp/nginx.conf || true

exec nginx -c /tmp/nginx.conf -g "daemon off;"
