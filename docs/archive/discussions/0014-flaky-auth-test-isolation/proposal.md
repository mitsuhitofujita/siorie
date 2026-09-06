---
date: 2026-08-29
---

# 提案: auth.test.tsx の flaky を、teardown 前の effect flush で解消する

## 背景

worklog [0006-form-error-handling](../../worklogs/0006-form-error-handling/plan.md) の
`just check` で、変更と無関係の `apps/web/src/lib/auth.test.tsx` が
フルスイート実行時にだけ低確率（≒10%）で失敗した。

```
FAIL  src/lib/auth.test.tsx > AuthProvider > starts loading, then becomes unauthenticated when /api/me fails
TypeError: Cannot read properties of undefined (reading 'accounts')
 ❯ src/lib/auth.tsx:118:22   window.google!.accounts.id.renderButton(...)
 ❯ src/lib/auth.test.tsx:14:7
 ❯ ... commitHookPassiveMountEffects ...
```

## 原因（切り分け済み）

discovery は「単体では絶対に再現しない・フルスイートでのみ低確率」を根拠に、
vitest のファイル間 isolation の綻びを疑っていた。検証の結果、これは違った。

- `auth.test.tsx` 単体でも CPU 負荷下では ~24%（25回中6回）落ちる。つまり
  「単体は常に成功」は負荷不足の観測で、isolation 破れ説は成り立たない。
- `auth.test.tsx` の `afterEach`（`vi.unstubAllGlobals()` + `delete window.google`）を
  無効化すると、同じ負荷でフルスイート18回連続 0 失敗。元に戻すと再現。
- スタックは `Probe`（`auth.test.tsx` 内で定義）の `useEffect` が React の passive
  effect commit 中に `renderSignInButton` → `window.google.accounts` を呼んで throw。

機構はこう。テスト本体は `await waitFor(status === 'unauthenticated')` で、DOM の
テキストが変わった時点で抜ける。しかし `window.google` に実際に触るのはそれとは
別スケジュールの passive effect（`Probe` が `state.status === 'unauthenticated'` を
見て `renderSignInButton(container)` を呼び、`gisReady === true` なら
`window.google!.accounts.id.renderButton(...)` に至る）。スケジューラが詰まると、
この effect の flush がテスト本体の完了・同期 `afterEach` の実行より後ろにずれ込む。
`afterEach` は既に `delete window.google` を済ませているので、effect は消えた
グローバルを読んで落ちる。最初の `it` で出るのは「直前テストの残骸」ではなく
「このテスト自身の effect が、このテスト自身の teardown の後に走る」ため。
負荷と相関するのはこれで説明できる。

要するに **act の外へ漏れた passive effect × グローバルの同期 teardown の競合**。

### 影響範囲

`auth.test.tsx` のみ。real `AuthProvider` を描くもう一方の `App.test.tsx` は
`window.google` を stub せず、`loadGoogleIdentityServices()` が実 `<script>` 分岐に
入り、その `load`/`error` が jsdom で発火しないため `gisReady` は `false` のまま。
`renderSignInButton` は先頭の `if (!gisReady) return` で抜け、`auth.tsx:118` に
到達しない。

## 提案

`apps/web/src/lib/auth.test.tsx` の既存 `afterEach` を、stub が生きている間に
pending effect を flush してから unstub / delete する形にする。

```ts
import { act, render, screen, waitFor } from '@testing-library/react'

afterEach(async () => {
  // Flush any pending passive effect (Probe's renderSignInButton) while the
  // google stub is still installed, so it can't run against a deleted
  // window.google after teardown.
  await act(async () => {})
  vi.unstubAllGlobals()
  delete (window as { google?: unknown }).google
})
```

- プロダクトコード（`auth.tsx` ほか）は変更しない。変更は `auth.test.tsx` の
  この1箇所のみ。
- 各テストの assertion は現状維持（`Probe` の `renderButton` 呼び出しを待つ責務を
  個々のテストに背負わせない）。将来この file に追加されるテストも自動的にカバーされる。
- `delete window.google` は `vi.unstubAllGlobals()` と冗長（`google` は元々グローバルに
  無いので unstub が消す）だが、意図を明示する belt-and-suspenders として残す。
  整理したい場合は別途。

### 検証（提案時点で実施済み）

上記の形を当てて、`yes > /dev/null` で1コア占有した状態で
フルスイート×30 + `auth.test.tsx` 単体×14 = 計44回連続、失敗 0。
対照（未修正）は同じ負荷で ~9 回以内に再現していた。

worklog では、この負荷付き反復（フルスイート・単体それぞれ 20回以上）で 0 失敗を
再確認する。

## 検討したが採用しなかった案

詳細は [minutes.md](minutes.md) を参照。

- **`test.retry` で受け入れ**: 競合は残り、負荷下では `retry(2)` でも ~1% で CI が
  落ちうる。将来の実回帰を「例の flake」として masking する。手間は A とほぼ同じで
  利点が薄い。
- **`renderSignInButton` に `window.google?.accounts?.id` の防御ガード**: crash クラスは
  消えるが、GIS の真の未ロードも黙って no-op になり実障害を隠す。
- **`AuthProvider` に GIS ローダの seam を入れる**: 筋は良いが範囲が広く、
  [0015](../0015/discovery.md) の「GIS コンテナを React ツリーの外で管理する」方向と
  重なる。0014 はテスト側の最小修正に絞る。
- **テスト毎に `await waitFor(() => expect(renderButton).toHaveBeenCalled())` を足す**:
  該当テストそれぞれに同じ待ちが要り、将来の新規テストでも同じ罠を踏む。`afterEach`
  一括の方が一箇所で済む。

## スコープ外

- `App.test.tsx` が `AuthProvider` を6回描画するたびに実 `<script src=".../gsi/client">`
  を `document.head` へ注入し除去しない件。今回のバグの原因ではない（`isolate: true`）が、
  同じ `AuthProvider` の命令的 DOM 操作という匂いではある。[0015](../0015/discovery.md)
  側の論点として残す。

## 実装後に確認したい点

- CI（GitHub Actions 等、CI/CD は [0003](../0003-cicd-service-selection/discovery.md) で
  未決）のランナーは一般に負荷が高くローカルより flaky が出やすい。デプロイ構成が
  決まった段階で、この修正後も CI 上で再発しないかを一定期間ウォッチする。
