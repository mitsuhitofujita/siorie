---
date: 2026-08-29
status: merged
discussions: [0016-visual-style-overhaul, 0018-ui-copy-test-coupling, 0019-selfhosted-font-subset-mismatch, 0020-detail-page-parent-context]
decisions: [0006-visual-style-system]
pr: null
---

# Visual style overhaul: moss × rounded gothic in the web app

Reflecting the spec HTML from
[0016-visual-style-overhaul proposal](../../discussions/0016-visual-style-overhaul/proposal.md)
into `apps/web`. The discussion produced 9 self-contained mock HTML files and
explicitly deferred "code reflection (React components, `index.css` tokens,
dependency changes)" to a separate worklog. This is that worklog.

Scope, from the proposal:

- Replace the shadcn/ui token set in `index.css` with the moss × rounded-gothic
  design tokens (colour, type scale = 16·φ, spacing = Fibonacci px, radius =
  8·φⁿ).
- Remove the shadcn/ui generated primitives under `src/components/ui/`. Keep
  Tailwind v4 and the Radix primitives (Dialog, Label, Avatar) for behaviour;
  hand-write Button / Dialog / Sheet / field on the tokens.
- Self-host the rounded display face (Zen Maru Gothic); no runtime CDN.
- Mobile-only, light-only, one column, 430 px max, hairline side border on
  desktop. Home screens (`RootRoute` redirect target `LoginPage`) keep no
  common layout, per 0004.
- All UI copy in English. User-entered content (group / item names, user name)
  renders in the OS gothic (`--font-ugc`), no web font.
- item-detail gains an "Add a volume" optimistic increment (exception to 0011 /
  decision 0004).

Out of scope / not done here (deferred to `/decide`): updating
`decision 0001` and `design/repository-structure.md`, which the proposal notes
must change because 0016 retracts "adopt shadcn/ui" from the confirmed 0001.

## Plan

1. **Dependencies** — `pnpm --dir apps/web add @fontsource/zen-maru-gothic`
   (self-host the Latin subset only: chrome text is English-only, so the
   Japanese subset is never needed). Keep `class-variance-authority`, `clsx`,
   `tailwind-merge`, `lucide-react`, and the three Radix packages.
2. **`src/index.css`** — replace the `:root` token block and `@theme inline`
   map with the moss tokens; import the Zen Maru Gothic Latin `@fontsource`
   CSS; set `body` to `--font` / `--bg-2` / line-height φ; add an
   `@layer components` block porting the mock component classes (`.btn` +
   variants + `.btn-sm`, `.field` / `.label` / `.input` / `.hint` /
   `.error-text`, `.card` / `.list` / `.row` / `.chev`, `.badge`, `.state`,
   `.app-shell` / header / main / footer, `.backlink` / `.toolbar` /
   `.pagehead` / `.pagetitle` / `.sectionhead` / `.wordmark` / `.avatar-btn`,
   `.nav-scrim` / `.nav-sheet` + rows, `.dialog` + parts).
3. **Primitives** (`src/components/`, `ui/` folder deleted)
   - `Button.tsx` — `cva` pill button, variants primary/outline/ghost/danger,
     `size` default/sm, `asChild` via Slot. Leading icon is passed as
     children by the caller.
   - `TextField.tsx` — label + input + hint/error, Radix Label kept.
   - `Dialog.tsx` — Radix Dialog, `.dialog` skin, soft shadow, scrim 55%.
   - `Sheet.tsx` — Radix Dialog as a right-side sheet, `.nav-sheet` skin, a
     close "×".
   - `Avatar.tsx` — Radix Avatar kept, circular, `--border`.
   - `Skeleton.tsx` — moved out of `ui/`, restyled to `--bg-2` pulse.
4. **Shared components**
   - `EmptyState` / `ErrorState` — `.card.state` layout, line icon + fixed
     English copy + CTA button. `ErrorState` default copy "Couldn't load.
     Please try again.", retry button with a refresh icon.
   - `DeleteConfirmDialog` — English default copy, `.dialog` skin, error text
     between body and actions, "Deleting…" busy label.
5. **Layout**
   - `AppLayout` — `.app-shell` (max 430, centred, hairline side border
     ≥460 px), header = wordmark + avatar button, footer = muted wordmark.
   - `NavMenu` — right sheet, "Menu" + close ×, user name in `--font-ugc`,
     "Groups" (layers icon) link + "Log out" (log-out icon) button. English.
6. **Pages** (English copy + restyle to the mocks)
   - `RootRoute` / `LoginPage` — restyle the skeleton; `LoginPage` becomes the
     `home-noauth` layout (brand 42 px, tagline, `GoogleSignInButton`,
     caption). GIS button config left as-is (0004: "leave Google's button as
     rendered").
   - `GroupsListPage` — `pagehead` "Groups", `toolbar` "New group", `.list
     .card` rows with chevron.
   - `GroupNewPage` — backlink, `pagetitle` "New group", "Name" field, "Create"
     (check icon), "Creating…" busy.
   - `GroupDetailPage` — backlink, `sectionhead` group name + "Edit" (sm
     outline), `sectionhead` "Items" + "Add item" (sm primary), `.list .card`
     rows with `vol.` figure.
   - `GroupEditPage` — `pagetitle` "Edit group", "Name" field, "Save",
     "Delete group" (danger), `DeleteConfirmDialog`.
   - `ItemDetailPage` — backlink, `sectionhead` title (nowrap clip) + "Edit",
     "Completed volume" card + big number, "Add a volume" toolbar button:
     optimistic `api.updateItem(groupId, itemId, title, completedVolume + 1)`,
     roll back on failure with a fixed inline error.
   - `ItemNewPage` / `ItemEditPage` — mirror the group forms with "Title" +
     "Completed volume" fields.
7. **Tests** — retarget every Japanese copy assertion to the new English
   strings; `App.test.tsx` `メニューを開く` → `Open menu`; add an
   `ItemDetailPage` test for the increment (success + rollback).
8. **Verify** — `pnpm --dir apps/web format:check` / `lint` / `test` /
   `build`, then root `just check`.

## Work log

(written as the work proceeds)

### 1. Dependencies

- `pnpm --dir apps/web add @fontsource/zen-maru-gothic@5` added it to
  `dependencies`. The package ships per-subset, per-weight CSS entrypoints
  (`.../latin-400.css` etc.) each `@font-face`-ing a bundled `.woff2`. Only
  the Latin subset is imported (see difficulty 4), so the added weight to the
  bundle is three small `.woff2` files (~11.5 KB each), not the
  multi-hundred-KB Japanese subset.
- `pnpm --dir apps/web remove class-variance-authority`. It was used only by
  the deleted `components/ui/button-variants.ts`. `clsx` + `tailwind-merge`
  (via `lib/utils.ts` `cn`) and `@radix-ui/react-slot` (Button `asChild`)
  stay; `lucide-react` stays and now supplies every icon (with
  `strokeWidth={1.75}` to match the spec).

### 2. `src/index.css`

- Replaced the shadcn `:root` token block with the moss tokens, named exactly
  as in the mocks (`--bg-1`, `--primary`, `--text-muted`, `--space-3`,
  `--radius`, `--font`, `--font-ugc`, `--ring`, `--shadow-soft`, …). The
  font-size scale is `--fs-*` (not `--text-*`) to avoid colliding with
  Tailwind's `--text-*` font-size namespace.
- `@theme inline` now maps only the semantic colours (`--color-primary` →
  `var(--primary)` etc.) so `bg-primary` / `text-muted` utilities exist for
  incidental layout use.
- `@layer base` sets `body` (font `--font`, ground `--bg-2`, line-height φ).
- `@layer components` ports the mock component classes verbatim: `.btn` +
  `.btn-{primary,outline,ghost,danger}` + `.btn-sm` + `.btn-block`, `.field`
  / `.label` / `.input` (value in `--font-ugc`) / `.hint` / `.error-text`,
  `.stack-{2,3,4}` / `.form`, `.card` / `.list` / `.row` / `.row .title` /
  `.vol` / `.vol .unit`, `.badge` (kept, unused), `.state`, `.app-shell` /
  `.app-header` / `.wordmark` / `.avatar-btn` / `.avatar` / `.app-main` /
  `.app-footer`, `.backlink` / `.toolbar` / `.pagetitle` / `.sectionhead`
  (+ `.oneline` for the item-detail single-line title) / `.volume` /
  `.volume-num`, `.overlay-scrim` / `.nav-sheet` (+ head / close / name /
  nav rows) / `.dialog` (+ `h2` / `> p` / `.error-text` / `.actions`),
  `.home` (+ `.brand` / `.tagline` / `.signin` / `.caption`), `.skeleton`.
- Overlay enter/exit uses `@keyframes` keyed on `[data-state='open'|'closed']`
  (not bare transitions) because Radix `Presence` waits on `animationName`
  before unmounting. `prefers-reduced-motion` disables them.

### 3. Primitives

- `git rm`'d the whole `src/components/ui/` folder (avatar, button,
  button-variants, dialog, input, label, sheet, skeleton).
- `components/Button.tsx` — `.btn` + a `Record<variant, class>` lookup +
  `size === 'sm' && 'btn-sm'`; `asChild` via `Slot`; defaults `type="button"`
  for real `<button>`s only. Variants renamed to the mock's set:
  `primary` (default) / `outline` / `ghost` / `danger` (was
  `default`/…/`destructive`/`link`).
- `components/TextField.tsx` — Radix `Label` + `.input`, optional `hint`,
  `invalid` → `aria-invalid` (drives the `.input[aria-invalid]` red ring).
  Replaces the separate `Input` + `Label` exports; every form now renders
  one `<TextField>` per field with a page-level `<p className="error-text">`
  for the submit error.
- `components/Dialog.tsx` / `components/Sheet.tsx` — thin Radix wrappers,
  `.dialog` / `.nav-sheet` skins, portal + `.overlay-scrim`. Written as
  `const X = DialogPrimitive.Y` + bottom `export { … }` (see difficulty 7).
  `Sheet` content passes `aria-describedby={undefined}` (documented Radix
  escape hatch — the sheet has no description).
- `components/Avatar.tsx` — Radix Avatar, fills `.avatar-btn`, `User`
  fallback.
- `components/Skeleton.tsx` — `.skeleton` (card-coloured block, opacity
  pulse); callers keep their `h-*/w-*` utility classes.

### 4. Shared components

- `EmptyState` — `.card.state`, `icon` prop (default `Inbox`; group-detail
  passes `BookOpen`), message, primary CTA with a `Plus` icon.
- `ErrorState` — `.card.state`, `TriangleAlert`, default copy
  `"Couldn't load. Please try again."`, outline `Retry` with `RotateCcw`.
- `DeleteConfirmDialog` — `.dialog` skin via the new `Dialog`; title +
  description + optional `error-text` between body and `.actions`;
  `Cancel` (X, outline) + `Delete`/`Deleting…` (Trash2, danger).

### 5. Layout

- `AppLayout` — `.app-shell` / `.app-header` (wordmark + `<NavMenu>`) /
  `.app-main` (`<Outlet>`) / `.app-footer`.
- `NavMenu` — `.avatar-btn` trigger (`aria-label="Open menu"`) → right
  `.nav-sheet`: `Menu` title + `Close menu` X, user name in
  `.nav-sheet-name` (`--font-ugc`), `Groups` (`Layers`) link + `Log out`
  (`LogOut`) button, both wrapped in `SheetClose`.

### 6. Pages (English copy + mock layout)

- `RootRoute` / `LoginPage` — skeleton in a `.home` container; `LoginPage`
  is now the `home-noauth` layout: `.brand` "siorie", `.tagline`,
  `<GoogleSignInButton>`, `.caption`. GIS button options left untouched
  (`theme: 'filled_black'`, `locale: 'ja'`) — 0004 "leave Google's button as
  rendered"; the `auth.test.tsx` `locale: 'ja'` assertion still holds.
- `GroupsListPage` — `.pagetitle` "Groups", `.toolbar` "New group" (`Plus`),
  `.list.card` rows (`.title` + `ChevronRight.chev`). Empty → `EmptyState`
  "No groups yet." / "New group".
- `GroupNewPage` — `.backlink` "Groups", `.pagetitle` "New group",
  `<TextField label="Name" hint="Up to 100 characters.">`, `.toolbar`
  submit "Create" / "Creating…" (`Check`).
- `GroupDetailPage` — `.backlink`, `.sectionhead` name (`.ugc`) +
  "Edit" (sm outline, `Pencil`), `.sectionhead` "Items" + "Add item"
  (sm primary, `Plus`, shown only when the list is non-empty — difficulty 6),
  `.list.card` rows with the `.vol` figure. Empty → `EmptyState`
  (`BookOpen`) "No items yet." / "Add item".
- `GroupEditPage` — `.backlink`, `.pagetitle` "Edit group",
  `<TextField label="Name">`, `.toolbar` "Save" / "Saving…" (`Check`),
  `self-start` danger "Delete group" (`Trash2`), `DeleteConfirmDialog`
  ("Delete this group?" / "Its items will be deleted too. This can't be
  undone.").
- `ItemDetailPage` — `.backlink` "Back" (see difficulty 5),
  `.sectionhead.oneline` title (`.ugc`, nowrap-clipped) + "Edit",
  `.volume.card` "Completed volume" + `.volume-num`, `.toolbar`
  "Add a volume" (`Plus`). Increment: `localVolume` state overrides the
  fetched figure, `submit(groupId, id, title, next)` via `useSubmit`
  (`api.updateItem`, message `"Couldn't update. Please try again."`), roll
  back `setLocalVolume(volume)` on `!result.ok`. Increment only.
- `ItemNewPage` / `ItemEditPage` — `.backlink` "Back", `.pagetitle`
  "New item" / "Edit item", `Title` + `Completed volume` (`type="number"`)
  TextFields, "Create"/"Save", and (edit only) `self-start` danger
  "Delete item" + `DeleteConfirmDialog` ("Delete this item?" / "This can't
  be undone.").

### 7. Tests

- Retargeted every Japanese copy assertion across `App.test.tsx`,
  `NavMenu.test.tsx`, `DeleteConfirmDialog.test.tsx`, and all seven
  group/item page test files to the new English strings (difficulty 2).
  Fixture *data* strings (`'漫画喫茶'`, `'山田 太郎'`) were kept — they
  verify that user content still renders in Japanese.
- `GroupDetailPage.test.tsx` — `getByText('100 巻')` → `getByText('100')`
  (the `.vol` element's own text node; the `vol.` unit is a child `<span>`).
- `ItemDetailPage.test.tsx` — the "reads N巻まで読了" assertion became
  `getByText('Completed volume')` + `getByText('100')`; added two tests:
  optimistic increment (100 → 101, asserts the `PATCH` body) and failure
  rollback (bump then back to 100 + inline `"Couldn't update…"`).
- `GroupEditPage` / `ItemEditPage` delete tests — the page's danger button
  is now `Delete group` / `Delete item` and the dialog's is `Delete`, so
  the two are named distinctly (previously both `削除する`, needing
  `within(dialog)`; kept `within(dialog)` anyway).
- No changes to `LoginPage.test.tsx`, `RootRoute.test.tsx`,
  `route-guards.test.tsx`, `auth.test.tsx` — they assert on `siorie`,
  route-local `<div>`s, or GIS options, none of which moved.

### 8. Verification

- `just check`: API `go vet` + `go build` pass; web `format:check` clean
  (after one `pnpm format` pass reformatted the new files), `lint` 0 errors
  / 1 pre-existing warning (`use-fetch.ts:40`, unrelated — worklog 0007),
  `test` 14 files / 52 tests pass (50 → 52: the two new increment tests),
  `build` (tsc + vite) passes. Bundle: `index.css` 16.7 KB (4.4 KB gzip),
  three `zen-maru-gothic-latin-*.woff2` at ~11.5 KB.
- Manual pass against a live backend (the user's dev session): groups list,
  group detail (item rows with the `vol.` figure), item detail (Completed
  volume card + Add a volume), group edit, and the delete dialog all render
  as their mocks. Nav sheet slide-in verified via DOM (`data-state` toggle,
  `right:0` 300 px white panel) after the screenshot tool timed out mid
  animation (difficulty 9).

## Result

`apps/web` now renders the 0016 moss × rounded-gothic system. `index.css`
holds the tokens and a `@layer components` port of the mock CSS; the shadcn
`components/ui/` folder is gone, replaced by hand-written `Button`,
`TextField`, `Dialog`, `Sheet`, `Avatar`, `Skeleton` on Tailwind v4 + the
kept Radix primitives (Dialog, Label, Avatar). Every page was rewritten to
the mock layout with English UI copy; the rounded display face (Zen Maru
Gothic, Latin subset) is self-hosted via `@fontsource`, no runtime CDN.
item-detail gained the optimistic "Add a volume" increment.

Web module: 1 dependency added (`@fontsource/zen-maru-gothic`), 1 removed
(`class-variance-authority`); 8 files deleted (`components/ui/*`), 6 new
components, `index.css` + `main.tsx` + `AppLayout` + `NavMenu` + all 9 page
files rewritten, 11 test files retargeted, 1 test file gained 2 tests.
14 test files / 52 tests green. `home-auth.html` has no counterpart (see
difficulty 1).

Not done here (out of `/work` scope — belongs to `/decide`):
`decision 0001` and `design/repository-structure.md` still say
"Tailwind v4 + shadcn/ui" and describe `components/ui/` as shadcn
primitives. The proposal flags these as needing an update once 0016 lands.

## Difficulties

1. **`home-auth.html` (one of the proposal's 9 mocks) has no screen to
   implement — the authenticated home was deleted between 0016's discussion
   and this worklog.** 0016's discovery is dated 2026-08-28; worklog 0008 /
   discussion 0015 (route-level auth split) landed 2026-08-29 as the current
   HEAD and removed `HomePage` entirely — `/` now redirects an authenticated
   visitor straight to `/groups`, and the user's name moved into the nav
   sheet. `home-auth.html` (brand + big avatar + name + Groups + Log out) is
   a screen that no longer exists; the nav sheet already carries the name +
   Groups + Log out it duplicated. So 8 of 9 mocks were implemented. This is
   proposal/timeline drift, not a design fault, but a reader checking "all 9
   mocks done?" needs to know one was overtaken by concurrent work.

2. **The "visual" overhaul was also a full JP→EN copy migration, and the
   test suite binds hard to display strings.** The discovery says "英語のみ
   を使用して" and the proposal is framed as ビジュアル刷新, but every
   existing page and component shipped Japanese copy (`グループを作成`,
   `編集する`, `保存できませんでした。もう一度お試しください。`, `削除中...`,
   `メニューを開く`, `読み込みに失敗しました。`, …) and every test asserted
   on those exact strings via `getByText` / `getByRole({name})` /
   `getByLabelText`. Reflecting 0016 therefore meant translating ~40
   user-facing strings *and* retargeting ~50 assertions across 11 test
   files. Nothing in the proposal's wording signals that the change is
   "visual + i18n + wide test churn" rather than "restyle". This is the same
   shape as worklog 0008's difficulty 1 (a presentation-layer change
   ballooning into a near-total test-file rewrite because assertions are
   coupled to exact output) — see the structural note below.

3. **The mocks are a hand-written CSS system with zero Tailwind; "keep
   Tailwind v4" had to be reinterpreted.** The proposal says "Tailwind v4 は
   継続。トークンで色を持ち、コンポーネントに直値を書かない". All 9 mocks
   are authored as `:root` custom properties + plain component classes
   (`.btn`, `.card`, `.row`, `.field`, …), no utilities. Faithful
   reproduction meant porting that CSS verbatim into `@layer components` and
   writing components as `className="btn btn-primary"`, i.e. the design
   system lives in `index.css`, not in utility strings on components.
   Tailwind stays as the build pipeline + a small `@theme` colour map + a
   handful of layout utilities (`self-start`, skeleton sizing). This does
   satisfy "no literal values in components" — but through semantic CSS
   classes, a different mechanism than "components built on Tailwind tokens"
   (the shadcn/`cva` model) implies. Worth stating because "we kept
   Tailwind" undersells how much the styling mechanism changed.

4. **Self-hosting the display face costs ~35 KB, not the ~1 MB a CJK
   web-font implies, because the two-font split makes the rounded face
   English-only.** The proposal's font note ("実装時 self-host") and the
   `--font` stack (`'Zen Maru Gothic', 'M PLUS Rounded 1c', …`) read as
   "vendor the rounded Japanese family". But the feedback-driven split —
   `--font` for chrome, `--font-ugc` (OS gothic, no web font) for user
   content — combined with difficulty 2 (all chrome copy is now English)
   means the self-hosted face never renders a Japanese glyph. So only
   `@fontsource/zen-maru-gothic`'s `latin-400/500/700` CSS is imported
   (three ~11.5 KB `.woff2`). `M PLUS Rounded 1c` (the proposal's first
   fallback) is *not* self-hosted — a second Latin-only fallback web font
   isn't worth the bytes; it stays as a named `font-family` fallback for
   machines that happen to have it. If someone later puts Japanese text in a
   heading/label/button, it will fall through to `ui-rounded` / Hiragino /
   system, not the self-hosted face — acceptable given the split, but a
   real constraint the token stack doesn't advertise.

5. **item-detail's backlink shows "Back", not the parent group's name as the
   mock does.** `item-detail.html` renders `← <span class="ugc">マンガ喫茶
   </span>`. `ItemDetailPage` fetches only the item; showing the group name
   there needs a `GET /api/groups/{id}` per item-detail view, which runs
   straight into discussion 0017 (redundant requests on load). So the
   backlink is `← Back` → `/groups/:groupId`. A small visible divergence
   from the mock; the group name in that slot is dropped rather than bought
   with an extra request.

6. **"Add item" button: shown in the section head only when the list is
   non-empty.** `group-detail.html` always renders `Items` + an `Add item`
   button, and its caption also gives the empty state its own `Add item`
   CTA — two entry points on the empty screen. The implementation shows the
   section-head button only when there are items and lets the empty state
   own the CTA otherwise, so the empty screen has one obvious action, not
   two stacked buttons. Deliberate; deviates from the mock's always-on
   button.

7. **`react-refresh/only-export-components` forbids
   `export const X = RadixPrimitive.Root`.** The first `Dialog.tsx` /
   `Sheet.tsx` used `export const Dialog = DialogPrimitive.Root` etc. and
   ESLint flagged all 7 such lines. The deleted shadcn files sidestepped it
   with `const X = …` then one bottom `export { X, Y, Z }`. Adopted that
   form. Minor, but it means thin re-export wrappers in this repo must use
   the grouped-export style, not `export const`.

8. **Radix overlay exit animations forced `@keyframes`, and the dev
   screenshot tool times out mid-animation.** Radix `Presence` (Dialog /
   Sheet content + overlay) only defers unmount for a CSS *animation*
   (`animationName` change), not a bare `transition`. So the scrim / sheet /
   dialog need `@keyframes …-in` / `…-out` selected via
   `[data-state='open'|'closed']`. During those ~150–220 ms windows,
   `Page.captureScreenshot` returned "renderer may be frozen" and timed
   out; a second attempt succeeded. Verified the sheet geometry via DOM
   inspection instead. Not a bug, but overlay screenshots in this app are
   inherently flaky right after an open/close.

## Structural note

Three difficulties were raised into discoveries after `/decide`:
[0018-ui-copy-test-coupling](../../discussions/0018-ui-copy-test-coupling/discovery.md)
(difficulty 2 + the note below),
[0019-selfhosted-font-subset-mismatch](../../discussions/0019-selfhosted-font-subset-mismatch/discovery.md)
(difficulty 4), and
[0020-detail-page-parent-context](../../discussions/0020-detail-page-parent-context/discovery.md)
(difficulty 5).

Difficulty 2 is the second occurrence of one pattern: a change to the
presentation layer (copy, or which screen renders) turns into a wide,
mechanical edit of test files because assertions are bound to exact
user-facing strings. Worklog 0008 difficulty 1 was the same — route guards
forced a near-total `App.test.tsx` rewrite. Here, an all-Japanese→English
copy pass required retargeting ~50 assertions in 11 files, and every future
copy tweak will too. There is no seam: display strings are inlined in
components and re-typed as literals in tests, with `getByText` /
`getByRole({ name })` / `getByLabelText` matching them verbatim. Candidate
directions if this is worth a discovery: (a) tests query by role +
`data-testid` / stable keys and stop asserting prose; (b) UI copy is
centralised (one module) so a change is one edit and tests import the same
constants; (c) accept it and treat copy changes as inherently
test-wide. This paragraph is the intended starting point if the human
decides to open that discovery.

## Deviations vs. proposal — summary

- `home-auth.html` not implemented — the authenticated home was removed by
  worklog 0008 before this worklog (difficulty 1).
- Overhaul included translating all UI copy JP→EN and retargeting ~50 test
  assertions — not implied by the proposal's "visual" framing (difficulty 2).
- Design system ported as `@layer components` CSS classes driven by
  `:root` tokens, not Tailwind utility classes on components (difficulty 3).
- Only Zen Maru Gothic's Latin subset self-hosted; `M PLUS Rounded 1c` left
  as an unbundled named fallback (difficulty 4).
- item-detail backlink is "Back", not the parent group's name (difficulty 5).
- group-detail "Add item" in the section head only when the list is
  non-empty (difficulty 6).
- `class-variance-authority` removed; Button variants are a plain class map.
- `decision 0001` / `design/repository-structure.md` not updated (deferred
  to `/decide`, as the flow prescribes).
- Everything else — token values, type/space/radius scales, the 8 other
  mocks, the increment behaviour, "no common layout on home", Radix kept
  for Dialog/Label/Avatar, `.badge` kept-but-unused — matches the proposal.
