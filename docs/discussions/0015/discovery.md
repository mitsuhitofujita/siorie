---
date: 2026-08-28
tags: [frontend, auth, ui, react]
status: open
worklogs: []
---

ホーム画面でログイン直後（リロードなし）にGoogleのサインインボタンがアバターと
共存したまま残る、という現象がまた出た。[0009-home-with-auth](../0009-home-with-auth/proposal.md)
で一度議論した現象とまったく同じ。

## 0009 はどうなっていたか

0009 の proposal は「`HomePage.tsx` の3つの早期 return が返す各 `<main>` に
`key={state.status}` を付け、状態が変わるたびにDOMノードごと作り直させる」（A案）で
合意していた。B案（`renderSignInButton` を呼ぶ `useEffect` にクリーンアップを足し、
`unauthenticated` から外れる際に注入済みボタンを消す）は次善案として記録していた。

ところが対応する worklog が `docs/worklogs/` に存在せず、`HomePage.tsx` は 0009 の
議論コミット（`18e3792`）以降まったく変更されていない（`git log 18e3792..HEAD --
apps/web/src/pages/HomePage.tsx apps/web/src/lib/auth.tsx` が空）。stash・reflog にも
痕跡なし。つまり提案は書かれたが実装されず、現象は最初から直っていなかった。
「また出た」ではなく「ずっと直っていなかったものを再度踏んだ」が正しい。

## 今回セッションで試したこと

0009 が次善案として記録していた B案を実装して、遷移テストで検証した。
未認証→認証済みの `rerender` で、`renderSignInButton` が実際にDOMノードを注入する
モック（Googleのスクリプトの模擬）を使った。

- 修正なし: 注入ノードがアバターの隣に残る（現象再現、jsdom でも再現した）。
- `useEffect` のクリーンアップで `container.replaceChildren()`: 注入ノードは消えるが、
  **React が同じ `<div>` に描いたアバターと名前まで一緒に消えた**。
- `useLayoutEffect` に変えて同じクリーンアップ: 同じくアバターまで消えた。
- 原因: 未認証ブランチと認証済みブランチは `<main>` の同じ位置に `<div>` を返すため、
  React はこの `<div>` を使い回して認証済みのアバターを中に描画する。クリーンアップが
  走るのはその後なので、「Googleが注入したノード」と「Reactが描いたノード」を
  区別できず両方消してしまう。クリーンアップ時点で `signInButtonRef.current` を見ても
  React が既に null 化している。
- `key`（サインイン `<div>` だけ、あるいは各 `<main>`）を付けると現象は消える
  （テスト通過）が、これは 0009 の A案に戻るだけ。

## 見直したいこと

`key` で「React に作り直させる」のは対症療法で、この構造が残る限り、認証まわりの
UIをいじるたびに毎回この手を思い出さないといけない。そもそも次の3つの組み合わせが
React の差分適用と噛み合っていないのが問題に見える。

1. `HomePage` が `state.status` で3つの早期 `return` に分かれ、それぞれ別の JSX を返す。
2. そのうち1つ（未認証）の中の `<div>` に、Googleのスクリプトが命令的に iframe を
   注入する（React管理外のDOM操作）。
3. 状態が変わると React はブランチ間で `<main>` / `<h1>` / `<div>` を位置で対応付けて
   使い回すため、注入されたノードだけが取り残される。

以前どこかの会話で「認証状態によってDOMを切り替えるのは一般的」という助言をもらって
いま HomePage はその形になっているが、その前提から見直したい。結論はまだない。
検討したい方向性の例:

- サインインボタンのコンテナを、React が絶対に使い回さない形にする。専用コンポーネントに
  切り出して安定した identity を持たせる／条件分岐の外に常設して表示だけ切り替える／
  ポータルで別ツリーに逃がす、など。
- 認証状態による画面切り替えを、コンポーネント内の早期 return ではなくルート単位で行う
  （`/` と `/login` を分ける、ルートガードで振り分ける）。[0004-home-and-login](../0004-home-and-login/proposal.md)
  は「専用 `/login` ページは作らない」と決めているので、その判断の再検討も含む。
  未認証アクセスのルートガード自体は [0006-unauthenticated-route-guard](../0006-unauthenticated-route-guard/discovery.md)
  で別途 open のままなので、そこと合流させる案もある。
- `google.accounts.id.renderButton` に渡すコンテナのライフサイクルを、React の
  レンダーツリーとは別に管理する（ref に生成した要素を保持し、mount/unmount を明示制御）。

## 具体的な足がかり

- `apps/web/src/pages/HomePage.tsx`
  - 12-20行: `HomePage` は `useAuth()` の `state` と `signInButtonRef`。`useEffect` が
    `state.status === 'unauthenticated'` のとき `renderSignInButton(signInButtonRef.current)` を呼ぶ。
  - 22-42行: `loading` / `unauthenticated` の早期 return。未認証ブランチは
    `<div ref={signInButtonRef} data-testid="google-signin-button" />` を `<main>` の2番目の子として返す。
  - 44-65行: 認証済みブランチ。`<main>` の2番目の子は `<div className="flex flex-col items-center gap-3">`（アバター＋名前）。
- `apps/web/src/lib/auth.tsx`
  - 115-128行: `renderSignInButton` が `window.google!.accounts.id.renderButton(container, {...})` を呼ぶ。
  - コメント（109-114行）に「plain button ではなく Google 製ボタンをレンダーする」理由が書いてある。
- `apps/web/src/App.tsx`: `/` → `<HomePage />`。認証によるルート分岐はなく、`AppLayout` はホーム以外に適用。
- `docs/discussions/0009-home-with-auth/minutes.md` / `proposal.md`: 現象の原因分析と A/B 案の記録。
- `docs/discussions/0004-home-and-login/proposal.md` の「ホームページ（`/`）」節: 未認証／認証済みの出し分けと「専用 `/login` は作らない」の決定。
