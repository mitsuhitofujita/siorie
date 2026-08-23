# Repository Structure

## Overview

This repository is a monorepo. Runnable applications live under `apps/`: `apps/api` (Go) and `apps/web` (React). The root `justfile` is the single entry point for setup, development, build, test, lint, and format tasks.

```text
.
├── apps/
│   ├── api/
│   │   ├── cmd/server/main.go
│   │   ├── internal/server/
│   │   │   ├── server.go
│   │   │   └── server_test.go
│   │   ├── go.mod
│   │   ├── go.sum
│   │   └── justfile
│   └── web/
│       ├── src/
│       │   ├── App.tsx
│       │   ├── App.test.tsx
│       │   ├── App.css
│       │   ├── index.css
│       │   ├── main.tsx
│       │   └── test/setup.ts
│       ├── .prettierrc.json
│       ├── .prettierignore
│       ├── eslint.config.js
│       ├── index.html
│       ├── package.json
│       ├── pnpm-lock.yaml
│       ├── tsconfig.app.json
│       ├── tsconfig.json
│       ├── tsconfig.node.json
│       └── vite.config.ts
├── docs/
│   ├── discussions/
│   ├── worklogs/
│   ├── decisions/
│   └── design/
├── .gitignore
├── justfile
├── mise.toml
└── README.md
```

## `apps/api`

A single Go module (`github.com/mitsuhitofujita/siorie/apps/api`) using chi as the router and Huma to produce typed, OpenAPI-reflectable handlers.

- `cmd/server/main.go` reads the port from the `PORT` environment variable (falling back to `8080` locally), starts the HTTP server, and shuts it down gracefully on `SIGINT`/`SIGTERM`.
- `internal/server` builds the router. It currently exposes one endpoint, `GET /api/hello`, returning a JSON greeting; the handler is covered by an `httptest`-based test.
- `apps/api/justfile` provides `setup`, `dev`, `build`, `test`, `lint` (`go vet`), `format` (`gofmt -w`), `format-check`, and `check` (`format-check` → `lint` → `test` → `build`), all independent of the caller's working directory.

## `apps/web`

A Vite + TypeScript + React application managed with pnpm as the only package manager; no pnpm workspace is used.

- `src/App.tsx` currently renders a Hello World heading; there is no routing, state management, or component library yet.
- Linting uses ESLint's flat config (`eslint.config.js`) with `typescript-eslint`, `eslint-plugin-react-hooks`, and `eslint-plugin-react-refresh`.
- Formatting uses Prettier (`.prettierrc.json`, `.prettierignore`).
- Testing uses Vitest with `@testing-library/react`, `@testing-library/jest-dom`, and jsdom (`src/test/setup.ts`).
- `package.json` scripts: `dev`, `build` (`tsc -b && vite build`), `test` (`vitest run`), `lint`, `format`, `format:check`, `preview`. The `packageManager` field pins the pnpm version used.

## Root

- `justfile` recipes: `setup`, `dev-api`, `dev-web`, `build`, `test`, `lint`, `format`, `check`. Go tasks are delegated to `apps/api/justfile` via just's cross-directory recipe resolution (e.g. `just apps/api/build`); Web tasks call the `package.json` scripts via `pnpm --dir apps/web`. `check` runs format-checking, lint, test, and build for both apps and does not rewrite files; `format` is the file-rewriting task and is run separately.
- `mise.toml` pins the development versions of Go, Node.js, pnpm, just, and gcloud.
- `.gitignore` excludes the generated `apps/api/bin/`, `apps/web/dist/`, and `apps/web/node_modules/`.
- `docs/` holds the discussions/worklogs/decisions/design layout described in `docs/README.md`.

## Not yet present

Firestore, Google authentication, the business (groups/items) API, Tailwind CSS, shadcn/ui, combined serving of the SPA from the Go binary, Docker/Cloud Build/Cloud Run, and Terraform are not part of this scaffold. They are introduced by later worklogs.

## Decisions

- [0001: Monorepo layout with independent Go API and React SPA modules](../decisions/0001-monorepo-scaffold.md)
