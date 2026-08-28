---
date: 2026-08-28
tags: [testing, frontend, flaky-test]
status: open
worklogs: [2026-08-28-form-error-handling]
---

worklog [2026-08-28-form-error-handling](../../worklogs/2026-08-28-form-error-handling/plan.md)
で `just check` を流していたときに気づいたこと。今回の変更(`apps/web/src/lib/use-fetch.ts`
などフォーム・取得系のエラー表示)とは無関係のはずの既存テストが、フルスイート実行時にだけ
1回失敗した。

```
FAIL  src/lib/auth.test.tsx > AuthProvider > starts loading, then becomes unauthenticated when /api/me fails
TypeError: Cannot read properties of undefined (reading 'accounts')
 ❯ src/lib/auth.tsx:118:22
    116|     (container: HTMLElement) => {
    117|       if (!gisReady) return
    118|       window.google!.accounts.id.renderButton(container, {
       |                      ^
```

失敗したテストは `describe('AuthProvider')` の**最初の**`it`で、`window.google` は
`mockGoogleIdentityServices()`(`vi.stubGlobal('google', ...)`)でこのテスト自身が
render前に同期的にセットしている。それにもかかわらず、非同期に発火する
`Probe` の effect(`renderSignInButton` を呼ぶ)が実行される時点では `window.google` が
`undefined` になっていた。

再現性を確認した。

- `pnpm exec vitest run src/lib/auth.test.tsx` で単体実行 → 常に成功(複数回)。
- `pnpm exec vitest run`(フルスイート)を10回程度繰り返す → 1回だけこの失敗が発生、
  残りは全て成功。
- `git stash` で今回の変更を退避し、変更前のコード(この worklog 開始前の main の状態)に
  対して同じフルスイートを複数回実行 → 同じ確率感(10回中1回程度)で同じ失敗が再現した。
  つまり今回の変更が原因ではなく、既存のテストスイートに元々あった flakiness。

`lib/auth.tsx` の `loadGoogleIdentityServices` は、`window.google?.accounts?.id` が
真でなければ実 `<script src="https://accounts.google.com/gsi/client">` を
`document.head` に追加し、`load`/`error` イベントを待つ。`auth.test.tsx` はこの分岐を
踏まないよう毎テストで `window.google` を事前にスタブしているが、`afterEach` で
`vi.unstubAllGlobals()` と `delete window.google` を行っている
(`AuthProvider`・`App.test.tsx` が本物の `AuthProvider` をレンダーする2ファイルのうち、
`App.test.tsx` 側は `window.google` を一切スタブせず、`renderApp` を6回呼ぶたびに実
`<script>` タグの `load`/`error` リスナーを積み増している)。

自分の中の仮説はこうだ。`auth.test.tsx` の最初の `it` が失敗したという事実は、
「同じファイル内の直前のテストの残骸」では説明できない(直前のテストが存在しないため)。
だとすると、`window.google` の削除やスクリプトタグの副作用が**ファイルをまたいで**
何らかの形で干渉している可能性がある。`apps/web/vite.config.ts` の `test` 設定は
`environment`/`setupFiles` のみで、`isolate`/`pool` は既定値のまま。既定でファイルごとに
環境が分離されるはずだが、実際に見えている現象(単体では絶対再現しない・フルスイートでは
低確率で再現する)は、その分離が完全ではない、あるいは `AuthProvider` が本物の
DOM副作用(`<script>` タグの追加、`window.google` への直接代入)を持つこと自体が
テストの隔離を壊しやすい設計になっている、という違和感につながる。

[docs/README.md](../../README.md) の「困難は次の起点になる」に倣い、単発の事故ではなく
構造の問題に見えたため discovery として起こした。原因の特定はできていない
(vitestの`isolate`設定を疑うべきか、`AuthProvider`側で実スクリプト注入をテスト時だけ
回避できるようにすべきか、それとも見えている現象自体を別の角度から説明すべきか)。
