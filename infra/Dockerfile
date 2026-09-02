# Deploy image for the siorie app (API server + co-served SPA).
#
# This is deploy machinery, not application code, so it lives in infra/ rather
# than at the repo root or in apps/api/. The build context is always the
# repository root and this file is always passed explicitly:
#
#   docker build -f infra/Dockerfile <repo-root>
#
# (see infra/justfile `publish-image`). Plain `docker build .` will not work.

# ---- builder ----
# Tag pinned to match apps/api/go.mod (`go 1.27.0`). Not digest-pinned; the
# proposal accepts tag pinning for now (0001's reproducibility line would prefer
# a digest).
FROM golang:1.27-bookworm AS builder

WORKDIR /src

# Resolve modules first so this layer is cached unless go.mod/go.sum change.
COPY apps/api/go.mod apps/api/go.sum ./
RUN go mod download

COPY apps/api/ ./

# CGO disabled → a static binary that runs on distroless/static.
RUN CGO_ENABLED=0 GOOS=linux go build -o /server ./cmd/server

# ---- web ----
# Tag pinned to the major mise.toml's `node = "lts"` currently resolves to
# (v24). Tag-pinned like the Go builder, not digest-pinned.
FROM node:24-bookworm AS web

WORKDIR /web

# Resolve dependencies first so this layer is cached unless the manifest or
# lockfile changes. corepack reads package.json's `packageManager` field, so
# the pnpm version is pinned by the repo, not by this file.
COPY apps/web/package.json apps/web/pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

# Inlined into the bundle by `vite build`. Passed by infra/justfile
# `publish-image`; must be the same OAuth Web client ID the server gets as
# GOOGLE_CLIENT_ID at deploy time, or sign-in fails with a silent 401
# (proposal 0028 accepts the double entry without an automated check).
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

COPY apps/web/ ./

# `import.meta.env.DEV` is false here, so the Dev Login button is stripped.
RUN pnpm build

# ---- final ----
# distroless/static: CA certificates (needed for Firestore / Google API TLS), no
# shell, runs as non-root (UID 65532). No tzdata — fine while the server is
# UTC-only; `import _ "time/tzdata"` would be needed for local-time formatting.
FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=builder /server /server

# The built SPA, served by the Go binary itself (WEB_ROOT=/web in infra/app).
# Root-owned with build-time permissions; nonroot (UID 65532) only needs read.
COPY --from=web /web/dist /web

# Cloud Run injects PORT (the server falls back to 8080 locally). Documentation
# only; Cloud Run ignores EXPOSE.
EXPOSE 8080

ENTRYPOINT ["/server"]
