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
| `/` | `RootRoute` — no UI; renders nothing while auth is `loading`, else `<Navigate>` to `/groups` or `/login`. |
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
  `loading` and `authenticated` fall through so each page handles its own
  loading. (Trade-off: an unauthenticated deep link fires one 401 before the
  redirect.)
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
  Pages use `useFetch` instead of ad-hoc `useState`/`useEffect`.

  There is no loading UI anywhere in the app: a page renders `null` while its
  fetch is in flight, then the result. Nothing is drawn until the data is
  there, so no placeholder can flash on a page transition. The same holds for
  auth: `RootRoute` and `LoginPage` render nothing while `AuthState` is
  `loading`.
- `lib/use-submit.ts` — `useSubmit(action, errorMessage)` returns
  `{ isSubmitting, error, submit }`. `submit(...)` resolves to a discriminated
  `{ ok: true; value } | { ok: false }` (so a void-returning delete can't be
  mistaken for failure by truthiness), sets `error` to the fixed message on
  failure, and clears it at the start of each call.

## Pages

- **`GroupsListPage`** — `useFetch(api.listGroups)`. Loading → nothing; error →
  `ErrorState`. A section head with "Groups" and a small "New group" button
  (always shown once settled). Empty → `EmptyState` "No groups yet."; otherwise
  a 12 px stack of independent white `.group-card` links, each card itself the
  link to `/groups/:groupId`.
- **`GroupDetailPage`** — two independent `useFetch` calls (the group, its item
  list). A failed group fetch replaces the whole page; a failed item-list fetch
  replaces only the item section. The page head is three tiers: a `Group`
  eyebrow with an `Edit` ghost button, the group name as `.group-title`, then
  an `Items` + `Add item` section head. Items render in a flat `.item-list`
  white band — radius 0, no side border, 1 px top/bottom rules, a 1 px divider
  between rows — and each row is a full-width link whose title is a single
  clipped line and whose `vol. N` figure sits right-aligned before a chevron.
  Empty items → `EmptyState`.
- **`GroupNewPage`** / **`GroupEditPage`** — a `Name` `TextField` (`maxLength`
  100) inside a white `.form-card`, with a full-width submit button. New:
  `useSubmit(api.createGroup)`, navigates to `/groups` on success. Edit:
  `useFetch(api.getGroup)` seeds the field during render (guarded by an
  `initialized…Id`), a `Save` `useSubmit`, and a separate delete `useSubmit`
  driving a `DeleteConfirmDialog`; the delete control is a small
  `danger-ghost` button at the end of the form. Navigates to `/groups` on
  success.
- **`ItemNewPage`** / **`ItemEditPage`** — `Title` and `Completed volume`
  (numeric) fields in the same `.form-card`, otherwise mirroring the group
  forms; navigate to `/groups/:groupId` on success.
- **`ItemDetailPage`** — `useFetch(api.getItem)`. The page head is an `Item`
  eyebrow with an `Edit` ghost button, then a wrapping `.item-title`. A
  centered `Completed volume` card shows the figure at 42 px. A full-width
  "Add a volume" button (`.item-actions`) does an optimistic `PATCH`
  (`completedVolume + 1`) via `useSubmit`, holding the bumped value in local
  state and rolling it back with an inline error on failure. Increment only.
- **`LoginPage`** — guest-only, outside `AppLayout`: brand, tagline, a white
  `.home-card` holding Google's rendered sign-in button and its caption, and
  (dev builds only) a dashed `.dev-block` form posting to
  `/api/auth/dev-login`. Google's `renderButton` settings are untouched.

## Components (`src/components`)

Hand-written on the design tokens; the Radix primitives (Dialog, Label, Avatar)
are kept for behaviour (focus trap, Esc, portal, label association, image
fallback). shadcn/ui is not used.

- `Button` — 10 px-radius button; variants `primary` / `outline` / `ghost` /
  `danger` / `danger-ghost`, sizes `default` (44 px) / `sm` (36 px) / `xs`
  (30 px); `asChild` renders as its single child (e.g. a router `<Link>`) via
  Radix `Slot`. Every button carries a leading line icon (lucide-react); the
  Google-rendered sign-in button is the only exception.
- `TextField` — Radix `Label` + `<input>` + optional hint; `invalid` drives
  `aria-invalid`. Form-level submit errors are rendered by the page as a sibling
  `<p className="error-text">`.
- `Dialog` / `Sheet` — thin wrappers over Radix Dialog with the app skin
  (`Sheet` is a right-side slide-in). They are the only surfaces that carry a
  shadow.
- `DeleteConfirmDialog` — confirm modal; on a failed delete it stays open and
  shows the error between the body and the actions. Never the native
  `confirm()`. Cancel is an outline `sm` button; Delete is a `danger` `sm`
  button.
- `EmptyState` — white card with an icon, a fixed message, and an optional CTA
  (the two list pages omit it, since the create action lives in the section
  head).
- `ErrorState` — white card with a warning icon, a fixed message, and an
  outline small "Retry" button.
- `Avatar` — as named.
- `index.css` list and page classes — `.page-head` with `.eyebrow-row` /
  `.eyebrow` builds the two-tier detail heads, `.group-title` / `.item-title`
  the wrapping page titles, `.group-card` an independent white row card,
  `.item-row` inside `.item-list` a flat white band row with a one-line
  ellipsised title, and `.item-actions` a full-width action row.
- `layout/AppLayout` — the `.app-shell`: white header (wordmark linking to `/` +
  `NavMenu`), `<Outlet/>`, footer (plain wordmark text).
- `layout/NavMenu` — the header avatar button opens a right-side `Sheet` with the
  signed-in user's name, a "Groups" link, and a "Log out" button (logs out, then
  navigates to `/`).

## Styling (`src/index.css`)

`@import 'tailwindcss'` plus a bespoke design-token system in `:root` — a blue
palette on a charcoal/grey ground (`--primary: #3148f6`, `--primary-hover:
#1c4b8f`, page ground `#e9e9e9`, white surfaces; functional pairs clear WCAG
AA), a φ-based type scale starting at 11 px, Fibonacci-px spacing, 6/10/12/16
px radii, and no pill buttons. `@theme inline` exposes the semantic colours to
Tailwind utilities. Component styles live in an `@layer components` block and
are used as semantic classes (`className="btn btn-primary"`), not utility
strings.

The design is mobile-only and light-only: one centred column ≤ 430 px with a
hairline side border from 470 px; `/` and `/login` render outside the common
layout. The header is white with a 1 px bottom rule, the page ground is
`--bg-2`, cards are white with a 1 px `--border` and a 12 px radius, and only
the nav sheet and dialogs carry a shadow.

A group list is `ul.list` (a 12 px stack) whose `<li>`s each hold one
`<Link className="group-card">`; every entry is its own bordered white card and
the whole card is the tap target. An item list is `ul.item-list`, a flat white
band with radius 0 and no side border: 1 px `--border-strong` top and bottom
rules, a 1 px `--border` divider between rows, a hover `--primary-soft` fill,
and an inset focus outline. Each `.item-row` is at least 56 px high; its title
is pinned to one line and ellipsised before the right-aligned `vol.` figure and
chevron, so the figure never overlaps or wraps.

UI copy is English. One `--font` stack of whatever rounded gothic the OS ships
(`ui-rounded`, Hiragino Maru Gothic, Yu Gothic UI / Meiryo, `system-ui`) is used
for both chrome and user-entered content; no web font is downloaded, so rounded
rendering is best-effort.

## Environment

`apps/web/.env` (see `.env.example`) holds `VITE_GOOGLE_CLIENT_ID`, read by
Google Identity Services in the browser and inlined into the bundle at build
time.
