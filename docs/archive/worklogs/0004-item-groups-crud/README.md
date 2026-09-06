---
date: 2026-08-25
status: merged
discussions: [0010-item-groups]
decisions: [0003-group-entity-crud]
pr: null
---

# Group entity CRUD

Implementing the group entity CRUD end to end (backend + frontend), per
[0010-item-groups proposal](../../discussions/0010-item-groups/proposal.md).

## Plan

- Backend: add `GroupStore` (`MemoryStore` + `FirestoreStore`) following the existing
  `UserStore`/`SessionStore` pattern, then register `GET/POST /api/groups`,
  `GET/PATCH/DELETE /api/groups/{groupId}` on the router.
- Frontend: add `api.getGroup`, replace `ItemsListPage` with a new `GroupDetailPage`
  at `/groups/:groupId`, rewire `GroupsListPage` and `GroupEditPage`, drop the
  `/groups/:groupId/items` route.

## What was done

Backend (`apps/api`):

- `internal/store/types.go`: added `Group`, `GroupStore` (`ListGroups`/`CreateGroup`/
  `GetGroup`/`UpdateGroup`/`DeleteGroup`, all scoped by `userID`), `ErrGroupNotFound`,
  and a `newID()` helper for opaque group/item IDs.
- `internal/store/memory.go`: implemented `GroupStore` on `MemoryStore` with an
  insertion-ordered slice (creation order = list order).
- `internal/store/firestore.go`: implemented `GroupStore` on `FirestoreStore` against
  `users/{sub}/groups/{groupId}`, ordered by `createdAt`. `DeleteGroup` deletes the
  `items` subcollection first, then the group document; both steps are no-ops on
  already-missing documents, so a retried DELETE converges safely.
- `internal/server/auth.go`: factored the session-cookie → userID lookup out of
  `GetMe` into a shared `authenticateSession` helper, reused by the group handlers.
- `internal/server/groups.go` (new): registered `GET/POST /api/groups` and
  `GET/PATCH/DELETE /api/groups/{groupId}`. State-changing routes validate `Origin`
  like the auth routes. `name` is validated via huma's `minLength`/`maxLength` tags
  (1–100 chars), returning 422 on violation. `DELETE` always returns 204, even for an
  already-deleted or foreign-owned group ID, matching the idempotency requirement.
- Tests: `internal/store/firestore_test.go` gained integration tests (create/get/
  update/delete, missing-group 404, creation-order listing scoped per user, cascade
  delete of items) run against the real Firestore emulator via `just apps/api/test`.
  `internal/server/groups_test.go` (new) covers auth-required, origin-rejection,
  full CRUD lifecycle, idempotent delete, 404s, validation errors, and per-user
  scoping (a second user can't see or touch the first user's group).

Frontend (`apps/web`):

- `lib/api.ts`: added `getGroup`.
- `pages/groups/GroupDetailPage.tsx` (new): shows the group name, an edit button,
  and the item list/empty-state body ported from the removed `ItemsListPage`
  (items API still isn't implemented, so this keeps falling back to the empty
  state exactly as before).
- `pages/groups/GroupsListPage.tsx`: each row now links straight to
  `/groups/:groupId`; the separate "edit" link is gone.
- `pages/groups/GroupEditPage.tsx`: initial data now comes from `api.getGroup`
  instead of "fetch the list and `.find()`"; added `maxLength={100}` to the name
  input.
- `pages/groups/GroupNewPage.tsx`: added `maxLength={100}` to the name input.
- Deleted `pages/groups/items/ItemsListPage.tsx`; `App.tsx` drops the
  `/groups/:groupId/items` route and adds `/groups/:groupId` → `GroupDetailPage`.
- `test/renderWithProviders.tsx`: added an optional `path` prop so a rendered page
  can be wrapped in a matching `<Route>`, letting `useParams()`-dependent pages be
  unit-tested (see difficulties below).
- New `GroupDetailPage.test.tsx`; updated `GroupsListPage.test.tsx` and
  `App.test.tsx` for the new link/route.

## Verification

- `just apps/api/check` (format-check, `go vet`, tests incl. the Firestore-emulator
  integration tests, build) — all green.
- `pnpm format:check` / `pnpm lint` / `pnpm test` (24 tests) / `pnpm build` — all
  green.
- Started the real stack (Firestore emulator + `just apps/api/dev` + `just dev-web`),
  seeded a user/session directly into the emulator via its REST API, and drove the
  live `GET/POST/GET/PATCH/GET(list)/DELETE/DELETE` sequence against
  `http://localhost:8080/api/groups` with `curl` — full lifecycle behaved as
  expected, including the idempotent double-DELETE and the 404 after delete.
- Opened `http://localhost:5173/groups` and `/groups/g1` unauthenticated in a real
  browser: both render their fallback state (empty state / persistent skeleton,
  respectively) with no console errors. Could not verify the *authenticated*
  browser UI directly — see difficulties.

## 困難 (difficulties)

- **Goのメソッド名衝突**: `GroupStore` の `Create`/`Get`/`Update`/`Delete` を最初
  `UserStore`/`SessionStore` と同じ名前で `MemoryStore`/`FirestoreStore` に生やそうと
  したが、同じ構造体に同名メソッドを複数のシグネチャで定義できず（Go はオーバーロード
  非対応）、コンパイルエラーになった。`ListGroups`/`CreateGroup`/`GetGroup`/
  `UpdateGroup`/`DeleteGroup` とエンティティ名を付けて解決した。設計判断というより
  単純な見落としだが、今後 `ItemStore` を足すときも同じ衝突が起きるはずなので、
  最初から `<Entity><Verb>` 命名にしておくと手戻りがない。

- **テストインフラの穴**: `useParams()` に依存するページ（`GroupDetailPage`)を
  初めてユニットテストしようとしたところ、共通の `renderWithProviders` が
  `MemoryRouter` の `initialEntries` だけを設定し、`<Routes>/<Route>` で包んでいな
  かったため、`useParams()` が常に空オブジェクトを返すことが分かった。
  これまで `useParams` を使うページ（`GroupEditPage`、`ItemEditPage` など）には
  そもそもテストが書かれていなかったため、この穴が表面化していなかった。
  `renderWithProviders` に任意の `path` を渡せるようにして解決したが、既存の
  編集系ページにも同じ穴が伏在している。

- **認証込みのブラウザ実地確認ができなかった**: Google Identity Services による
  実サインインには実際の Google アカウントと OAuth 認証情報が要り、この環境では
  用意できない。次善策として `document.cookie` でセッション Cookie を直接注入
  しようとしたが、ハーネス側のセキュリティガードにブロックされた（セッション
  ハイジャック対策として妥当な制限だと判断し、回避策は探さなかった）。
  代わりに、Firestore エミュレーターへ直接ユーザー・セッションドキュメントを
  シードしたうえで `curl` から実サーバー（実 Firestore エミュレーター込み）に
  対して CRUD 一連の操作を行い、実際に動くことを確認した。ブラウザ側は
  未認証時のフォールバック表示（空状態・スケルトン維持）のみ目視確認できた。
  認証込みのUI操作（ボタンクリックでの作成・編集・削除）そのものは検証できて
  いない。今後この種の機能を実装するたびに同じ壁にぶつかるはずなので、
  ローカル専用のテスト用ログイン経路（例: 開発環境限定で `FakeVerifier` を
  使う起動オプション）を用意するかどうかは、別途検討の価値があるかもしれない。

## 提案とのずれ

- **アイテム作成・編集ページの遷移先が空URLになる**: `ItemNewPage`/`ItemEditPage`
  は成功後に `navigate(`/groups/${groupId}/items`)` していたが、このURLは今回の
  提案で廃止対象になっている。proposal はこの2ファイルを「変更しない」と明記して
  いたため、今回は手を付けていない。ただしアイテムAPIがまだ存在せず、
  `api.createItem`/`updateItem`/`deleteItem` の fetch が navigate 到達前に必ず
  失敗する（＝現状は到達不能なコード）ため、実害はまだない。将来アイテムCRUDに
  着手する議論で、この遷移先も併せて直す必要がある。

- **一覧の並び順の向きは未決定のまま実装した**: proposal は「作成日時による
  固定の順序」とだけ決まっていて、昇順・降順は決まっていなかった。今回は
  `createdAt` 昇順（古い方が先）で実装した。議論で確定した値ではなく実装時の
  既定値なので、後で変える可能性がある前提で書いておく。
