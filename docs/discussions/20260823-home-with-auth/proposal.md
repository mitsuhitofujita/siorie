# ホーム画面：ログイン直後にサインインボタンが残るバグの修正

## ステータス

提案。決定ではない。

## 背景

discovery.md の「ホームページのGoogle認証後にユーザの名前を画像を表示する」という要求そのものは、
すでに [20260823-home-and-login](../20260823-home-and-login/proposal.md) で提案・合意され、
[20260823-home-login-frontend-structure](../../worklogs/20260823-home-login-frontend-structure/README.md) と
[20260823-google-auth](../../worklogs/20260823-google-auth/README.md)（merged、
[decision 0002](../../decisions/0002-google-id-token-auth.md)）で実装・動作確認済みである。
`apps/web/src/pages/HomePage.tsx` の認証済みブランチは、`GET /api/me` が返す
`name`/`pictureUrl` をすでにアバターと名前として表示している。

議論の過程で実際に手元で動かしたところ、この機能自体は正しく動作した。一方で、それとは別に
**ログイン直後（ページのリロードなし）に限り、Googleのサインインボタンがアバター表示と共存したまま
残ってしまう**という表示バグが見つかった。ページをリロードすると解消する。本提案はこのバグの修正のみを
対象とする。認証後の名前・画像表示という当初の要求に対する追加の設計判断は不要と判断した。

なお、議論の初期段階で「認証済み状態にそもそも遷移しない」という別の症状も報告されたが、これは
ローカル開発でFirestoreエミュレータ（`just apps/api/firestore-emulator`）を起動していなかったことが
原因で、`cmd/server/main.go` が `firestore.NewClient()` 失敗時に `log.Fatalf` で終了し、Go APIサーバーが
ポート8080で待ち受けていなかったことによるものだった。エミュレータを起動して再試行したところ正常に
動作したため、コードの欠陥ではなく運用上の問題として本提案のスコープからは除外する。

## 問題

`apps/web/src/pages/HomePage.tsx` は `state.status` に応じて3つの早期 `return` で異なるJSXを返す
（`loading` / `unauthenticated` / `authenticated`）。このうち「未認証」と「認証済み」の2つのブランチは、
どちらも `<main>` の2番目の子要素として同じ位置に `<div>` を返している。

```tsx
// 未認証ブランチ
<div ref={signInButtonRef} data-testid="google-signin-button" />

// 認証済みブランチ
<div className="flex flex-col items-center gap-3">
  <Avatar>...</Avatar>
  <span>{state.user.name}</span>
</div>
```

同じ位置・同じタグ（`div`）のため、`state.status` が `unauthenticated` から `authenticated` に
変わってもReactはこのDOMノードを使い回す。一方、未認証ブランチの `<div ref={signInButtonRef}>` は
`renderSignInButton()`（`google.accounts.id.renderButton()`）によってGoogleのスクリプトが直接iframeを
注入する対象であり、Reactの管理外で行われるDOM操作である。Reactは自分が管理していないその子要素の
存在を把握していないため、`authenticated` への遷移時にそれを取り除かず、Avatar用の新しい要素を
ただ追加する。結果としてGoogleのサインインボタンとアバターが同じdiv内に共存する。

ページ全体をリロードするとコンポーネントが最初から作り直されるためこの使い回しが起きず、問題は
発生しない。これが「リロードすると消える」という観測と一致する。

## 修正方針

`HomePage.tsx` の3つのブランチが返す `<main>` それぞれに `key={state.status}` を付与する。
`state.status` が変わるたびにReactは別要素として扱い、DOMノードを使い回さず作り直すため、
未認証ブランチが注入したGoogleのボタンを含むDOM木は確実に破棄され、認証済みブランチのDOM木が
新規に作られる。

`loading` から他の状態への遷移でも同様にDOM全体が作り直されるが、`loading` ブランチはスケルトン
表示のみで副作用によるDOM注入を行っていないため、実害はない。

## 検討したが採用しなかった案

- **注入した副作用自身に後始末をさせる案。** `renderSignInButton` を呼んでいる `useEffect` に
  クリーンアップ関数を追加し、`state.status` が `'unauthenticated'` から外れる際に
  `signInButtonRef.current` の中身を明示的に削除する。影響範囲は `key` を使う案より狭いが、
  今回はシンプルさを優先し不採用とした。

## スコープ外

- 認証後の名前・画像表示という当初の要求そのものの再設計（すでに実装・動作確認済みのため不要）。
- ローカル開発でFirestoreエミュレータの起動を忘れると認証が動かない、という運用上の問題への対応
  （READMEやセットアップ手順の改善など）。今回はコードの欠陥ではないと切り分けたため対象外とし、
  必要であれば別の discovery として扱う。
