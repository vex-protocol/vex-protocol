#!/bin/sh
# Match Spire listen port (src/spireListenPort.ts) using the same rules as
# deploy/resolve-spire-listen-port.sh.
set -euf

WELL_KNOWN_DIR="/tmp/spire-passkey-well-known"

trim() {
    printf '%s' "$1" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//'
}

json_escape() {
    printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

normalize_fingerprint() {
    FP="$(trim "$1" | tr '[:lower:]' '[:upper:]')"
    HEX="$(printf '%s' "$FP" | tr -d ':')"
    LEN="$(printf '%s' "$HEX" | wc -c | tr -d ' ')"
    if [ "$LEN" != "64" ] || ! printf '%s' "$HEX" | grep -Eq '^[0-9A-F]{64}$'; then
        return 1
    fi
    printf '%s' "$HEX" | sed 's/../&:/g; s/:$//'
}

write_apple_app_site_association() {
    APPS_RAW="${SPIRE_PASSKEY_IOS_APP_IDS-}"
    if [ -z "$(trim "$APPS_RAW")" ]; then
        return 0
    fi

    TMP="$WELL_KNOWN_DIR/apple-app-site-association.tmp"
    COUNT=0
    OLD_IFS="$IFS"
    IFS=','
    printf '{"webcredentials":{"apps":[' > "$TMP"
    for APP_RAW in $APPS_RAW; do
        APP="$(trim "$APP_RAW")"
        if [ -z "$APP" ]; then
            continue
        fi
        if [ "$COUNT" -gt 0 ]; then
            printf ',' >> "$TMP"
        fi
        printf '"%s"' "$(json_escape "$APP")" >> "$TMP"
        COUNT=$((COUNT + 1))
    done
    IFS="$OLD_IFS"

    if [ "$COUNT" -eq 0 ]; then
        rm -f "$TMP"
        return 0
    fi
    printf ']}}\n' >> "$TMP"
    mv "$TMP" "$WELL_KNOWN_DIR/apple-app-site-association"
}

write_assetlinks() {
    PACKAGE_NAME="$(trim "${SPIRE_PASSKEY_ANDROID_PACKAGE-}")"
    FINGERPRINTS_RAW="${SPIRE_PASSKEY_ANDROID_FINGERPRINTS-}"
    if [ -z "$PACKAGE_NAME" ] || [ -z "$(trim "$FINGERPRINTS_RAW")" ]; then
        return 0
    fi

    TMP="$WELL_KNOWN_DIR/assetlinks.json.tmp"
    COUNT=0
    OLD_IFS="$IFS"
    IFS=','
    printf '[{"relation":["delegate_permission/common.get_login_creds","delegate_permission/common.handle_all_urls"],"target":{"namespace":"android_app","package_name":"%s","sha256_cert_fingerprints":[' "$(json_escape "$PACKAGE_NAME")" > "$TMP"
    for FINGERPRINT_RAW in $FINGERPRINTS_RAW; do
        if ! FINGERPRINT="$(normalize_fingerprint "$FINGERPRINT_RAW")"; then
            continue
        fi
        if [ "$COUNT" -gt 0 ]; then
            printf ',' >> "$TMP"
        fi
        printf '"%s"' "$FINGERPRINT" >> "$TMP"
        COUNT=$((COUNT + 1))
    done
    IFS="$OLD_IFS"

    if [ "$COUNT" -eq 0 ]; then
        rm -f "$TMP"
        return 0
    fi
    printf ']}}]\n' >> "$TMP"
    mv "$TMP" "$WELL_KNOWN_DIR/assetlinks.json"
}

mkdir -p "$WELL_KNOWN_DIR"
rm -f "$WELL_KNOWN_DIR/apple-app-site-association" "$WELL_KNOWN_DIR/assetlinks.json"
write_apple_app_site_association
write_assetlinks

PORT="$(/bin/sh /opt/resolve-spire-listen-port.sh)"
# sed delimiter must not appear in the port; use # for special chars
sed "s#__SPIRE_UPSTREAM_PORT__#$PORT#g" /etc/nginx/nginx.conf.template > /tmp/nginx.conf

echo "[nginx-entrypoint] rendered /tmp/nginx.conf for upstream port: $PORT"
echo "[nginx-entrypoint] generated passkey well-known files:"
find "$WELL_KNOWN_DIR" -maxdepth 1 -type f -print | sed "s#^$WELL_KNOWN_DIR/#  #" || true
echo "[nginx-entrypoint] active redacted logging lines:"
grep -n "map \$uri \$route_static\|log_format redacted\|access_log " /tmp/nginx.conf || true
echo "[nginx-entrypoint] active device route mappings:"
grep -n "/device/:id/" /tmp/nginx.conf || true

exec nginx -c /tmp/nginx.conf -g "daemon off;"
