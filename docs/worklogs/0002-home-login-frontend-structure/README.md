---
date: 2026-08-23
status: in-progress
discussions:
  [
    0004-home-and-login,
    0005-single-resource-get-for-groups-and-items,
    0006-unauthenticated-route-guard,
  ]
decisions: []
pr: null
---

# Home, login, and common layout — frontend structure

## Scope

[0004-home-and-login](../../discussions/0004-home-and-login/proposal.md) defines the common
layout, nav menu, home page, page/URL list, and empty/loading states for the whole app.

This worklog implements only the **frontend structure**: routing, the common layout, the home page
(unauthenticated/authenticated), the nav menu, and the group/item CRUD pages with their empty and
loading states. It does not implement:

- The backend endpoints the proposal assumes (`GET /api/me`, `POST /api/auth/google`,
  `POST /api/auth/logout`, `/api/groups`, `/api/groups/:id/items`, ...). None of them exist yet in
  `apps/api` beyond `GET /api/hello`.
- Real Google Identity Services wiring (no OAuth client ID is provisioned).
- Real Firestore access (the Firestore emulator needs a JRE, which the user does not want to install
  yet).

This split was confirmed with the user before starting (three options were offered: frontend
structure only / frontend + backend route skeletons with in-memory data / full stack including a
real OAuth client and Firestore emulator). The user picked frontend-structure-only, and separately
noted the JRE requirement for the Firestore emulator as a reason to keep it out of scope for now.

Backend routes, real GIS integration, and Firestore access are left for later worklogs.

## Plan

- Introduce Tailwind CSS v4 + shadcn/ui (first use in this repo) and React Router.
- Build the common layout (header/footer), the slide-in nav menu, and reusable empty-state /
  delete-confirmation-modal pieces.
- Build the home page (loading / unauthenticated / authenticated) against a small `useAuth` hook
  that calls the real `/api/me` etc. contract, so it's a drop-in once the backend exists.
- Build the groups and items list/new/edit pages per the proposal's URL table, against a small
  typed API client, using local component state (no state-management library — the proposal defers
  that decision).
- Cover the interesting states (loading/empty/populated, unauth/auth, delete confirmation) with
  Vitest + Testing Library, mocking `fetch` since there is no real backend to hit.

## What was built

`apps/web` dependencies: `tailwindcss` + `@tailwindcss/vite` v4, `react-router-dom`, and the Radix
primitives (`react-slot`, `react-dialog`, `react-avatar`, `react-label`) plus `class-variance-authority`,
`clsx`, `tailwind-merge`, `lucide-react` that shadcn/ui components are built from. `@/*` → `./src/*`
path alias added to `vite.config.ts` and `tsconfig.app.json`.

- `src/index.css`: Tailwind v4 `@theme inline` mapping to CSS custom properties, using the same
  token values (`--background`, `--foreground`, `--border`, `--radius`, `--primary`,
  `--primary-foreground`, ...) as the `home-noauth.html` / `home-auth.html` mockups in the
  discussion directory, extended to the full shadcn/ui token set (card/secondary/muted/accent/
  destructive/input/ring). Light theme only — neither the mockups nor the proposal call for dark
  mode.
- `src/components/ui/*`: hand-written shadcn/ui-style primitives (`button`, `avatar`, `sheet`,
  `dialog`, `input`, `label`, `skeleton`) — written by hand against the Radix primitives rather than
  via the `shadcn` CLI, since the CLI pulls from a registry interactively and the components involved
  are simple. `sheet.tsx` (nav menu) and `dialog.tsx` (delete confirmation) use plain Tailwind
  `transition` + `data-[state=]` utilities for their open/close animation rather than
  `tailwindcss-animate`, which isn't installed.
- `src/lib/auth-context.ts` + `src/lib/auth.tsx`: `AuthState` (`loading` / `unauthenticated` /
  `authenticated`), `AuthContext`, `useAuth`, and `AuthProvider`. `AuthProvider` calls `GET /api/me`
  on mount and treats any non-2xx or network failure as unauthenticated. `login()` is a stub that
  logs a TODO pointing at the tech-stack discussion instead of calling Google Identity Services.
  `logout()` calls `POST /api/auth/logout` and always resets local state to unauthenticated
  regardless of the response.
- `src/lib/api.ts`: typed `fetch` wrappers for the groups/items endpoints from the tech-stack
  proposal's API table.
- `src/components/layout/AppLayout.tsx` + `NavMenu.tsx`: header (title left, account avatar right)
  + footer, and the avatar-triggered slide-in `Sheet` with the "グループ一覧" link and "ログアウト"
  button. Used for every route except `/`.
- `src/pages/HomePage.tsx`: no common layout, per the proposal. Renders loading skeleton /
  unauthenticated (title + login button) / authenticated (avatar + name + "グループ一覧へ" +
  "ログアウト") based on `useAuth()`.
- `src/pages/groups/{GroupsListPage,GroupNewPage,GroupEditPage}.tsx` and the `items/` equivalents:
  the six routes from the proposal's URL table, wired into `src/App.tsx` via `react-router-dom`.
  List pages show a `Skeleton` while loading, an `EmptyState` (message + CTA button) when the result
  is an empty array, and the list otherwise. Edit pages show the same loading skeleton while
  fetching, and a reusable `DeleteConfirmDialog` (custom modal, not `window.confirm`, buttons
  disabled and the confirm button relabeled while a deletion is in flight) for delete.
- Tests: `HomePage.test.tsx`, `NavMenu.test.tsx`, `DeleteConfirmDialog.test.tsx`,
  `GroupsListPage.test.tsx`, and an `App.test.tsx` routing smoke test, using a
  `src/test/renderWithProviders.tsx` helper that wraps a component in `MemoryRouter` +
  `AuthContext.Provider` with an arbitrary injected `AuthState` (so auth-state tests don't need to
  mock `fetch`). 14 tests, all passing. `pnpm lint`, `pnpm exec tsc -b --noEmit`, `pnpm format:check`,
  and `pnpm build` all pass.
- Manually verified in Chrome against `pnpm dev`: unauthenticated home, `/groups` empty state with
  common layout, the nav menu sliding in from the right on avatar click, and `/groups/new`.

## Deviations from the proposal / discovered gaps

- **The initial API has no single-resource GET for a group or an item.** The tech-stack proposal's
  API table only has `GET /api/groups` (list) and `GET /api/groups/{groupId}/items` (list) — no
  `GET /api/groups/{groupId}` or `GET /api/groups/{groupId}/items/{itemId}`. But this proposal
  describes the edit pages as showing a loading state while "既存データ取得中" (fetching existing
  data), which implies a per-resource fetch. I implemented edit pages by fetching the parent list
  and finding the matching entry by id client-side, since that's the only way to get single-resource
  data from the documented API. This works but means editing a group always re-fetches every group
  the user has, and doesn't scale — worth deciding explicitly (add single-resource GET endpoints, or
  confirm the list-and-filter approach) in the backend API worklog. Written up as
  [0005-single-resource-get-for-groups-and-items](../../discussions/0005-single-resource-get-for-groups-and-items/discovery.md).
- **Directly opening an edit URL for a nonexistent id hangs on the loading skeleton forever**,
  rather than showing a "not found" state. This is a direct consequence of the list-and-filter
  approach above (the list resolves, the `find()` comes back empty, and the page never leaves its
  `!group` branch) and is also arguably part of the error-state topic this proposal explicitly
  deferred — but it's worth flagging now because it's reachable through completely normal use
  (e.g. a stale bookmark or double-clicking delete), not just a malformed URL. Folded into the same
  discovery as the point above, since both stem from the missing single-resource GET.
- **No route guard for unauthenticated access to `/groups/*`.** The proposal doesn't say what should
  happen if someone reaches a common-layout route without a session (deep link, back button after
  logout, etc.). This worklog leaves those routes reachable regardless of auth state — since the
  backend doesn't exist, in practice every list just renders empty. Real behavior (redirect to `/`?
  show the page and let API calls 401?) should be decided alongside the backend auth worklog. Written
  up as
  [0006-unauthenticated-route-guard](../../discussions/0006-unauthenticated-route-guard/discovery.md).

## Difficulties

- Had to split `buttonVariants` (the `cva` definition) out of `Button`, and `useAuth`/`AuthContext`
  out of `AuthProvider`, following shadcn/ui convention. The reason: `eslint-plugin-react-refresh`'s
  `only-export-components` rule rejects a single file that exports both a component and a
  non-component, since that breaks Fast Refresh. Rather than changing the project's shared
  `eslint.config.js`, resolved it by extracting `button-variants.ts` and `auth-context.ts`. This is a
  well-known landmine in the shadcn/ui + Vite template combination, but I didn't notice it until I
  actually hit it.
- Adding `baseUrl: "."` to `tsconfig.app.json` broke the build: the installed TypeScript
  (`~6.0.2`, a preview-ish version ahead of any real release yet) treats `baseUrl` as deprecated
  (TS5101) and fails. With `moduleResolution: "bundler"`, `paths` already resolve as relative paths
  from the tsconfig without needing `baseUrl`, so removed `baseUrl` to fix it.
- shadcn/ui's `Sheet` (the nav menu) is normally built on the `tailwindcss-animate` plugin's
  `animate-in` / `slide-in-from-right` utilities, but that plugin isn't installed here. Tailwind v4
  silently ignores unknown class names instead of failing the build, so leaving them in unnoticed
  produced a visual bug where the menu opened but didn't slide in. Fixed by rewriting it as a plain
  Tailwind transition that toggles `translate-x-full` / `translate-x-0` against Radix's
  `data-[state=open]` attribute instead.
