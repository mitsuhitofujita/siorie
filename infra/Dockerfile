# Deploy image for the siorie API server.
#
# This is deploy machinery, not application code, so it lives in infra/ rather
# than at the repo root or in apps/api/. The build context is always the
# repository root and this file is always passed explicitly:
#
#   docker build -f infra/Dockerfile <repo-root>
#
# (see infra/justfile `publish-image`). Plain `docker build .` will not work.
#
# The image contains the Go binary only. Static SPA co-serving is a separate
# topic; when it lands, the builder gains a web-build stage and the final stage
# copies apps/web/dist alongside the binary.

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

# ---- final ----
# distroless/static: CA certificates (needed for Firestore / Google API TLS), no
# shell, runs as non-root (UID 65532). No tzdata — fine while the server is
# UTC-only; `import _ "time/tzdata"` would be needed for local-time formatting.
FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=builder /server /server

# Cloud Run injects PORT (the server falls back to 8080 locally). Documentation
# only; Cloud Run ignores EXPOSE.
EXPOSE 8080

ENTRYPOINT ["/server"]
