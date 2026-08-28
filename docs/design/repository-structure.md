# Repository Structure

## Overview

This repository is a monorepo. Runnable applications live under `apps/`: `apps/api` (Go) and `apps/web` (React). The root `justfile` is the single entry point for setup, development, build, test, lint, and format tasks.

```text
.
├── apps/
│   ├── api/
│   │   ├── cmd/server/main.go
│   │   ├── internal/
│   │   │   ├── googleauth/       # Google ID Token verification
│   │   │   ├── server/           # router, hello + auth + group + item handlers
│   │   │   └── store/            # Firestore-backed users/sessions/groups/items
│   │   ├── .env.example
│   │   ├── go.mod
│   │   ├── go.sum
│   │   └── justfile
│   └── web/
│       ├── src/
│       │   ├── components/       # layout, shared UI, shadcn/ui primitives (ui/)
│       │   ├── lib/               # auth (Google Identity Services), api client, utils
│       │   ├── pages/             # HomePage, groups/ (list/detail/new/edit), groups/items/ (detail/new/edit)
│       │   ├── test/              # setup.ts, renderWithProviders.tsx
│       │   ├── App.tsx
│       │   ├── index.css
│       │   ├── main.tsx
│       │   └── vite-env.d.ts
│       ├── .env.example
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

- `cmd/server/main.go` reads `PORT` (falling back to `8080` locally), `GOOGLE_CLIENT_ID`, `APP_ORIGIN`, and `FIRESTORE_PROJECT_ID` (all three required, `log.Fatalf` if unset), starts the HTTP server, and shuts it down gracefully on `SIGINT`/`SIGTERM`.
- `internal/server` builds the router: `GET /api/hello` (JSON greeting); the auth endpoints
  `POST /api/auth/google`, `POST /api/auth/logout`, `GET /api/me`; the group endpoints
  `GET/POST /api/groups`, `GET/PATCH/DELETE /api/groups/{groupId}`; and the item endpoints
  `GET/POST /api/groups/{groupId}/items`,
  `GET/PATCH/DELETE /api/groups/{groupId}/items/{itemId}`, all registered via `huma.Register`
  using Huma's `cookie:`/`header:` struct tags for the `__Host-session` cookie and `Origin`
  validation. Group and item handlers resolve the caller's `userID` from the session cookie via a
  shared `authenticateSession` helper (factored out of the `GET /api/me` handler) and scope every
  Firestore path to that ID; state-changing group and item routes validate `Origin` like the auth
  routes. Every item handler first resolves `groupId` through a shared `requireGroup` helper
  (wrapping `GetGroup`), so a missing or foreign `groupId` returns 404 before the item store is
  touched.
- `internal/googleauth` verifies Google ID Tokens (signature, `aud`, `iss`, `exp`) behind a `Verifier` interface, wrapping `google.golang.org/api/idtoken`.
- `internal/store` persists users, sessions, groups, and items in Firestore (`users/{sub}`,
  `sessions/{sha256(sessionId)}`, `users/{sub}/groups/{groupId}`,
  `users/{sub}/groups/{groupId}/items/{itemId}`) behind
  `UserStore`/`SessionStore`/`GroupStore`/`ItemStore` interfaces; `FirestoreStore` is the real
  implementation (auto-detects the local emulator via `FIRESTORE_EMULATOR_HOST`), `MemoryStore`
  is an in-memory double used by fast handler tests. `GroupStore` and `ItemStore` methods are
  entity-qualified (`ListGroups`/`CreateGroup`/…,
  `ListItems`/`CreateItem`/`GetItem`/`UpdateItem`/`DeleteItem`) rather than bare verbs, since Go
  has no method overloading and both stores hang off the same structs. Groups and items are
  listed in creation order. `DeleteGroup` removes the group's `items` subcollection before the
  group document, both steps idempotent so a retried delete is safe; `DeleteItem` is a plain
  idempotent document delete with no cascade.
- `apps/api/.env` (loaded automatically via `just`'s `dotenv-load`; see `.env.example`) holds the server's local environment variables, including `FIRESTORE_EMULATOR_HOST` to point at the local Firestore emulator.
- `apps/api/justfile` provides `setup`, `dev`, `firestore-emulator` (runs the local Firestore emulator on port 8090), `build`, `test` (starts its own throwaway Firestore emulator on port 8091 for the duration of the run), `lint` (`go vet`), `format` (`gofmt -w`), `format-check`, and `check` (`format-check` → `lint` → `test` → `build`), all independent of the caller's working directory.

## `apps/web`

A Vite + TypeScript + React application managed with pnpm as the only package manager; no pnpm workspace is used.

- `src/lib/auth.tsx` (`AuthProvider`) loads the Google Identity Services script once, initializes
  `google.accounts.id` with `VITE_GOOGLE_CLIENT_ID`, and exposes `renderSignInButton(container)`,
  which mounts Google's own rendered "Sign in with Google" button. The button's credential callback
  `POST`s to `/api/auth/google`, then re-checks `GET /api/me` to update auth state; `logout()` calls
  `POST /api/auth/logout`. `src/pages/HomePage.tsx` mounts the button into an empty container in the
  unauthenticated state.
- `apps/web/.env` (see `.env.example`) holds `VITE_GOOGLE_CLIENT_ID`.
- `vite.config.ts` proxies `/api/*` to `http://localhost:8080` in dev, so `pnpm dev` and the Go API
  server present as one browser-visible origin (`http://localhost:5173`) — required for the
  `__Host-session` cookie and the `Origin` check to behave as they do in the single-origin Cloud Run
  deployment. The Go server's `APP_ORIGIN` must be set to this Vite origin for local dev, not its own
  port.
- Linting uses ESLint's flat config (`eslint.config.js`) with `typescript-eslint`, `eslint-plugin-react-hooks`, and `eslint-plugin-react-refresh`.
- Formatting uses Prettier (`.prettierrc.json`, `.prettierignore`).
- Testing uses Vitest with `@testing-library/react`, `@testing-library/jest-dom`, and jsdom
  (`src/test/setup.ts`, which also registers `afterEach(cleanup)` since `@testing-library/react`'s own
  auto-cleanup only self-registers when `test.globals` is enabled, which this project does not do).
- `package.json` scripts: `dev`, `build` (`tsc -b && vite build`), `test` (`vitest run`), `lint`, `format`, `format:check`, `preview`. The `packageManager` field pins the pnpm version used.

## Root

- `justfile` recipes: `setup`, `dev-api`, `dev-web`, `build`, `test`, `lint`, `format`, `check`. Go tasks are delegated to `apps/api/justfile` via just's cross-directory recipe resolution (e.g. `just apps/api/build`); Web tasks call the `package.json` scripts via `pnpm --dir apps/web`. `check` runs format-checking, lint, test, and build for both apps and does not rewrite files; `format` is the file-rewriting task and is run separately.
- `mise.toml` pins the development versions of Go, Node.js, pnpm, just, gcloud, Java (for the Firestore emulator), and Terraform.
- `.gitignore` excludes the generated `apps/api/bin/`, `apps/web/dist/`, `apps/web/node_modules/`, and the local `apps/api/.env` / `apps/web/.env` files.
- `docs/` holds the discussions/worklogs/decisions/design layout described in `docs/README.md`.

## Not yet present

Combined serving of the SPA from the Go binary, Docker/Cloud Build/Cloud Run, and Terraform are
not part of this repository yet. Firestore, Google authentication, Tailwind CSS, shadcn/ui, and
the group and item entity API endpoints have been introduced by later worklogs (see below); the
item-list endpoint currently returns every item with no pagination.

## Decisions

- [0001: Monorepo layout with independent Go API and React SPA modules](../decisions/0001-monorepo-scaffold.md)
- [0002: Google ID Token authentication with Firestore-backed sessions](../decisions/0002-google-id-token-auth.md)
- [0003: Group entity CRUD](../decisions/0003-group-entity-crud.md)
- [0004: Item entity CRUD](../decisions/0004-item-entity-crud.md)
