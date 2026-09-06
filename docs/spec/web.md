# Web SPA (`apps/web`)

A Vite + TypeScript + React 19 single-page app, managed with pnpm. It talks to
the Go API over `/api/*` — same origin in both dev (via the Vite proxy) and
production (co-served by the Go binary).

## Build & tooling

- `package.json` scripts: `dev` (Vite), `build` (`tsc -b && vite build`), `test`
  (`vitest run`), `lint` (ESLint flat config), `format` / `format:check`
  (Prettier), `preview`. `packageManager` pins pnpm.
- `vite.config.ts`: the React and Tailwind v4 plugins; `@` aliased to `./src`;
  `server.proxy` sends `/api` to `http://localhost:8080` in dev; `preview` is
  pinned to port 5173 with `strictPort` so its origin matches `dev-web`; Vitest
  runs in jsdom with `src/test/setup.ts`.
- `src/test/setup.ts` registers `@testing-library/jest-dom` and an explicit
  `afterEach(cleanup)` (Testing Library's auto-cleanup doesn't self-register
  because `test.globals` is off). `src/test/renderWithProviders.tsx` wraps a
  component in `MemoryRouter` + an injected `AuthContext` value (arbitrary
  `AuthState`, `gisReady`, optional route/path/extra routes), so auth- and
  params-dependent components test without mocking `fetch`.

## Entry & routing

`src/main.tsx` mounts `<StrictMode><BrowserRouter><AuthProvider><App/>`.

`src/App.tsx` is the single route table:

| Path | Element |
| --- | --- |
| `/` | `RootRoute` — no UI; a skeleton while auth is `loading`, else `<Navigate>` to `/groups` or `/login`. The one place `loading` is handled. |
| `/login` | `LoginPage`, wrapped in `<RequireGuest>`. |
| `/groups` | `GroupsListPage` |
| `/groups/new` | `GroupNewPage` |
| `/groups/:groupId` | `GroupDetailPage` |
| `/groups/:groupId/edit` | `GroupEditPage` |
| `/groups/:groupId/items/new` | `ItemNewPage` |
| `/groups/:groupId/items/:itemId` | `ItemDetailPage` |
| `/groups/:groupId/items/:itemId/edit` | `ItemEditPage` |

Everything under `/groups` renders inside the `AppLayout` route element, wrapped
once in `<RequireAuth>`. URLs nest to match the Firestore data model, and create
and edit are always separate pages.

### Route guards (`components/route-guards.tsx`)

- `RequireAuth` — a settled `unauthenticated` state redirects to `/login`;
  `loading` and `authenticated` fall through so each page shows its own loading
  UI. (Trade-off: an unauthenticated deep link briefly shows the target
  skeleton and fires one 401 before the redirect.)
- `RequireGuest` — a settled `authenticated` state redirects to `/groups`. This
  is what makes the post-sign-in transition declarative: sign-in flips the auth
  state and the redirect follows.

## Auth in the SPA (`lib/auth.tsx`, `lib/auth-context.ts`)

`AuthProvider` loads the Google Identity Services script once, calls
`google.accounts.id.initialize({ client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID, callback })`,
and provides `{ state, gisReady, logout }` through `AuthContext`.

- `AuthState` is `{ status: 'loading' } | { status: 'unauthenticated' } |
  { status: 'authenticated'; user: { name, pictureUrl } }`, populated from
  `GET /api/me` on mount (any non-2xx or network error → `unauthenticated`).
- On the Google credential callback, `AuthProvider` `POST`s the ID Token to
  `/api/auth/google` and then re-fetches `/api/me`.
- `logout()` `POST`s `/api/auth/logout` and always resets state to
  `unauthenticated`.
- `GoogleSignInButton` (exported from `@/lib/auth`) is a self-contained
  component: it owns a container `<div>`, calls
  `google.accounts.id.renderButton` into it once `gisReady`, and on unmount
  clears only that container. It renders Google's own button (not a custom
  control on `prompt()`). `LoginPage` is the only place it is mounted, so it
  disappears with the page on the `/login → /groups` transition, taking Google's
  injected `<iframe>` with it.

`useAuth` (in `auth-context.ts`, kept out of `auth.tsx` so Fast Refresh's
component-only-export rule holds) throws if used outside `AuthProvider`.

## Data access

- `lib/api.ts` — a thin typed client. `apiFetch` sets
  `Content-Type: application/json`, throws on a non-2xx status, and returns
  `undefined` for `204`. The `api` object has one method per endpoint:
  `listGroups`, `getGroup`, `createGroup`, `updateGroup`, `deleteGroup`,
  `listItems`, `getItem`, `createItem`, `updateItem`, `deleteItem`.
- `lib/use-fetch.ts` — `useFetch(fetcher)` returns
  `{ status: 'loading' | 'success' | 'error', data?, refetch }`. A `requestId`
  ref discards a stale in-flight response and suppresses updates after unmount.
  Every list/detail page uses it instead of ad-hoc `useState`/`useEffect`.
- `lib/use-submit.ts` — `useSubmit(action, errorMessage)` returns
  `{ isSubmitting, error, submit }`. `submit(...)` resolves to a discriminated
  `{ ok: true; value } | { ok: false }` (so a void-returning delete can't be
  mistaken for failure by truthiness), sets `error` to the fixed message on
  failure, and clears it at the start of each call.

## Pages

- **`GroupsListPage`** — `useFetch(api.listGroups)`. Loading → skeletons; error →
  `ErrorState`. A section head with "Groups" and a small "New group" button
  (always shown once settled). Empty → `EmptyState` "No groups yet."; otherwise a
  card list of rows linking to `/groups/:groupId`.
- **`GroupDetailPage`** — two independent `useFetch` calls (the group, its item
  list). A failed group fetch replaces the whole page; a failed item-list fetch
  replaces only the item section. Heads for the group name + "Edit" and for
  "Items" + "Add item". Item rows show the title, a `vol. N` figure, and link to
  the item detail page. Empty items → `EmptyState`.
- **`GroupNewPage`** / **`GroupEditPage`** — a `Name` `TextField` (`maxLength`
  100). New: `useSubmit(api.createGroup)`, navigates to `/groups` on success.
  Edit: `useFetch(api.getGroup)` seeds the field during render (guarded by an
  `initialized…Id`), a `Save` `useSubmit`, and a separate delete `useSubmit`
  driving a `DeleteConfirmDialog`; navigates to `/groups` on success.
- **`ItemNewPage`** / **`ItemEditPage`** — `Title` and `Completed volume`
  (numeric) fields, otherwise mirroring the group forms; navigate to
  `/groups/:groupId` on success.
- **`ItemDetailPage`** — `useFetch(api.getItem)`. Shows the title (+ "Edit"
  link) and a "Completed volume" card. An "Add a volume" button does an
  optimistic `PATCH` (`completedVolume + 1`) via `useSubmit`, holding the bumped
  value in local state and rolling it back with an inline error on failure.
  Increment only.

## Components (`src/components`)

Hand-written on the design tokens; the Radix primitives (Dialog, Label, Avatar)
are kept for behaviour (focus trap, Esc, portal, label association, image
fallback). shadcn/ui is not used.

- `Button` — pill button; variants `primary` / `outline` / `ghost` / `danger`,
  sizes `default` / `sm` / `xs`; `asChild` renders as its single child (e.g. a
  router `<Link>`) via Radix `Slot`. Every button carries a leading line icon
  (lucide-react).
- `TextField` — Radix `Label` + `<input>` + optional hint; `invalid` drives
  `aria-invalid`. Form-level submit errors are rendered by the page as a sibling
  `<p className="error-text">`.
- `Dialog` / `Sheet` — thin wrappers over Radix Dialog with the moss skin
  (`Sheet` is a right-side slide-in).
- `DeleteConfirmDialog` — confirm modal; on a failed delete it stays open and
  shows the error between the body and the actions. Never the native
  `confirm()`.
- `EmptyState` — card with an icon, a fixed message, and an optional CTA (the two
  list pages omit it, since the create action lives in the section head).
- `ErrorState` — card with a warning icon, a fixed message, and a "Retry"
  button.
- `Avatar`, `Skeleton` — as named.
- `layout/AppLayout` — the `.app-shell`: header (wordmark linking to `/` +
  `NavMenu`), `<Outlet/>`, footer (plain wordmark text).
- `layout/NavMenu` — the header avatar button opens a right-side `Sheet` with the
  signed-in user's name, a "Groups" link, and a "Log out" button (logs out, then
  navigates to `/`).

## Styling (`src/index.css`)

`@import 'tailwindcss'` plus a bespoke design-token system in `:root` — a moss
palette (functional pairs clear WCAG AA), a φ-based type scale, Fibonacci-px
spacing, `8·φⁿ` radius, pill buttons. `@theme inline` exposes the semantic
colours to Tailwind utilities. Component styles live in an `@layer components`
block and are used as semantic classes (`className="btn btn-primary"`), not
utility strings.

The design is mobile-only and light-only: one centred column ≤ 430 px with a
hairline side border on wider viewports; `/` and `/login` render outside the
common layout. UI copy is English. One `--font` stack of whatever rounded gothic
the OS ships (`ui-rounded`, Hiragino Maru Gothic, Yu Gothic UI / Meiryo,
`system-ui`) is used for both chrome and user-entered content; no web font is
downloaded, so rounded rendering is best-effort.

## Environment

`apps/web/.env` (see `.env.example`) holds `VITE_GOOGLE_CLIENT_ID`, read by
Google Identity Services in the browser and inlined into the bundle at build
time.
