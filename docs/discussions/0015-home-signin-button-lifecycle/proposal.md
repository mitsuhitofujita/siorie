# ホーム画面の認証 UI をルート単位に分け、サインインボタンを専用コンポーネントにする

## ステータス

提案。決定ではない。

## 背景

`apps/web/src/pages/HomePage.tsx` は `state.status` に応じた3つの早期 `return`
（`loading` / `unauthenticated` / `authenticated`）で異なる JSX を返す。未認証ブランチと認証済み
ブランチは、どちらも `<main>` の2番目の子として同じ位置に `<div>` を返す。未認証ブランチの
`<div ref={signInButtonRef}>` には `google.accounts.id.renderButton()` が iframe を命令的に注入する
（React 管理外の DOM 操作）。

`unauthenticated` → `authenticated` の遷移時、React はこの `<div>` を位置で対応付けて使い回し、
中にアバターを描画する。Google が注入した iframe は React の管理対象ではないため取り除かれず、
アバターと共存して残る。リロードするとコンポーネントが作り直されて消える。これが discovery の
「ログイン直後だけボタンが残る」の機構である。

[0009-home-with-auth](../0009-home-with-auth/proposal.md) がこの現象を分析し、A案（各 `<main>` に
`key={state.status}`）を「シンプルさ優先」で採用、B案（`renderSignInButton` を呼ぶ `useEffect` に
クリーンアップを足す）を次善案として記録していた。しかし 0009 に対応する worklog は無く、
`HomePage.tsx` は 0009 の議論コミット以降変更されていない。提案は書かれたが実装されず、現象は
最初から直っていなかった。

今回のセッションで B案を実装して検証したところ、**B案は成立しない**ことが分かった。パッシブ
effect のクリーンアップは、React が新しいレンダーを使い回しノードにコミットし終えた後に走る。
その時点でノードには React が描いたアバターが入っており、`signInButtonRef.current` は React が
既に null 化している。`container.replaceChildren()` も `useLayoutEffect` 版も、注入ノードと一緒に
アバターまで消した。

原因は「認証状態で UI を切り替えること」自体ではない（それは一般的で問題ない）。**命令的な
`renderButton()` 注入を、React が位置で使い回すノードに対して行っている**ことが問題である。
したがって修正は「未認証を抜けるときにコンテナのノードを確実に unmount させる」か「コンテナを
React の差分対象の外に出す」のいずれかになる。`key` は前者の最も雑な形にすぎない。

## 方針（scope (b)）

認証状態による画面切り替えを、コンポーネント内の早期 return ではなく **ルート単位** で行う。
併せて Google サインインボタンを **auth モジュールが公開する自己完結コンポーネント** に切り出す。

### ルーティング

| パス | レンダー内容 | ガード | 共通レイアウト |
| --- | --- | --- | --- |
| `/` | リダイレクトのみ（内容を持たない） | 自前で `state.status` を見る | 不使用 |
| `/login` | 未認証ビュー。タイトル ＋ `<GoogleSignInButton />` | `<RequireGuest>` | 不使用 |
| `/groups/*` | 各ページ（現状どおり） | `<RequireAuth>`（`AppLayout` のルート要素を1回包む） | 使用 |

- **`/`（`RootRoute` 仮称）**: `loading` の間は最小のローディング画面。`authenticated` なら
  `<Navigate to="/groups" replace />`、`unauthenticated` なら `<Navigate to="/login" replace />`。
  それ自身の UI は持たない。
- **`/login`（`LoginPage` 仮称）**: `HomePage.tsx` の未認証ブランチを移設したもの。`loading` の間は
  ページ自身のスケルトン。`<RequireGuest>` が `authenticated` を検知したら `/groups` へ送るので、
  ログイン成功後の遷移はこのガードが declarative に担う。
- **`/groups/*`**: `App.tsx` の `<Route element={<AppLayout />}>` を
  `<Route element={<RequireAuth><AppLayout /></RequireAuth>}>` に変える（0006 の候補3）。

### ガードの挙動

- **`<RequireAuth>`**: `unauthenticated` → `<Navigate to="/login" replace />`。`loading` /
  `authenticated` → 子を素通し（各ページが自前のローディングを出す）。
- **`<RequireGuest>`**: `authenticated` → `<Navigate to="/groups" replace />`。`loading` /
  `unauthenticated` → 子を素通し。
- `loading` を明示的に扱うのは `/` だけ。`/` は他に描くものが無いため。

### ログイン後の遷移と深いリンク

- ログイン成功 → `state` が `authenticated` → `/login` の `<RequireGuest>` が `/groups` へ。
- 未認証で `/groups/xyz` に直接到達 → `<RequireAuth>` が `/login` へ → ログイン後 `/groups`。
  **元 URL には戻さない**（`location` の退避はしない）。当面は一律 `/groups` 着地で十分と判断。

### `<GoogleSignInButton />`

auth モジュール（`auth.tsx` / `auth-context.ts`）が公開するコンポーネント。

- 内部に自分のコンテナ `ref`、`renderButton(ref.current, {...})` を呼ぶ effect、`gisReady` 待ち、
  自分のコンテナだけを消すクリーンアップ（`ref.current?.replaceChildren()`）を持つ。
- **自分の `<div>` にしか触れない**ため、`<StrictMode>` の二重マウントでもクリーンアップが
  安全（[0017](../0017-duplicate-api-requests-on-load/minutes.md) が指摘していた懸念）。
- ルート遷移（`/login` → `/groups`）でコンポーネントごと unmount され、`<div>`（Google の iframe
  込み）は React が DOM から除去する。orphan は「避ける」ではなく **構造的に発生し得ない**。
- `AuthContextValue.renderSignInButton`（コンテナを渡す命令的 API）は削除する。`HomePage` 側の
  `useRef` ＋ `useEffect` の受け渡しも消える。
- decision 0002 / 0007 の「常に Google 製 `renderButton()` の出力をレンダーする」方針は維持する。
  このコンポーネントはその呼び出しのラッパにすぎず、`prompt()` やプレーンボタンには移さない。

### 認証済みホームの廃止とユーザー名の移設

- `/` のアカウント表示（アバター＋名前）＋グループ一覧リンク＋ログアウトを廃止する。`/` は
  リダイレクトのみになる。グループ一覧リンクとログアウトは `NavMenu`（`/groups/*` のヘッダ）に
  既にある。
- 名前の表示場所が無くなるため、**`NavMenu` のシート内にユーザー名を表示する**（本スコープに含む）。
- `HomePage.tsx` は `LoginPage.tsx`（未認証ビュー）と `RootRoute.tsx`（`/` のリダイレクト判定）に
  分割し、認証済みブランチは削除する。

## 覆る決定・吸収される議論

- **[0004-home-and-login](../0004-home-and-login/proposal.md)** — 2点を覆す。
  1. 「専用の `/login` ページは作らない」→ 作る。
  2. 「認証済みホームにアカウント表示を残す（`/groups` へ直接リダイレクトしない）」→ `/` は
     リダイレクトのみにし、認証済みは `/groups` へ送る。
  `/decide` 時に新しい decision からこの反転を明記し、0004 へ相互リンクする。
- **[0006-unauthenticated-route-guard](../0006-unauthenticated-route-guard/discovery.md)（open）** —
  本提案の `<RequireAuth>` は 0006 の検討候補3そのもの。0015 に吸収する。0006 の discovery に
  0015 へのポインタを追記し、0015 が decided になった時点で 0006 を閉じる。
- **[0009-home-with-auth](../0009-home-with-auth/proposal.md)（proposed・未実装）** — 0015 が
  supersede する。B案は今回の検証で成立しないと判明。A案は対症療法として不採用。`/decide` 時に
  0009 の status とリンクを更新する。

## 0016 との順序

[0016-visual-style-overhaul](../0016-visual-style-overhaul/proposal.md)（proposed、コード反映前）
より先に 0015 を実装する。0016 の仕様 HTML は既に `home-noauth.html` / `home-auth.html` を別ファイル
に分けており、`/` と `/login` の分割はその構造と一致する。ルート構成はスタイルと直交するため
0016 で捨てられない。0016 は本提案が敷いたルート骨格の上でマークアップを差し替える。

## 影響範囲（想定）

- `apps/web/src/App.tsx`: `/login` ルート追加。`AppLayout` のルート要素を `<RequireAuth>` で包む。
  `/` の `element` をリダイレクト用コンポーネントに差し替え。
- `apps/web/src/pages/HomePage.tsx`: `LoginPage.tsx` と `RootRoute.tsx`（いずれも仮称）に分割。
  認証済みブランチ削除。
- `apps/web/src/lib/auth.tsx` / `apps/web/src/lib/auth-context.ts`: `<GoogleSignInButton />` を
  追加。`renderSignInButton` を `AuthContextValue` から削除。
- 新規 `apps/web/src/components/route-guards.tsx`（仮称）: `RequireAuth` / `RequireGuest`。
- `apps/web/src/components/layout/NavMenu.tsx`: シート内にユーザー名を表示。
- テスト: `apps/web/src/pages/HomePage.test.tsx` を分割・再構成（`LoginPage.test.tsx`、ガードの
  テスト、`/` リダイレクトのテスト）。`apps/web/src/components/layout/NavMenu.test.tsx` に名前の
  assertion を追加。`apps/web/src/lib/auth.test.tsx` の `Probe` は `renderSignInButton` 前提なので
  `<GoogleSignInButton />` を対象に書き換え。`apps/web/src/test/renderWithProviders.tsx` の
  `renderSignInButton` オプションを削除。
- `docs/discussions/0006-unauthenticated-route-guard/discovery.md`: 0015 へのポインタ追記。

## 検討したが採用しなかった案

- **`key={state.status}`（0009 A案）**: 動くが対症療法。命令的注入 × 位置ベースの使い回しという
  脆い構造が残り、認証 UI を触るたびにこの手を思い出す必要がある。
- **effect クリーンアップで Google 注入分だけ削除（0009 B案）**: 今回検証して破綻。クリーンアップ
  時点で React が使い回しノードにアバターを描き終えており、`ref.current` も null。`replaceChildren()`
  / `useLayoutEffect` いずれもアバターごと消える。ノードが使い回される限り原理的に無理。
- **`/` を単一の分岐ページのまま、`/groups/*` だけガードする**: 変更は小さく 0004 も触らずに 0006
  を解けるが、`/` の orphan バグはコンポーネント抽出の規律頼みで、構造的には塞がらない。scope (b)
  を選んだ理由に反する。
- **ポータル / detached ノードを ref で保持 / 条件分岐の外に常設して表示だけ切り替える**: ルート
  遷移で unmount する専用コンポーネントと同じ保証を、より多い仕掛けで得るだけ。「常設して hidden」
  は認証済み画面に生きた Google iframe を残す副作用もある。
- **深いリンクの復帰（`location` を退避し、ログイン後に元 URL へ戻す）**: 当面見送り。配線が増える。
  0006 の当初候補も「`/` へリダイレクト」だった。一律 `/groups` 着地で足りる。
- **`loading` 中はガードが全画面スケルトンを1か所で出す**: 各ページに既にローディング UI があり、
  ガードへ集約すると二重管理になる。各ページ自前を採用。既知のトレードオフ: 未認証で `/groups/xyz`
  に来ると、リダイレクト前に一瞬そのページのスケルトンが出て `/api/groups` が1回 401 になる。
  軽微として許容。
- **認証済みホームを残す**: `/` はリダイレクトのみにする方針でユーザーが却下。名前は `NavMenu` へ移す。
- **`<StrictMode>` を外す**（[0017](../0017-duplicate-api-requests-on-load/minutes.md) で言及）:
  この種のバグを炙り出す dev チェックなので外さない。ボタンコンポーネント側を二重マウント安全に
  することで対応する。

## スコープ外

- 0016 のビジュアル刷新そのもの。コードへの反映は 0015 の後。
- `AbortController` 等による fetch の後始末・二重リクエストの解消（[0017](../0017-duplicate-api-requests-on-load/minutes.md)
  で dropped 済み）。
- ログアウト後の遷移先の細かな最適化。`NavMenu` の `handleLogout` は `navigate('/')` のままでも、
  新構造では `/` が未認証を `/login` に送るため動作する。
