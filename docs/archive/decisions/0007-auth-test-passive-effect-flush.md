# 0007: Flush pending passive effects before auth.test.tsx teardown

Discussion: [flaky auth test isolation](../discussions/0014-flaky-auth-test-isolation/proposal.md)
Worklog: [flush pending passive effects before auth.test.tsx teardown](../worklogs/0007-flaky-auth-test-isolation/plan.md)

## Status

Accepted.

## Decision

- The low-rate failure of `apps/web/src/lib/auth.test.tsx`
  (`TypeError: Cannot read properties of undefined (reading 'accounts')` at
  `auth.tsx:118`, seen only in the full suite / under CPU load) is a test-side
  race, not a `vitest` file-isolation problem: a `Probe` passive effect reaches
  `window.google.accounts.id.renderButton` *after* the test's own synchronous
  `afterEach` has already run `vi.unstubAllGlobals()` + `delete window.google`.

- Fix is confined to `auth.test.tsx`. Its `afterEach` is now `async` and
  `await act(async () => {})` runs before `vi.unstubAllGlobals()` /
  `delete window.google`, flushing any pending passive effect while the `google`
  stub is still installed. `act` is added to the existing
  `@testing-library/react` import. No product code changes; `auth.tsx` is
  untouched.

- A single file-wide `afterEach` flush is used rather than per-test
  `await waitFor(renderButton)` calls, and it covers tests added to this file
  later.

- Not done, deliberately: `test.retry` (masks real regressions), a defensive
  `window.google?.accounts?.id` guard in `renderSignInButton` (hides a genuine
  GIS load failure as a silent no-op), and an injectable GIS-loader seam on
  `AuthProvider` (larger, and overlaps
  [0015](../discussions/0015-home-signin-button-lifecycle/discovery.md)).

- Still open: once CI/CD is chosen
  ([0003](../discussions/0003-cicd-service-selection/discovery.md)), watch this
  test on the CI runner for a period — CI runners are typically more loaded than
  a local machine and more likely to surface a residual race.

## Rationale

The "only the first `it` fails" reading from the discovery is a low-load
artifact: under heavier load the baseline repro failed in two *other* tests,
including the last `it` in the file. The race is per-test — any test whose
`Probe` effect loses to its own synchronous `afterEach` — so the vulnerable set
is every test in the file, which is why a file-wide `afterEach` flush is the
right shape and per-test waits are not. Keeping the change inside the test file,
with no product-code guard, means the fix cannot itself hide a real failure of
Google Identity Services to load. The structural root under this — `AuthProvider`
doing React-unmanaged imperative DOM work (`window.google` assignment,
`renderButton` into a raw container, real `<script>` injection with no teardown
seam) — is explicitly left to 0015 and a later discovery.
