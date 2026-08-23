---
date: 2026-08-23
status: in-progress
discussions: [20260823-purpose-and-initial-tech-stack, 20260823-monorepo-directory-design]
decisions: []
pr: null
---

# Create scaffolds for the Go API and React SPA

## Status

Not started.

## Purpose

Follow the monorepo layout defined in [monorepo directory design](../../discussions/20260823-monorepo-directory-design/proposal.md) to create minimal scaffolds for the Go API and the React SPA. Reach a state where setup, development, testing, linting, and building can all be run from the repository root.

## Assumptions

- Go, Node.js, pnpm, and just, managed via `mise.toml`, are available.
- When adding dependencies, check the latest stable version at the time of implementation and pin it via the lock file.
- This plan does not introduce Firestore, Google authentication, business APIs, Tailwind CSS, shadcn/ui, Docker, or Cloud Build. These are follow-up work that require their own design and validation.

## Completion criteria

- `apps/api` exists as an independent Go module.
- Starting the Go API returns a Hello World-equivalent JSON response for a normal HTTP request.
- Automated tests verify the behavior of the Go handler.
- `apps/web` exists as a Vite + TypeScript + React application managed with pnpm.
- Starting the React SPA displays a Hello World-equivalent screen.
- Automated tests verify the rendering of the React component.
- `just setup`, `just build`, `just test`, `just lint`, `just format`, and `just check` can all be run from the repository root.
- `just check` succeeds, and `git status --short` shows no unexpected generated files afterward.

## Implementation steps

### 1. Create the Go API module

1. Initialize a Go module in `apps/api`. Use a module path consistent with the repository's public URL.
2. Add `chi` and the Huma chi adapter at their latest stable versions as of implementation, generating `go.mod` and `go.sum`.
3. Build a router-construction function and a Hello World-equivalent handler in `internal/server`. Use `/api/hello` as the path to signal the API boundary, and return typed JSON that Huma can reflect into OpenAPI.
4. Start the HTTP server in `cmd/server/main.go`. Read the port from the `PORT` environment variable, considering both Cloud Run and local execution, and fall back to a local default when unset.
5. Verify the status code, Content-Type, and JSON response with `httptest`.

### 2. Create just recipes for Go

1. Define `setup`, `dev`, `build`, `test`, `lint`, `format`, `format-check`, and `check` in `apps/api/justfile`.
2. Standardize the `build` output path as `apps/api/bin/server`.
3. `test` runs `go test ./...`, `lint` runs `go vet ./...`, and `format` runs `gofmt` against the Go source. `format-check` fails if any files have not had `gofmt` applied.
4. Confirm the recipes do not depend on the caller's working directory.

### 3. Create the React SPA module

1. Create a Vite React + TypeScript scaffold in `apps/web`. Do not keep the generator's output as-is; retain only the files this plan needs.
2. Record the exact pnpm version used in `package.json`'s `packageManager` field and generate `pnpm-lock.yaml`.
3. Reduce the app to a minimal Hello World `App` component and CSS. Remove Vite's demo counter, logo, and assets.
4. Add Vitest, Testing Library, and jsdom, and verify that the Hello World heading is displayed.
5. Configure ESLint and Prettier, and align the `dev`, `build`, `test`, `lint`, `format`, and `format:check` scripts in `package.json`.

### 4. Create root-level tasks and ignore settings

1. Define `setup`, `dev-api`, `dev-web`, `build`, `test`, `lint`, `format`, and `check` in the root `justfile`.
2. Delegate Go recipes to `apps/api/justfile`, and have Web recipes call the `package.json` scripts via `pnpm --dir apps/web`.
3. `check` runs format-diff checking, static analysis, tests, and the build, exiting non-zero if any step fails. `format` is a file-rewriting task and is not called from `check`.
4. Add `apps/api/bin/`, `apps/web/dist/`, `apps/web/node_modules/`, and the generated output of any adopted test tools to `.gitignore`.
5. Document the required tools, `mise install`, `just setup`, how to start the API and Web dev servers, and `just check` in `README.md`.

### 5. Verify

1. Run `just setup` from the repository root.
2. Run `just format` to normalize formatting.
3. Run `just check` and confirm that format checking, static analysis, tests, and the build all succeed for both the API and Web.
4. Start `just dev-api` and confirm the status code, Content-Type, and JSON response of `/api/hello` with an HTTP client.
5. Start `just dev-web` and confirm the Hello World screen renders in the browser with no console errors.
6. Check `git status --short` and confirm build artifacts, dependency directories, and caches are not tracked.

## Files affected

### New files

- `apps/api/cmd/server/main.go`
- `apps/api/internal/server/server.go`
- `apps/api/internal/server/server_test.go`
- `apps/api/go.mod`
- `apps/api/go.sum`
- `apps/api/justfile`
- Vite, React, TypeScript, test, lint, and format configuration under `apps/web/`
- `apps/web/pnpm-lock.yaml`
- `justfile`

### Updated files

- `.gitignore`
- `README.md`

## Out of scope for this plan

- Code that connects to Firestore
- Google Identity Services and sessions
- Group and item APIs
- React Router, state management, form management
- Tailwind CSS and shadcn/ui
- TypeScript code generation from OpenAPI
- Combined serving of the React SPA and Go API
- Docker, Cloud Build, Cloud Run
- Terraform

## To record upon completion

Once finished, update this document's status to "done" and append the following.

- Date completed
- The actual Go, Node.js, pnpm, React, Vite, chi, and Huma versions pinned
- Any places where the implementation diverged from the plan, and why
- The verification commands run and their results
