# Build context is the monorepo root (see docker-compose.yml: context: ../..).
# The Spire runtime is Rust; JS workspace packages are only needed by the
# external integration harness, not by this container.

FROM rust:1.94-alpine AS build

RUN apk add --no-cache musl-dev openssl-dev openssl-libs-static pkgconfig

WORKDIR /repo
COPY apps/spire/rust/Cargo.toml apps/spire/rust/Cargo.lock ./apps/spire/rust/
COPY apps/spire/rust/src ./apps/spire/rust/src
COPY apps/spire/src/server/cliPasskeyPage.ts ./apps/spire/src/server/cliPasskeyPage.ts
COPY packages/types/openapi.json packages/types/asyncapi.json ./packages/types/

RUN cargo build --release --manifest-path apps/spire/rust/Cargo.toml

FROM alpine:3.22

RUN apk add --no-cache ca-certificates \
 && apk add --no-cache libcrypto3 libssl3 \
 && addgroup -g 1000 spire \
 && adduser -u 1000 -G spire -s /bin/sh -D spire

WORKDIR /app
COPY --from=build /repo/apps/spire/rust/target/release/spire-rs /app/spire-rs

RUN mkdir -p /app/deploy
COPY --chown=spire:spire apps/spire/deploy/resolve-spire-listen-port.sh \
    apps/spire/deploy/spire-container-health.sh \
    /app/deploy/
RUN chmod +x /app/deploy/resolve-spire-listen-port.sh /app/deploy/spire-container-health.sh /app/spire-rs

RUN mkdir -p /data/files /data/avatars /data/emoji && chown -R spire:spire /data

USER spire
WORKDIR /data

ENV NODE_ENV=production

EXPOSE 16777

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["/bin/sh", "/app/deploy/spire-container-health.sh"]

ENTRYPOINT ["/app/spire-rs"]
