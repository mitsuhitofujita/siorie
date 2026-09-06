---
date: 2026-08-29
status: merged
discussions: [0014-flaky-auth-test-isolation]
decisions: [0007-auth-test-passive-effect-flush]
pr: null
---

# Flush pending passive effects before auth.test.tsx teardown

Implementing
[0014-flaky-auth-test-isolation proposal](../../discussions/0014-flaky-auth-test-isolation/proposal.md):
`apps/web/src/lib/auth.test.tsx` fails at a low rate (~10% idle, ~24% under
CPU load) only in the full suite / under load, with
`TypeError: Cannot read properties of undefined (reading 'accounts')` at
`auth.tsx:118` (`window.google!.accounts.id.renderButton(...)`).

Root cause (already isolated in the discussion): the test body exits on
`await waitFor(status === 'unauthenticated')`, which only observes DOM text.
`window.google` is actually touched by a separately-scheduled passive effect
— `Probe`'s `useEffect` calling `renderSignInButton`, which reaches
`window.google!.accounts.id.renderButton` once `gisReady === true`. When the
scheduler is congested, that effect flushes *after* the synchronous
`afterEach` has already run `vi.unstubAllGlobals()` + `delete window.google`,
so it reads a deleted global and throws. It is the first `it` that fails
because it is that same test's own effect running after its own teardown,
not leftover state from a previous test.

## Plan

- Make the existing `afterEach` in `auth.test.tsx` `async`, and
  `await act(async () => {})` before `vi.unstubAllGlobals()` /
  `delete window.google`, so any pending passive effect is flushed while the
  `google` stub is still installed.
- Add `act` to the existing `@testing-library/react` import.
- No product-code change (`auth.tsx` untouched). Only `auth.test.tsx`.
- Keep each test's assertions as they are — the `afterEach` flush covers the
  whole file, including tests added later.
- Verify under CPU load (`yes > /dev/null` pinning one core): full suite
  ≥20 consecutive runs and `auth.test.tsx` alone ≥20 consecutive runs, both
  with 0 failures. Confirm the unmodified version still reproduces under the
  same load.

## Work log

1. Baseline repro on the unmodified `auth.test.tsx`. Ran a helper
   (`scratchpad/repro.sh`) that pins 7 of 8 cores with `yes > /dev/null` and
   loops `pnpm exec vitest run src/lib/auth.test.tsx`. 20 runs -> 2 failures,
   both the exact `TypeError: Cannot read properties of undefined (reading
   'accounts')`. So the flake is real and load-reproducible on this file
   alone, matching the proposal.

2. Applied the fix to `apps/web/src/lib/auth.test.tsx` only:
   - Added `act` to the existing `@testing-library/react` import.
   - Made `afterEach` `async` and added `await act(async () => {})` before
     `vi.unstubAllGlobals()` / `delete window.google`, with a comment
     explaining why.
   - `auth.tsx` and every other product file untouched. `delete
     window.google` kept as-is (redundant with `unstubAllGlobals`, left for
     a separate cleanup as the proposal noted).

3. Verification, all under the same 7-core `yes` load:
   - `auth.test.tsx` alone x20 -> 0 failures.
   - Full `apps/web` suite x20 -> 0 failures.
   - Plus one idle single run and `pnpm --dir apps/web` `format:check`,
     `lint`, `test` (12 files / 39 tests), `build` -> all pass. The one
     lint warning (`use-fetch.ts:40`, `react-hooks/exhaustive-deps`) is
     pre-existing and unrelated.

## Result

`apps/web/src/lib/auth.test.tsx` `afterEach` now flushes pending passive
effects inside `act` while the `google` stub is still installed, then
unstubs. One import line and the `afterEach` body changed; nothing else.
The load repro that produced 2/20 failures before now produces 0/40
(single-file x20 + full-suite x20).

## Difficulties

- **The "only the first `it` fails" framing from the discovery/minutes is a
  low-load artifact, not a rule.** discovery.md and minutes.md both lean on
  "the first `it` fails because that test's own effect runs after its own
  teardown". Under the heavier 7-core load here, the baseline repro failed
  at run 12 in `logout() posts to /api/auth/logout ...` and at run 13 in
  `starts loading, then becomes unauthenticated ...` — two *different*
  tests, and the `logout` one is the last `it` in the file, not the first.
  The mechanism is per-test (any test whose `Probe` effect loses the race
  with its own synchronous `afterEach`), and at idle timing it just happens
  to be the first test that most often loses. This does not change the fix —
  it strengthens the case for a file-wide `afterEach` flush over
  per-test `await waitFor(renderButton)` calls, since the vulnerable set is
  "every test", not "the first one". The structural root under this — the
  auth layer doing React-unmanaged imperative DOM work (`window.google`
  assignment, `renderButton` into a raw container, real `<script>`
  injection) — is not tracked in this worklog. It is the same root as
  `docs/discussions/0015-home-signin-button-lifecycle`, and the one loose
  end 0015 did not already name (`App.test.tsx` appending a real `<script
  src=".../gsi/client">` to `document.head` on every `AuthProvider` render,
  never removed — flagged out-of-scope in the 0014 proposal) was folded
  into 0015's "影響範囲（想定）" rather than opened as a new discovery.

- **Load calibration differs from the proposal and matters for anyone
  re-checking this.** The proposal reproduced with one `yes > /dev/null`
  pinning a single core and saw failures "within ~9 runs". On this 8-core
  machine a single `yes` was not enough contention to reproduce in a short
  loop; 7 `yes` processes (leaving one core for the test) gave ~10%
  (2/20), close to the idle full-suite rate the discussion measured. If a
  future re-check on different hardware sees 0/20 on the *unmodified* file,
  that is a load problem, not evidence the flake is gone — scale the number
  of load processes to `nproc - 1` and re-confirm the baseline fails before
  trusting a green run on the fix.

- **Worklog directory is `0007-...`, not `2026-08-29-...` as the `/work`
  command text says.** `.claude/commands/work.md` step 2 asks for
  `docs/worklogs/<today>-<slug>/`, but commit `99b4ef8` (one day earlier)
  renumbered two date-prefixed worklogs back to `NNNN` with the message
  "date-prefixed directory names, breaking the sequential worklog counter",
  and `docs/README.md` specifies the shared sequential `NNNN` counter. Went
  with `0007-flaky-auth-test-isolation` (next after `0006`) to match the
  established layout and the discussion's slug. Flagging because the command
  text and the repo's actual convention disagree here.
