---
date: 2026-08-23
status: merged
discussions: [0001-purpose-and-initial-tech-stack, 0002-monorepo-directory-design]
decisions: [0001-monorepo-scaffold]
pr: null
---

# Create scaffolds for the Go API and React SPA

## Status

Done. All completion criteria below are met.

## Purpose

Follow the monorepo layout defined in [monorepo directory design](../../discussions/0002-monorepo-directory-design/proposal.md) to create minimal scaffolds for the Go API and the React SPA. Reach a state where setup, development, testing, linting, and building can all be run from the repository root.

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

## Completion record

### Date completed

2026-08-23

### Pinned versions

- Go: 1.27.0
- Node.js: v24.19.0
- pnpm: 11.22.0
- just: 1.58.0
- React: ^19.2.8, React DOM ^19.2.8
- Vite: ^8.2.0 (resolved 8.2.2)
- chi: github.com/go-chi/chi/v5 v5.3.2
- Huma: github.com/danielgtaylor/huma/v2 v2.39.1 (with its `adapters/humachi` subpackage; no separate module needed)
- ESLint 10.9.0, typescript-eslint 8.67.0, Prettier 3.9.6, Vitest 4.1.11, @testing-library/react 16.3.2

### Where the implementation diverged from the plan, and why

- **Reused an existing worklog instead of creating a new one.** The `/work` flow normally creates `docs/worklogs/<today's date>-<short description>/`. This worklog directory already existed (created together with the plan in an earlier session, committed as `2c3d76b`), already dated today, already linked bidirectionally from both source discussions' `discovery.md`, and already contained a full implementation plan ending in "Status: Not started." Creating a second, nearly-identical worklog directory would have duplicated this one for no benefit, so this document was continued in place instead of forking a new directory.
- **Vite's `react-ts` template no longer matches the tooling in `proposal.md`.** The current `pnpm create vite` template ships `oxlint` (a Rust-based linter) instead of ESLint, no Prettier, and adds demo assets (`hero.png`, `icons.svg`, `favicon.svg`) and a per-app `.gitignore`/`README.md` not listed in the proposal's directory tree. Since `proposal.md`'s tree explicitly lists `.prettierrc.json` and `eslint.config.js`, and the plan's step 3.5 explicitly says "Configure ESLint and Prettier," the scaffold was adjusted to match the plan: `oxlint` was removed and replaced with ESLint (flat config) + `typescript-eslint` + `eslint-plugin-react-hooks` + `eslint-plugin-react-refresh`, Prettier was added, and the demo assets, per-app `.gitignore`, and per-app `README.md` were deleted (their concerns are covered by the root `.gitignore` and root `README.md` instead, matching the proposal's directory tree).
- **`eslint-plugin-react-hooks` v7's `configs['recommended-latest']` is not flat-config shaped.** It exports `plugins: ["react-hooks"]` (an eslintrc-style array of plugin names), which ESLint 10's flat config rejects outright ("A config object has a 'plugins' key defined as an array of strings"). The correctly-shaped flat config lives one level deeper, at `configs.flat['recommended-latest']` (`plugins: { "react-hooks": <pluginObject> }`). `apps/web/eslint.config.js` uses that path instead.
- **Prettier was formatting `pnpm-lock.yaml`.** Added `pnpm-lock.yaml` to `.prettierignore` alongside `dist`, since reformatting the lockfile is unnecessary churn and not something `pnpm install` itself expects.
- **Root justfile delegates to sub-justfiles via path-qualified recipe names** (e.g. `just apps/api/setup`), which was not spelled out in the plan. This works because `just` resolves `<dir>/<recipe>` by locating the nearest justfile under `<dir>` and invoking `<recipe>` there — confirmed by running `just setup` from the repository root and watching it `cd` into `apps/api` correctly. This was more direct than the alternative of duplicating each Go recipe's shell command in the root justfile.

### Verification commands run and their results

All run from the repository root unless noted otherwise.

- `just setup` — downloads Go modules and runs `pnpm install` for `apps/web`. Succeeded.
- `just format` — `gofmt -w .` for the API, `prettier --write .` for Web. Succeeded (no diffs after the first run).
- `just check` — runs, in order: `apps/api` `format-check`/`lint`/`test`/`build`, then Web `format:check`/`lint`/`test`/`build`. All steps passed:
  - `go vet ./...`: clean.
  - `go test ./...`: `ok  github.com/mitsuhitofujita/siorie/apps/api/internal/server`.
  - `go build -o apps/api/bin/server ./cmd/server`: succeeded.
  - `prettier --check .`: "All matched files use Prettier code style!"
  - `eslint .`: no output, no errors.
  - `vitest run`: 1 test file, 1 test, passed (`App` renders the "Hello, World!" heading).
  - `tsc -b && vite build`: succeeded, `dist/` produced.
- `PORT=8123 just dev-api` then `curl -s -D - http://localhost:8123/api/hello`: `HTTP/1.1 200 OK`, `Content-Type: application/json`, body `{"$schema":"...","message":"Hello, World!"}`. The `$schema` field is added automatically by Huma and is expected, not a bug.
- `just dev-web`, then loaded `http://localhost:5173/` in a real browser tab (via Claude in Chrome): page title "siorie", visible text "Hello, World!", no console errors. Tab and dev server were closed afterward.
- `git status --short` after all of the above: only `.gitignore` (modified), `README.md` (modified), `apps/` (new), `justfile` (new) — no build artifacts, `node_modules`, or caches tracked.

## Difficulties

### `eslint-plugin-react-hooks`'s `recommended-latest` was not flat-config shaped

It was exported in eslintrc-style form, `plugins: ["react-hooks"]` (an array of strings), and
`extend`-ing it directly into ESLint 10's flat config died immediately with "A config object has a
'plugins' key defined as an array of strings." The package's type definitions and README alone
weren't enough to notice this — only by running `node -e` to actually expand the `configs` object's
contents did it become clear that a correctly-shaped flat config exists on a different path,
`configs.flat['recommended-latest']` (`plugins: { "react-hooks": <object> }`). This felt less like a
one-off configuration mistake and more like a trap inherent to how React-adjacent packages currently
keep multiple config exports side by side while migrating to flat config.

### The Vite template had changed since the proposal was written

Running `pnpm create vite web --template react-ts` generated `.oxlintrc.json` instead of
`eslint.config.js`, and didn't include Prettier at all. Since `proposal.md`'s directory tree
explicitly lists `.prettierrc.json` and `eslint.config.js`, and the plan itself says "Configure
ESLint and Prettier," the plan was treated as authoritative: oxlint was removed and replaced with
ESLint + Prettier. That said, whoever redoes this same scaffold next (human or agent) might look at
the template's actual current output and reasonably wonder whether oxlint is the new standard by
then.

### Overlap with an existing worklog directory

The `/work` procedure assumes creating a new worklog directory dated today. In this case, though, the
source discussion's (`0002-monorepo-directory-design`) `discovery.md` already linked to a worklog
dated today (`0001-scaffold-app-modules`), and its contents were already a complete implementation
plan written for this exact work. Creating a second, near-duplicate directory would have just
duplicated the same content, so the existing one was continued in place instead. This felt less like
an accident and more like a gap between two things that don't quite line up: the design where one
discussion can spawn multiple worklogs, and the `/work` procedure's assumption of always creating a
fresh dated directory — there's no explicit path for reusing an existing worklog.
