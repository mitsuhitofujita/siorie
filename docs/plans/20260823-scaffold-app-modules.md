# Go API と React SPA の scaffold を作成する

## ステータス

未実施。

## 目的

`topics/02-ディレクトリの設計/draft.md` で定めたモノレポ構成に従い、Go API と React SPA の最小限の scaffold を作成する。リポジトリルートからセットアップ、開発、テスト、静的検査、ビルドを実行できる状態にする。

## 前提

- `mise.toml` で管理する Go、Node.js、pnpm、just が利用できる。
- 依存関係の追加時は実施時点の最新安定版を確認し、ロックファイルで固定する。
- 本計画では Firestore、Google 認証、業務 API、Tailwind CSS、shadcn/ui、Docker、Cloud Build は導入しない。これらは個別の設計と検証を伴う後続作業とする。

## 完了条件

- `apps/api` が独立した Go module として存在する。
- Go API を起動すると、正常系の HTTP リクエストが Hello World 相当の JSON レスポンスを返す。
- Go ハンドラーの挙動を検証する自動テストがある。
- `apps/web` が pnpm で管理される Vite + TypeScript + React アプリケーションとして存在する。
- React SPA を起動すると Hello World 相当の画面を表示する。
- React コンポーネントの表示を検証する自動テストがある。
- `just setup`、`just build`、`just test`、`just lint`、`just format`、`just check` がリポジトリルートで実行できる。
- `just check` が成功し、実行後の `git status --short` に予期しない生成物が表示されない。

## 実装手順

### 1. Go API module を作成する

1. `apps/api` で Go module を初期化する。module path はリポジトリの公開 URL と整合する値を使う。
2. `chi` と Huma の chi adapter を実施時点の最新安定版で追加し、`go.mod` と `go.sum` を生成する。
3. `internal/server` にルーターを構築する関数と Hello World 相当のハンドラーを作成する。パスは API の境界を示す `/api/hello` とし、レスポンスは Huma が OpenAPI に反映できる型付き JSON とする。
4. `cmd/server/main.go` で HTTP サーバーを起動する。ポートは Cloud Run とローカル実行の両方を考慮して `PORT` 環境変数から読み、未設定時はローカル用の値を使う。
5. `httptest` でステータスコード、Content-Type、JSON レスポンスを検証する。

### 2. Go 用 just recipe を作成する

1. `apps/api/justfile` に `setup`、`dev`、`build`、`test`、`lint`、`format`、`format-check`、`check` を定義する。
2. `build` の出力先を `apps/api/bin/server` に統一する。
3. `test` は `go test ./...`、`lint` は `go vet ./...`、`format` は Go ソースに対する `gofmt` を実行する。`format-check` は `gofmt` の未適用ファイルがあれば失敗する。
4. recipe が呼び出し元の作業ディレクトリに依存しないことを確認する。

### 3. React SPA module を作成する

1. `apps/web` に Vite の React + TypeScript scaffold を作成する。生成コマンドの出力はそのまま採用せず、本計画に必要なファイルだけを残す。
2. `package.json` の `packageManager` に使用した pnpm の正確なバージョンを記録し、`pnpm-lock.yaml` を生成する。
3. Hello World 相当の最小限の `App` コンポーネントと CSS に整理する。Vite のデモ用カウンター、ロゴ、アセットは削除する。
4. Vitest、Testing Library、jsdom を追加し、Hello World の見出しが表示されることを検証する。
5. ESLint と Prettier を設定し、`dev`、`build`、`test`、`lint`、`format`、`format:check` の scripts を `package.json` に揃える。

### 4. ルートのタスクと除外設定を作成する

1. ルートの `justfile` に `setup`、`dev-api`、`dev-web`、`build`、`test`、`lint`、`format`、`check` を定義する。
2. Go の recipe は `apps/api/justfile` へ委譲し、Web の recipe は `pnpm --dir apps/web` を介して `package.json` の scripts を呼び出す。
3. `check` はフォーマット差分の検査、静的検査、テスト、ビルドを実行し、一つでも失敗したら非 0 で終了する。`format` はファイルを書き換えるタスクとし、`check` からは呼び出さない。
4. `.gitignore` に `apps/api/bin/`、`apps/web/dist/`、`apps/web/node_modules/` と、採用したテストツールの生成物を追加する。
5. `README.md` に必要なツール、`mise install`、`just setup`、API と Web の開発サーバー起動方法、`just check` を記載する。

### 5. 検証する

1. リポジトリルートで `just setup` を実行する。
2. `just format` を実行し、書式を統一する。
3. `just check` を実行し、API と Web のフォーマット検査、静的検査、テスト、ビルドがすべて成功することを確認する。
4. `just dev-api` を起動し、`/api/hello` のステータスコード、Content-Type、JSON 応答を HTTP クライアントで確認する。
5. `just dev-web` を起動し、ブラウザーで Hello World 画面とコンソールエラーがないことを確認する。
6. `git status --short` を確認し、ビルド生成物、依存関係ディレクトリ、キャッシュが管理対象に含まれていないことを確認する。

## 変更対象

### 新規作成

- `apps/api/cmd/server/main.go`
- `apps/api/internal/server/server.go`
- `apps/api/internal/server/server_test.go`
- `apps/api/go.mod`
- `apps/api/go.sum`
- `apps/api/justfile`
- `apps/web/` 配下の Vite、React、TypeScript、テスト、lint、format 設定
- `apps/web/pnpm-lock.yaml`
- `justfile`

### 更新

- `.gitignore`
- `README.md`

## 本計画の対象外

- Firestore と接続するコード
- Google Identity Services とセッション
- グループとアイテムの API
- React Router、状態管理、フォーム管理
- Tailwind CSS と shadcn/ui
- OpenAPI からの TypeScript コード生成
- React SPA と Go API の統合配信
- Docker、Cloud Build、Cloud Run
- Terraform

## 実施時に記録すること

完了後に本ドキュメントのステータスを「完了」に更新し、次を追記する。

- 実施日
- 実際に固定した Go、Node.js、pnpm、React、Vite、chi、Huma のバージョン
- 計画と異なる実装にした箇所とその理由
- 実行した検証コマンドと結果
