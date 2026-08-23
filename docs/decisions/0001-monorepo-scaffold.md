# 0001: Monorepo layout with independent Go API and React SPA modules

Discussions: [monorepo directory design](../discussions/20260823-monorepo-directory-design/proposal.md), [purpose and initial tech stack](../discussions/20260823-purpose-and-initial-tech-stack/proposal.md)
Worklog: [scaffold Go API and React SPA modules](../worklogs/20260823-scaffold-app-modules/README.md)

## Status

Accepted.

## Decision

- The repository is a monorepo. Runnable applications live under `apps/`, currently `apps/api` and `apps/web`, each with its own build, dependency, and test boundary.
- `apps/api` is a single Go module using chi as the router and Huma to produce typed, OpenAPI-reflectable handlers. It is split into `cmd/server` (process entrypoint: reads `PORT`, starts and shuts down the HTTP server) and `internal/server` (router and handler construction).
- `apps/web` is a Vite + TypeScript + React application, managed with pnpm as the only package manager. No pnpm workspace is introduced yet; the project stays a single package until a second JS/TS package or shared library exists.
- The root `justfile` is the single entry point for the repository. Go-specific recipes live in `apps/api/justfile` and are invoked from the root via just's cross-directory recipe resolution; Web recipes call the `package.json` scripts through `pnpm --dir apps/web`.
- Build and dependency artifacts (`apps/api/bin/`, `apps/web/dist/`, `apps/web/node_modules/`) are excluded from version control and kept out of source directories.
- No shared package directory (e.g. `packages/`) is created ahead of an actual second consumer.

## Rationale

The API and frontend have different toolchains and release cadences, so treating them as independent modules under `apps/` avoids coupling their dependencies while still keeping one repository and one `docs/` history. A single root task runner keeps the polyglot stack approachable without hiding tool-specific behavior (Go recipes still run `go` directly; Web recipes still run `pnpm`/Vite directly). A pnpm workspace and a shared package directory both add coordination overhead that has no payoff with only one JS package and no cross-app shared code yet; both are deferred until a concrete second consumer exists rather than built speculatively.
