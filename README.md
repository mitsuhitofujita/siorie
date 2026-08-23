# siorie
A simple web app for saving and organizing things you want to remember.

## Development

This repository is a monorepo containing a Go API (`apps/api`) and a React SPA (`apps/web`), managed from the repository root with [just](https://github.com/casey/just).

### Requirements

Tool versions are managed with [mise](https://mise.jdx.dev/). Install the pinned versions of Go, Node.js, pnpm, and just with:

```sh
mise install
```

### Setup

```sh
just setup
```

### Development servers

Run the API and Web dev servers in separate terminals:

```sh
just dev-api
just dev-web
```

### Checks

```sh
just check
```

Runs format checking, static analysis, tests, and the build for both the API and Web app. Run `just format` first to apply formatting.
