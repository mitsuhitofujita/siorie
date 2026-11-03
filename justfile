web_dir := source_directory() / "apps/web"

# Install Go and Web dependencies.
setup:
    just apps/api/setup
    pnpm --dir {{web_dir}} install

# Run the Firestore emulator, API, and Web dev server in one terminal.
dev:
    #!/usr/bin/env bash
    # Logs are prefixed with [firestore], [api], and [web]. Ctrl+C stops all three.
    set -euo pipefail
    cd {{source_directory()}}
    if [ ! -x {{web_dir}}/node_modules/.bin/concurrently ]; then
        echo "concurrently not found; run 'just setup' first" >&2
        exit 1
    fi
    {{web_dir}}/node_modules/.bin/concurrently \
        --names firestore,api,web \
        --prefix-colors blue,green,magenta \
        --kill-others-on-fail \
        --kill-timeout 5000 \
        --teardown "fuser -k 8090/tcp" \
        "just apps/api/firestore-emulator" \
        "bash -c 'until curl -s -o /dev/null http://localhost:8090/; do sleep 0.2; done; exec just apps/api/dev'" \
        "bash -c 'until curl -sf http://localhost:8080/api/hello >/dev/null; do sleep 0.2; done; exec pnpm --dir {{web_dir}} dev'"

# Build the SPA and serve it from the API in one terminal (production-like).
dev-static: build-web
    #!/usr/bin/env bash
    # Opens at http://localhost:8080; no Vite, so rebuild to see changes.
    set -euo pipefail
    cd {{source_directory()}}
    if [ ! -x {{web_dir}}/node_modules/.bin/concurrently ]; then
        echo "concurrently not found; run 'just setup' first" >&2
        exit 1
    fi
    {{web_dir}}/node_modules/.bin/concurrently \
        --names firestore,api \
        --prefix-colors blue,green \
        --kill-others-on-fail \
        --kill-timeout 5000 \
        --teardown "fuser -k 8090/tcp" \
        "just apps/api/firestore-emulator" \
        "bash -c 'until curl -s -o /dev/null http://localhost:8090/; do sleep 0.2; done; exec env APP_ORIGIN=http://localhost:8080 WEB_ROOT={{web_dir}}/dist just apps/api/dev'"

# Build the Web app.
build-web:
    pnpm --dir {{web_dir}} build

# Run the Go API dev server.
dev-api:
    just apps/api/dev

# Run the Vite dev server.
dev-web:
    pnpm --dir {{web_dir}} dev

# Run the local Firestore emulator for development.
dev-firestore:
    just apps/api/firestore-emulator

# Serves on port 5173, the same origin as `dev-web`, so APP_ORIGIN, the
# session cookie, and the /api proxy all behave as in dev. Stop `dev-web`
# first (the port is shared on purpose); `dev-api` and `dev-firestore` run
# unchanged alongside it.

# Build the Web app and serve the production bundle with Vite preview.
preview-web:
    pnpm --dir {{web_dir}} build
    pnpm --dir {{web_dir}} preview

# Build the API and Web app.
build:
    just apps/api/build
    pnpm --dir {{web_dir}} build

# Run API and Web tests.
test:
    just apps/api/test
    pnpm --dir {{web_dir}} test

# Run static analysis for API and Web.
lint:
    just apps/api/lint
    pnpm --dir {{web_dir}} lint

# Format API, Web, and infra source files.
format:
    just apps/api/format
    pnpm --dir {{web_dir}} format
    just infra/format

# Run format checking, lint, test, and build for API and Web, plus infra format checking.
check:
    just apps/api/check
    pnpm --dir {{web_dir}} format:check
    pnpm --dir {{web_dir}} lint
    pnpm --dir {{web_dir}} test
    pnpm --dir {{web_dir}} build
    just infra/format-check
