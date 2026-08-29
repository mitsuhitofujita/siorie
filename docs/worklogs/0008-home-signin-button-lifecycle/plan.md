---
date: 2026-08-29
status: in-progress
discussions: [0015-home-signin-button-lifecycle]
decisions: []
pr: null
---

# Route-level auth split and a self-contained GoogleSignInButton

Implementing
[0015-home-signin-button-lifecycle proposal](../../discussions/0015-home-signin-button-lifecycle/proposal.md)
at scope (b): move the auth-state screen switch from in-component early
returns to the route layer, and extract Google's sign-in button into a
self-contained component the auth module owns.

The orphaned-iframe bug (Google's imperatively injected `<iframe>` surviving
the `unauthenticated` -> `authenticated` transition because React reuses the
positionally-matched `<div>`) is fixed structurally: the button now lives in
a component that unmounts on the `/login` -> `/groups` route change, so React
removes its `<div>` (iframe included) from the DOM. An orphan can no longer
occur; it is not "avoided", it is unreachable.

## Plan

1. **`auth-context.ts`** — drop `renderSignInButton` from `AuthContextValue`;
   add `gisReady: boolean` so `<GoogleSignInButton>` can tell when
   `google.accounts.id` is usable. Move the "why Google's own button" comment
   to the new component.
2. **`auth.tsx`** — `AuthProvider` provides `{ state, gisReady, logout }`.
   Delete the `renderSignInButton` callback. Add and export
   `GoogleSignInButton`: own container `ref`, an effect that calls
   `renderButton(ref.current, {...})` once `gisReady`, and a cleanup that
   clears **only its own** container (`replaceChildren()`) so a StrictMode
   double-mount can't stack two buttons.
3. **`components/route-guards.tsx`** (new) — `RequireAuth` (settled
   `unauthenticated` -> `<Navigate to="/login" replace>`; `loading` /
   `authenticated` fall through) and `RequireGuest` (settled `authenticated`
   -> `<Navigate to="/groups" replace>`; else fall through).
4. **`pages/RootRoute.tsx`** (new) — `/` holds no UI: `loading` shows a
   minimal skeleton, otherwise `<Navigate>` to `/groups` or `/login`. The one
   place `loading` is handled explicitly.
5. **`pages/LoginPage.tsx`** (new) — the moved unauthenticated branch:
   skeleton while `loading`, else title + `<GoogleSignInButton>`. Post-login
   transition is `<RequireGuest>`'s job, not this page's.
6. **`App.tsx`** — `/` -> `<RootRoute>`; add `/login` wrapped in
   `<RequireGuest>`; wrap the `AppLayout` route element in `<RequireAuth>`.
7. **`pages/HomePage.tsx` + `HomePage.test.tsx`** — delete. The authenticated
   home (avatar + name + groups link + logout) is removed entirely.
8. **`components/layout/NavMenu.tsx`** — show the user's name inside the
   sheet (its display was the removed authenticated home's only job).
9. **Tests**
   - `test/renderWithProviders.tsx` — swap the `renderSignInButton` option
     for `gisReady` (default `false`).
   - `pages/LoginPage.test.tsx` (new) — skeleton while loading; button
     container present when unauthenticated.
   - `components/route-guards.test.tsx` (new) — each guard's redirect vs.
     fall-through per auth state.
   - `pages/RootRoute.test.tsx` (new) — skeleton while loading; redirect
     target per settled state.
   - `lib/auth.test.tsx` — rewrite `Probe` to render `<GoogleSignInButton>`
     instead of driving `renderSignInButton` itself.
   - `components/layout/NavMenu.test.tsx` — assert the name shows in the sheet.
   - `App.test.tsx` — `renderApp` gains an `authenticated` flag; assert the
     `/` and guard redirects; stub `window.google` + flush passive effects in
     `afterEach` so `AuthProvider` stops injecting a real `<script>` into
     `document.head` (the loose end folded in from worklog 0007 /
     discussion 0014).
10. **`docs/discussions/0006-unauthenticated-route-guard/discovery.md`** —
    append a pointer to 0015 (0006's guard candidate 3 is what `RequireAuth`
    implements; 0006 closes when 0015 is decided).

## Work log

1. **`auth-context.ts`** — replaced `renderSignInButton: (container) => void`
   on `AuthContextValue` with `gisReady: boolean`. The extracted button needs
   to know when `google.accounts.id` is usable, and that readiness was
   `AuthProvider`-local state; one boolean on the context is the smallest
   seam. Moved the "why Google's own button" rationale comment out (it now
   belongs on the component).

2. **`auth.tsx`** — `AuthProvider` now provides `{ state, gisReady, logout }`.
   Deleted the `renderSignInButton` `useCallback`. Added and exported
   `GoogleSignInButton`: own `containerRef`, an effect keyed on `[gisReady]`
   that calls `window.google!.accounts.id.renderButton(container, {...})` once
   ready, with a cleanup that calls `container.replaceChildren()` on that one
   container only. Imported `useAuth` from `auth-context` (no import cycle:
   `auth-context.ts` pulls only from `react`).

3. **`components/route-guards.tsx`** (new) — `RequireAuth` (settled
   `unauthenticated` -> `<Navigate to="/login" replace>`; `loading` /
   `authenticated` render children) and `RequireGuest` (settled
   `authenticated` -> `<Navigate to="/groups" replace>`; else children).

4. **`pages/RootRoute.tsx`** (new) — `loading` renders a minimal skeleton
   `<main>`; otherwise `<Navigate>` to `/groups` or `/login`.

5. **`pages/LoginPage.tsx`** (new) — `loading` renders the same skeleton
   `<main>`; otherwise the `siorie` title and `<GoogleSignInButton />`.

6. **`App.tsx`** — `/` -> `<RootRoute />`; new `/login` wrapped in
   `<RequireGuest>`; the `AppLayout` route element wrapped once in
   `<RequireAuth>`.

7. **Deleted `pages/HomePage.tsx` and `pages/HomePage.test.tsx`** via
   `git rm`. The authenticated home (avatar + name + groups link + logout)
   is gone; `/` holds no UI.

8. **`components/layout/NavMenu.tsx`** — added
   `{user && <p class="text-sm text-muted-foreground">{user.name}</p>}` inside
   `SheetHeader`, below the title. `user` was already derived in the
   component; nothing else changed.

9. **Tests**
   - `test/renderWithProviders.tsx` — dropped the `renderSignInButton`
     option (and the now-unused `noop`), added `gisReady` (default `false`).
   - `pages/LoginPage.test.tsx` (new) — skeleton + no button while
     `loading`; title + button container when `unauthenticated`.
   - `components/route-guards.test.tsx` (new) — six cases: each guard's
     redirect target and its two fall-through states, asserted via
     `extraRoutes`.
   - `pages/RootRoute.test.tsx` (new) — holds (neither redirect target
     shows) while `loading`; redirects to `/login` / `/groups` when settled.
   - `lib/auth.test.tsx` — `Probe` no longer has its own container + effect;
     it renders `<GoogleSignInButton />`. The GIS-ready test now asserts
     `renderButton` was handed the button's own
     `data-testid="google-signin-button"` node. `afterEach` comment updated.
   - `components/layout/NavMenu.test.tsx` — asserts `山田 太郎` shows after
     the sheet opens.
   - `App.test.tsx` — see difficulty 1. `renderApp` gained an
     `{ authenticated }` flag driving `/api/me`, a `window.google` stub, and
     an `async afterEach` that `await act(async () => {})` before
     `unstubAllGlobals()` / `delete window.google`.

10. **`docs/discussions/0006-unauthenticated-route-guard/discovery.md`** —
    appended a dated "追記" pointing at 0015 / this worklog and noting 0006
    closes when 0015 is decided. Append-only; existing text untouched.

11. **Verification** — `pnpm --dir apps/web`: `format:check` clean (after
    one `format` run reformatted the 3 new files), `lint` 0 errors / 1
    pre-existing warning (`use-fetch.ts:40`, unrelated, already noted in
    worklog 0007), `test` 14 files / 50 tests pass, `build` (tsc + vite)
    passes. Test suite run 5x idle (0 failures) and the route/auth files
    11x under `nproc-1` `yes` load (0 failures) — see difficulty 4.

## Result

Auth-state screen switching moved from `HomePage`'s three `state.status`
early returns to the route layer: `/` (`RootRoute`, redirect-only), `/login`
(`<RequireGuest>` + `LoginPage`), and the `/groups/*` tree
(`<RequireAuth>` + `AppLayout`). Google's sign-in button is now
`GoogleSignInButton`, exported from `@/lib/auth`, owning its container and
its `renderButton` call. On sign-in the auth state flips to `authenticated`,
`<RequireGuest>` navigates away from `/login`, `LoginPage` unmounts, and
React removes the button's `<div>` (Google's `<iframe>` with it). The
orphaned-button state is now structurally unreachable rather than patched.
`HomePage` is deleted; the user's name moved to the nav menu sheet.

Web module: 4 files added (`route-guards.tsx`, `RootRoute.tsx`,
`LoginPage.tsx`, and 3 new test files), 2 deleted (`HomePage.tsx` +
test), 6 edited. 14 test files / 50 tests green.

## Difficulties

1. **Route guards turned the `App.test.tsx` change from "stub one global"
   into a near-total rewrite of that file — the proposal's 影響範囲 line
   understated it.** The proposal named exactly one `App.test.tsx` task:
   stop `AuthProvider` injecting a real `<script>` into `document.head` by
   stubbing `window.google`. But every pre-existing "renders X inside the
   common layout" test in that file was silently relying on the old
   behavior where an unauthenticated visitor (all `/api/*` rejected) still
   got the layout. With `<RequireAuth>` in place, unauthenticated now
   redirects to `/login`, so those tests would assert against the login
   screen instead. `renderApp` had to grow an `{ authenticated }` flag that
   makes `/api/me` resolve, and 6 of the 9 routing tests now pass
   `{ authenticated: true }`. Two new tests cover the redirects themselves
   (`/` and a protected route, both unauthenticated). This is a foreseeable
   consequence of adding guards, not a design problem, but anyone estimating
   from the proposal's single bullet would undercount the churn: the file
   went from 77 to ~135 lines and every test body changed.

2. **The proposal left "how does the extracted button learn `gisReady`"
   unspecified, and the answer widened the context type it also told us to
   shrink.** The proposal says to *remove* `renderSignInButton` from
   `AuthContextValue` and describes `GoogleSignInButton` as having "`gisReady`
   待ち" internally — but `gisReady` was `AuthProvider`-local `useState`, and
   the button renders elsewhere in the tree, so it cannot "wait" on it
   without a channel. Options were: (a) expose `gisReady: boolean` on the
   context (chosen — one boolean, provider still owns the GIS lifecycle);
   (b) have the button call `loadGoogleIdentityServices()` itself and track
   its own readiness (duplicates load/init bookkeeping, risks double
   `initialize`); (c) keep a render callback on the context under a
   different name (barely different from what we were told to delete). So
   the net context change is `renderSignInButton` out, `gisReady` in — a
   trade of one field for another, not the pure removal the proposal's
   wording implies. Worth flagging because a reader expecting
   `AuthContextValue` to get smaller will find it the same size.

3. **`GoogleSignInButton` is no longer auth-state-gated, which changes what
   the `auth.test.tsx` `Probe` exercises.** The old `Probe` (and the old
   `HomePage`) only called `renderSignInButton` when
   `state.status === 'unauthenticated'`. `GoogleSignInButton` renders its
   container and, once `gisReady`, calls `renderButton` regardless of auth
   state — it relies on the *caller* only mounting it on `/login`. In
   `Probe` it is now mounted unconditionally, so `renderButton` also fires
   in the authenticated-path tests (`becomes authenticated`, the credential
   callback, `logout`). No assertion breaks and the `afterEach` `act` flush
   still covers the pending effect, but the test double now does slightly
   more than the real usage does. If a future test wants "button absent when
   authenticated", that guarantee lives in `LoginPage` / routing, never in
   `GoogleSignInButton` itself.

4. **Redirect chains made me re-run under load, and the outcome was clean —
   but the reason it is clean is the `afterEach` flush copied from worklog
   0007, not anything structural.** `RootRoute` and both guards resolve
   auth, then mount a `<Navigate>`, then the target route mounts and may
   itself fetch — several async hops per test. Worklog 0007 established that
   this file family is where a congested scheduler lets a passive effect
   (`GoogleSignInButton` reaching `window.google`) flush *after* a
   synchronous `afterEach` deleted the stub. `App.test.tsx` now mounts
   `GoogleSignInButton` (via `LoginPage`) in the unauthenticated tests, so
   it inherited that exposure. Mirroring `auth.test.tsx` — `async afterEach`
   with `await act(async () => {})` before `unstubAllGlobals()` — was
   required, not optional. Verified: route/auth files 11x under `nproc-1`
   `yes` load, 0 failures; without the flush this class of test is known to
   fail ~10% under that load.

5. **Two byte-identical `loading` skeletons now exist (`RootRoute`,
   `LoginPage`), and that is by design, not accident.** The proposal
   explicitly rejected centralizing loading UI in a guard ("各ページ自前を
   採用。ガードへ集約すると二重管理"). The concrete result is that the
   4-line skeleton `<main>` from the deleted `HomePage` `loading` branch now
   appears verbatim in two files. Extracting a shared `<AuthLoadingScreen>`
   would re-introduce exactly the shared component the proposal argued
   against for the guard case, so it was left duplicated. Noting it because
   the duplication is easy to "clean up" later without noticing it was a
   deliberate trade.

## Structural note (flagged, not yet a discovery)

Difficulty 4 is a symptom of something the human chose to keep on record as
a discovery candidate rather than open now: `loadGoogleIdentityServices()`
appends a `<script>` to `document.head` and never removes it, and
`window.google` is a mutable global assigned by that script load — the loader
has no injection seam and no teardown. Three efforts so far (worklog 0007's
Difficulties, discussion 0015, and this worklog's `App.test.tsx`) have each
worked around it the same way — stub `window.google` in the test, flush
passive effects in an `async afterEach` — instead of fixing the seam. 0015's
proposal listed "add a cleanup / seam to `loadGoogleIdentityServices`" as an
alternative and did not take it. If a fourth test file ever renders
`AuthProvider`, it will re-implement the same workaround. This paragraph is
the intended starting point for that discovery when the human writes it.

## Deviations vs. proposal — summary

- `AuthContextValue`: not a pure removal of `renderSignInButton`; it is
  swapped for `gisReady` (difficulty 2).
- `App.test.tsx`: full rewrite with an `{ authenticated }` toggle, not a
  one-line stub (difficulty 1).
- `GoogleSignInButton` is unconditional where its predecessor was
  `unauthenticated`-only; the "no button when authenticated" property is a
  routing property now (difficulty 3).
- `renderWithProviders`: `renderSignInButton` option removed, `gisReady`
  added — every caller used the default so no call site changed.
- Everything else (route table, guard semantics, `/` redirect-only,
  `NavMenu` name, `HomePage` deletion, StrictMode-safe cleanup) matched the
  proposal as written.
