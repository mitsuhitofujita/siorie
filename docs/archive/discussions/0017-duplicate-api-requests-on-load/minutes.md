# 議事録: `/groups` 読み込み時に `me` / `groups` が2回リクエストされる

discovery: [discovery.md](discovery.md)
関連: [0006-unauthenticated-route-guard](../0006-unauthenticated-route-guard/discovery.md)（`open`、`/api/me` の扱いで隣接）、
[0009-home-with-auth](../0009-home-with-auth/proposal.md)、
[0015](../0015/discovery.md)（いずれも StrictMode の二重実行と `AuthProvider` の命令的 DOM 操作が根にある点で同根）

## ディレクトリのリネーム

`0017` → `0017-duplicate-api-requests-on-load`。frontmatter が無かったので
`date: 2026-08-29` / `tags: [frontend, react, perf]` / `status: open` を補った（本文は変更なし）。

## 過去の議論との関係

「API が2回呼ばれる」を検討して見送った履歴はない。`docs/worklogs/0003-google-auth/README.md`
に「StrictMode で effect が二重実行される前提でコードを書いた」旨の記述がある。

## エージェントが確認・切り分けした結果

### 原因

`apps/web/src/main.tsx` がアプリ全体を `<StrictMode>` で包んでいる。React 19 は
**開発モードのみ**、各 effect を「実行 → クリーンアップ → 再実行」と二度呼ぶ
（クリーンアップ漏れを検出するための意図的な挙動。本番ビルドでは無効）。
`AbortController` を持たない fetch が2箇所あり、それぞれ二度飛ぶ:

- `apps/web/src/lib/auth.tsx` のマウント時 effect（`fetch('/api/me')`）。
- `apps/web/src/pages/groups/GroupsListPage.tsx` → `apps/web/src/lib/use-fetch.ts` の
  `run()` → `fetcher()`（`/api/groups`）。

`auth.tsx` の `mountedRef`、`use-fetch.ts` の `requestId` ref は「古いレスポンスで
state を上書きしない」ためのガードで、**進行中の HTTP リクエストはキャンセルしない**。
そのためネットワークパネルには2本並ぶ。`me` が2回出るのは初回ハードロード時のみ
（`AuthProvider` はルート直下に常駐し、SPA 内遷移では再発火しない）で、discovery の観測
（ホームを経由せず `/groups` を直接開いた／リロードした）と整合する。

### 他フレームワークではどうか（私が受けた質問）

- Svelte 3/4（`onMount`）、Svelte 5（`$effect`）、Vue（`onMounted`）、SolidJS、
  Angular（`ngOnInit`）はいずれも dev でコンポーネントをリマウントしない。fetch は1回。
- SvelteKit の `load` / Next.js App Router の Server Component はフレームワークの
  データ層で取得するので、この「コンポーネントの effect で fetch」問題自体が出にくい。
- React の StrictMode リマウントは、将来の並行機能（`<Activity>` / offscreen、
  Fast Refresh）で「state を保ったままアンマウント→再マウント」する前提のため。

## エージェントが投げた質問

1. **本番ビルドでも再現するか。** → **再現しなかった**（`just preview-web`、後述）。
   `me` / `groups` は各1回。StrictMode 開発時のみの挙動と確定。
2. 今回いちばん解消したいのは何か（本番影響 / 開発時のノイズ / バグの兆候に見えて不安 /
   API の無駄処理）。→ 質問1で「本番影響なし」が確認できたため立ち消え。
   ユーザーは「このまま完了」と判断。
3. データ取得の方向性をどこまで射程に入れるか（`AbortController` の最小対応 /
   TanStack Query 等の導入）。→ 今回はどちらも見送り（下記）。

## 確認のために追加したツール（成果物として残す）

`pnpm preview` が 4173 で立ち上がり、`APP_ORIGIN`（`.env` で 5173 固定）と食い違って
認証が 403 になるため、本番ビルドの動作確認が面倒だった。

- `apps/web/vite.config.ts` に `preview` ブロックを追加（`port: 5173` + `strictPort: true`）。
  `vite preview` は `server.proxy` を継承する（Vite 8.2.2 のソースで確認:
  `proxy: preview?.proxy ?? server.proxy`）ので `/api` プロキシは自動で効く。
  ポートを dev と揃えることで `APP_ORIGIN` / `__Host-session` cookie /
  Origin CSRF チェックが dev と同じ挙動になる。
- 根 `justfile` に `preview-web` レシピを追加（`build` → `vite preview`）。
  `dev-api` / `dev-firestore` はそのまま、`dev-web` だけ止めて使う。

動作確認: `pnpm build` 成功、`vite preview` が 5173 にバインド、`GET /` 200、
`GET /api/me` はプロキシ経由で実 Go API まで到達し 401。

## 検討したが採用しなかった案

### `useFetch` と auth の `me` effect に `AbortController` を足す

React として正しい後始末で、入れて損はない。ただし**入れても devtools には
依然2本並ぶ**（1本目が canceled になるだけ）。本番は元々1本なので変わらない。
「二重に見える」という当初の観測を消す効果はなく、今回の目的（本番影響の有無の確認）
に対しては不要。将来クリーンアップ漏れが実害を生む箇所が出たら個別に入れる。

### モジュールレベルの in-flight 重複排除 / リクエストキャッシュ

URL をキーに進行中の Promise を共有すれば本当に1本にできるが、この規模のアプリには
過剰。自作の `useFetch` / `useSubmit` の路線から大きく外れる。

### `<StrictMode>` を外す

二重実行は消えるが、直近で HomePage のバグ（[0009](../0009-home-with-auth/proposal.md) /
[0015](../0015/discovery.md)）を炙り出した dev チェックを失う。割に合わない。

### TanStack Query 等のデータ取得ライブラリを導入する

重複排除・キャッシュ・リトライを一括で解決でき、items CRUD が増える中で将来の
選択肢ではある。ただしこの discovery（本番影響の確認）からは飛躍が大きく、全ページの
リファクタを伴う。別トピックとして扱うべき。

### Go API に静的バンドルを配信させて本番と完全一致させる

現状 `apps/api/cmd/server/main.go` / `internal/server/server.go` は静的ファイルを
配信しない。ここを埋めればプロキシもオリジン合わせも不要になり本番
（single-origin Cloud Run）と一致するが、それ自体が別の作業。ローカルと本番の差が
繰り返し問題になるなら独立した discovery にする。

## 結論

コード変更なし。本番ビルドでは `me` / `groups` とも1回で、二重リクエストは React
StrictMode の開発時挙動だった。`discovery.md` の status は `dropped`（提案・実装なしで完了）。

確認用に入れた `preview-web`（`apps/web/vite.config.ts` の `preview` ブロック +
`justfile` のレシピ）は、ローカルで本番ビルドを確認する手段として残す。

`proposal.md` は作成しない。実装を提案する事項が無く、調査の結論は本議事録に残るため。
