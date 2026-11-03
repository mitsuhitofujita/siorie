# 実装プロンプト作成リファレンス

`docs/prompts/` に実装プロンプトを書くとき、毎回最初に読むメモ。
プロンプトが増えたら、その共通項や古くなった記述をこちらに反映する。
実装プロンプトは「文脈ゼロの実装エージェントが単体で実行できる」ように書く。
`/think` が書き、`/build` が読む。

- 保存先: `docs/prompts/<ケバブケース名>.md`（例: `group-delete-dialog.md`、`item-volume-increment.md`）。
- `docs/prompts/` は git 管理対象。`.env` の値や Google OAuth クライアント ID など、環境ごとの実値は書かない
- プロンプトは日本語で書く。実装エージェントも AGENTS.md により日本語で応答する
- パス・識別子・コマンドはそのまま（英語）で書く

## 0. 書く前の手順

1. 関係する `docs/spec/*.md` と `docs/log.md` の末尾数節を読む（`/build` と同じ流儀。文書の規約は `docs/README.md` が正）。`docs/intent/` の該当記述は背景として読む。未整理であり、確定仕様や実装指示ではない
2. `rg` とファイル読みで実コードを確認する。docs が古い場合はコードを正とし、「現状」には確認済みの事実だけを書く
3. ライブラリ API の細部は、依存済みバージョンの実挙動で裏取りする。Go は `apps/api/go.mod` / `go.sum`、Web は `apps/web/package.json` / `pnpm-lock.yaml` を見る。検索で引く記事は古いメジャーの API のままであることが多い（例: Huma v2 の `huma.Register` と `huma.Operation`、React Router 7 のルート定義）。プロンプトにも「実装前に既存コードと依存バージョンで確認すること」を注記する
4. やること / やらないこと（スコープ外）を決める。スコープ外に書かないことは実装される。スコープが曖昧なときは、プロンプトを書く前にユーザーへ1問だけ確認する
5. 下記テンプレートで書く。受け入れ条件は「コマンド + 期待結果」で具体的に、テスト件数は実数を書く

関係が強い複数タスクは1本にまとめてよい。関係が弱ければ分ける。

## 1. 構成テンプレート

```markdown
# タスク: <一行で目的がわかる題>

あなたは siorie リポジトリ（Go API + React SPA のモノレポ）で作業する実装エージェントです。以下を実装してください。

- リポジトリ: <下記「リポジトリ行」の定型をコピー>
- 実行方針: <下記「実行方針行」の定型をコピー>
- 最初に読むべきドキュメント: <関係する spec を列挙>, docs/log.md

## タスク1: <内容>（タスクが1つなら番号は不要）

現状（実コードで確認済み）:
- 確認済みの事実をファイルパス付きで列挙する。

やること:
1. 番号付きで手順を書く。ファイルパス・型名・関数名・ルートを明記する。
2. コード例を載せる場合は「詳細は既存スタイルに合わせて調整してよい」と添える。

今回のスコープ外（実装しない）:
- やらないことを明示する。

## タスク2: <内容>（必要な場合のみ）

（タスク1と同じ構成で）

## テスト
## ドキュメント更新（実装と同じ変更に含める）
## 受け入れ条件
## 制約
```

### セクションごとの掟

- **設計**: ユーザーと合意済みの設計（API の契約、Firestore のドキュメント構造など）は、先頭に「設計（この形で実装する。コードの細部は既存スタイルに合わせて調整してよい）」節を置いて、合意内容のまま固定する
- **現状**: 実コードで確認した事実のみ（見出しは「現状（実コードで確認済み）」の形にする）。推測を書かない。前提・既知ギャップもここに書く
- **やること**: 観測可能な挙動（HTTP メソッドとパス、ステータスコード、レスポンス JSON の形、画面の表示条件）を固定し、実装の自由度は残す。既存挙動を変える場合は「観測可能な挙動を変えない」と明記する
- **スコープ外**: 必ず書く。境界の例:「`apps/api/go.mod` / `apps/web/package.json` の依存を変更しない」「Firestore のセキュリティルールや複合インデックスを追加しない」「Terraform・Cloud Run・デプロイ workflow を変更しない」「認証方式（Google ID Token + `__Host-session`）を変えない」
- **テスト**: 現状の件数と、期待（増やす / 増減させない）を書く。手動確認に回す項目は「手動確認とする」と明記する
- **ドキュメント更新**: 更新する spec と `docs/log.md`、触らない spec を列挙する。log の日付は「作業した当日」と書く
- **受け入れ条件**: `just check`（format-check + lint + test + build + `terraform fmt -check`）、必要な手動チェック（`just dev` + ブラウザ、`curl`）、回帰なしまで書く。認証・Cookie・Origin を触るタスクは、Dev Login と本番相当の `just dev-static` での確認も入れる
- **制約**: 下記定型文をコピーし、タスク固有の禁止事項を足す
- **完了報告**: 大きめのタスクでは末尾に「日本語で、変更点・検証結果・残った問題を簡潔にまとめる」節を置く

## 2. 冒頭の定型（コピペ用）

### リポジトリ行

```markdown
- リポジトリ: Go 1.27（chi + Huma v2）の API（`apps/api`）と、Vite + TypeScript + React 19 の SPA（`apps/web`、pnpm）からなるモノレポ。
  `apps/api` と `apps/web` は独立したモジュールで、共有パッケージは無い。永続化は Firestore、認証は Google ID Token + サーバー側セッション（`__Host-session` クッキー）。
  本番は Cloud Run の単一サービスで、Go バイナリが `/api/*` とビルド済み SPA（`WEB_ROOT=/web`）の両方を配信する
```

### 実行方針行

```markdown
- 実行方針: ルートの `justfile` が入口。`just setup` で Go / Web の依存を導入し、`just dev` で Firestore エミュレータ（8090）・API（8080）・Vite（5173）を1ターミナルで起動する。
  `just test` は API 側の使い捨てエミュレータ（8091）を自動で起動する。`just check` が format-check / lint / test / build（+ `terraform fmt -check`）を通す基本の検証。
  ローカル設定は `apps/api/.env` と `apps/web/.env`（`.env.example` 参照）に置き、git 管理しない。`apps/api/.env` の `APP_ORIGIN` は Vite の `http://localhost:5173` を指す
```

### 最初に読むべきドキュメント

関係するものだけに絞る。よく使う組み合わせ:

- 全体像・データモデル・ツール: `docs/spec/overview.md, docs/log.md`
- API・エンドポイント・Firestore: `docs/spec/api.md, docs/log.md`
- Web の画面・コンポーネント・スタイル: `docs/spec/web.md, docs/log.md`
- 認証・セッション・CSRF: `docs/spec/authentication.md, docs/log.md`
- インフラ・デプロイ: `docs/spec/infrastructure.md, docs/log.md`
- 新しい機能領域（該当 spec がまだ無い）: `docs/intent/` を背景として読み、spec は実装後に新規作成または更新する前提で書く

既存プロンプトをコピー元にするときは、冒頭定型と「現状」がこの README のスナップショット（§3）と矛盾していないか確認する。

## 3. 現状スナップショット（2026-11-03 時点・書く前に実コードで裏取りする）

### 構成・コマンド

- リポジトリは `apps/api`（Go）と `apps/web`（React）のモノレポ。共有パッケージは無く、ビルド・依存・テストはアプリごとに独立している
- `mise.toml` は gcloud / Go / Node (LTS) / pnpm / just / Terraform を固定し、Firestore エミュレータ用に Java (temurin-25) も入れる。クローン後 `mise install`
- ルート `justfile`: `setup`, `dev`, `dev-static`, `build-web`, `dev-api`, `dev-web`, `dev-firestore`, `preview-web`, `build`, `test`, `lint`, `format`, `check`。Go のレシピは `apps/api/justfile`、Web は `package.json` スクリプトを呼ぶ
- 開発: `just dev`（エミュレータ + API + Vite、ログは `[firestore]` / `[api]` / `[web]`）。Vite は 5173、API は 8080、エミュレータは 8090
- 本番相当: `just dev-static`（SPA をビルドして API から 8080 で配信。Vite なし）
- 検証: `just check` が format-check / lint / test / build（API + Web）と `terraform fmt -check` を実行する。`just format` はファイルを書き換える
- 秘密情報・環境依存: `apps/api/.env`（`PORT`, `GOOGLE_CLIENT_ID`, `APP_ORIGIN`, `FIRESTORE_PROJECT_ID`, `WEB_ROOT`, `AUTH_DEV_LOGIN`）と `apps/web/.env`（`VITE_GOOGLE_CLIENT_ID`）。どちらも git 管理外で、`.env.example` が雛形
- CI は push / PR では走らない。デプロイは `.github/workflows/deploy.yml` の `workflow_dispatch` のみ（`just check` を通してから Cloud Run へ）

### API（apps/api）

- エントリ: `cmd/server/main.go`。必須環境変数は `GOOGLE_CLIENT_ID` / `APP_ORIGIN` / `FIRESTORE_PROJECT_ID`、任意は `PORT` / `WEB_ROOT` / `AUTH_DEV_LOGIN`
- ルータ: `internal/server/server.go` の `NewRouter(Deps)`。chi + Huma v2。`GET /api/hello`、`POST /api/auth/google`、`POST /api/auth/logout`、`GET /api/me`、`POST /api/auth/dev-login`（`AUTH_DEV_LOGIN=1` のときだけ）、groups / items の CRUD
- 認証: `__Host-session` クッキーを `authenticateSession` で解決し、ユーザー ID はリクエストパラメータから取らない。未認証は 401
- CSRF: 状態変更ルートは `validateOrigin` で `Origin` が `APP_ORIGIN` と完全一致することを確認。不一致は 403
- items は必ず `requireGroup` で親 group の存在と所有を確認してから触る（Firestore のサブコレクションは親が無くても存在できるため）。存在しない・他人の group は 404
- バリデーション: group の `name` と item の `title` は 1–100 文字、`completedVolume` は 0 以上の整数（Huma のタグで 422）
- 削除は冪等（group / item とも 204。item は group が存在する限り、対象が無くても 204）。group 削除は items を先に消す
- 永続化: `internal/store` の `FirestoreStore`（本番・エミュレータ）と `MemoryStore`（ハンドラテスト用）。セッションは `sessions/{sha256(rawSessionId)}` にだけ保存し、生 ID はクッキーにしか無い
- SPA 配信: `internal/server/static.go` の `spaHandler`。`/api/*` は 404、`/assets/*` の不在も 404、それ以外の GET/HEAD は `index.html` にフォールバック
- 認証検証: `internal/googleauth` の `Verifier` インターフェース。`GoogleVerifier` は署名・`aud`・`exp`・`iss` を確認し、`FakeVerifier` はテストと Dev Login 用

### Web（apps/web）

- Vite + TypeScript + React 19、pnpm。`src/App.tsx` が唯一のルート表（`/`, `/login`, `/groups`, `/groups/new`, `/groups/:groupId`, `/groups/:groupId/edit`, `/groups/:groupId/items/new`, `/groups/:groupId/items/:itemId`, `/groups/:groupId/items/:itemId/edit`）。create と edit は別ページ
- 認証: `lib/auth.tsx` の `AuthProvider`。`AuthState` は `loading | unauthenticated | authenticated`。GIS の ID Token を `POST /api/auth/google` に送り、`GET /api/me` で状態を更新する。`RequireAuth` / `RequireGuest` は UX のガードで、API 側の認証が本体
- データ取得: `lib/use-fetch.ts` の `useFetch` が `{ status, data, refetch }` を返す。ローディング中は **何も描画しない**（スケルトンは無い）。`lib/use-submit.ts` の `useSubmit` が送信中・エラー・`{ ok, value }` を扱う
- コンポーネント: `src/components` の手書きコンポーネント + Radix の Dialog / Label / Avatar。`Button`, `TextField`, `Dialog`, `Sheet`, `DeleteConfirmDialog`, `EmptyState`, `ErrorState`, `Avatar`, `layout/AppLayout`, `layout/NavMenu`
- スタイル: `src/index.css` に Tailwind v4 + 独自デザイントークン（moss パレット、φ 基準の文字サイズ、Fibonacci px の間隔）。モバイル専用・ライト専用。UI コピーは英語
- テスト: Vitest + Testing Library（jsdom）。`src/test/renderWithProviders.tsx` が `MemoryRouter` と `AuthContext` を注入する。`fetch` は `vi.stubGlobal` で差し替える

### テスト

- `just test` が API と Web の全テストを実行する。API 側は使い捨ての Firestore エミュレータ（8091）を自動起動する
- API のハンドラテスト（`internal/server/*_test.go`）は `MemoryStore` + `FakeVerifier` でエミュレータ不要。`internal/store/firestore_test.go` は実エミュレータに対する統合テスト
- ハンドラだけを速く回すなら `cd apps/api && go test ./internal/server`。Go のテストキャッシュを避けるなら `-count=1`
- Web は `pnpm --dir apps/web test`（Vitest run）。単一ファイルは `pnpm --dir apps/web exec vitest run <path>`
- プロンプトには「既存N件 + 追加分」か「N件のまま、件数を増減させない」を明記する。件数はこの README に転記せず、プロンプト作成時に `just test` / `go test -v` / Vitest の出力で確認する

### 機能の現状

- Google サインイン、ログアウト、`GET /api/me`、グループの一覧・作成・取得・改名・削除、アイテムの一覧・作成・取得・更新・削除、アイテムの完了巻数の +1（`ItemDetailPage` の「Add a volume」）
- すべてのグループ・アイテムはサインインユーザーにスコープされる。共有・共同編集は無い
- 開発専用の Dev Login（`AUTH_DEV_LOGIN=1` + Vite dev のボタン）がある

### 既知のギャップ（「スコープ外」候補）

- ページネーション、検索、並び替えは無い（一覧は `createdAt` 昇順）
- ローディング UI は無い（読み込み中は空白。意図的な現状）
- アイテムの巻数は +1 のみ。減算・直接編集は編集フォームの `completedVolume` で行う
- グループ・アイテムの共有、複数ユーザーでの利用は未実装
- Firestore のセキュリティルール・複合インデックスは無い（アクセスは Go バックエンドの ADC のみ）
- push / PR の CI は無い。デプロイは手動 `workflow_dispatch` のみ
- UI はモバイル専用・ライト専用。多言語化は無い
- オフライン対応、通知、エクスポートは未実装

## 4. テスト・検証の書き方

- 受け入れ条件の基本は `just check` が通ること。API と Web の両方の format-check / lint / test / build、および `terraform fmt -check` を含む
- API のテストは `just apps/api/test`（エミュレータを自動起動）または `just test`。ハンドラテストは `MemoryStore` で速く、Firestore 統合テストはエミュレータ必須
- Web のテストは `pnpm --dir apps/web test`。`jsdom` + Testing Library。`fetch` は `vi.stubGlobal` で差し替える
- 手動確認の型: `just dev` を別ターミナルで起動し、http://localhost:5173 を開く。API 単体なら `curl http://localhost:8080/api/hello` → 200 と `{"message":"Hello, World!", "$schema": ...}`。認証が絡む画面は Dev Login（`AUTH_DEV_LOGIN=1`）で確認できる
- 本番相当の配信確認は `just dev-static` → http://localhost:8080。SPA のフォールバックと `/api/*` の 404 もここで確認する
- テスト追加を含む場合は「1項目 = テストメソッド / `it` 1件、合計N件」と数え方まで書く。「件数を増減させない」と「追加分を含めて全パス」を明確に区別する
- Go はテスト結果をキャッシュする。実行を強制したいときは `go test -count=1 ./...`。`just test` は毎回エミュレータを起動する

## 5. ドキュメント更新の書き方

`docs/README.md` の規約: `intent/` は日本語・未整理（依頼がない限り触らない。推測を混ぜない）、`spec/` は英語・現況のみを上書き、`log.md` は英語・追記のみ（1作業につき1見出し、日付は当日）。

更新先の対応表:

| 変更内容 | 更新する spec |
| --- | --- |
| API のエンドポイント・ハンドラ・Firestore アクセス | `api.md` |
| Web の画面・ルート・コンポーネント・スタイル | `web.md` |
| サインイン・セッション・Cookie・CSRF・Dev Login | `authentication.md` |
| Terraform・Cloud Run・デプロイ・イメージ | `infrastructure.md` |
| リポジトリ構成・データモデル・ツール・開発コマンド | `overview.md` |
| 全作業 | `docs/log.md` 末尾に1見出し追記（英語） |

- 挙動を変えない変更（テストのみ・リファクタ）は spec を更新しない（churn を避ける。`/build` の規約どおり）
- 定型句:
  - `docs/spec/ は英語で上書き更新する（既存規約）。`
  - `docs/log.md: 末尾に作業メモを追記（既存エントリと同じ言語・書式。日付は作業した当日）。`
  - 触らない spec を明示する（例: `docs/spec/infrastructure.md: 変更なし（触らない）`）
  - docs とコードの矛盾に気づいても実装を止めない: その場で直せるなら直し、無理なら log に1行だけ書いて先に進む旨を必要に応じて添える

## 6. 制約の定型（コピペ用）

```markdown
## 制約

- 新規依存パッケージを追加しない（`apps/api/go.mod` と `apps/web/package.json` の dependencies を変更しない。既存の依存のみで実装）。
- タスクと無関係なリファクタリング・整形・ファイル移動をしない。
- 既存のコードスタイルに合わせる（Go は `gofmt`、Web は ESLint / Prettier。既存ファイルの命名・import・コンポーネント構成に従う）。
- UI コピーは英語、`docs/spec/` と `docs/log.md` は英語（`docs/README.md` の規約）。
- <タスク固有: 例「認証方式と `__Host-session` クッキーの仕様は変更しない」「Terraform とデプロイ設定は変更しない」>
```

## 7. 参考: コミット規約（エージェントにコミットさせる場合のみ）

`.agents/skills/commit/SKILL.md` を読ませるのが確実。Conventional Commits、英語、description は小文字始まり・ピリオドなし・命令形、body は why（72字折返し）。scope の実例（git log より）: `feat(api)`, `feat(web)`, `feat(infra)`, `chore(claude)`, `chore(infra)`。無関係な変更は分割し、`git add` はファイル指定で行う。直近の慣例はコード commit と docs commit を分ける（例: `feat(api): add group rename endpoint` → `docs: record the group rename endpoint`）。log と spec を1つの `docs:` にまとめる実例もあるので、`git show --stat` でファイル構成を確認してから判別する。
