web_dir := source_directory() / "apps/web"

# Install Go and Web dependencies.
setup:
    just apps/api/setup
    pnpm --dir {{web_dir}} install

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

# Format API and Web source files.
format:
    just apps/api/format
    pnpm --dir {{web_dir}} format

# Run format checking, lint, test, and build for API and Web.
check:
    just apps/api/check
    pnpm --dir {{web_dir}} format:check
    pnpm --dir {{web_dir}} lint
    pnpm --dir {{web_dir}} test
    pnpm --dir {{web_dir}} build
