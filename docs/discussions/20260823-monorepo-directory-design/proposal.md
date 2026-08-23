# ディレクトリ設計

## ステータス

確定。Go API と React SPA を独立したアプリケーションモジュールとし、リポジトリルートの `justfile` から共通タスクを実行するモノレポ構成とする。

## 設計方針

- 実行可能なアプリケーションは `apps/` 配下に置く。
- Go API と React SPA はビルド、依存関係、テストを独立させる。
- リポジトリ全体の入口はルートの `justfile` に統一する。
- Go 固有のタスクは `apps/api/justfile` に定義し、ルートから呼び出す。
- フロントエンドの依存関係とタスクは pnpm と `apps/web/package.json` で管理する。
- 生成物やキャッシュはソースディレクトリと分け、Git の管理対象にしない。
- 小規模アプリに必要な境界だけを設け、共有パッケージなどは必要になるまで作らない。

## ディレクトリ構成

```text
.
├── apps/
│   ├── api/
│   │   ├── cmd/
│   │   │   └── server/
│   │   │       └── main.go
│   │   ├── internal/
│   │   │   └── server/
│   │   │       ├── server.go
│   │   │       └── server_test.go
│   │   ├── go.mod
│   │   ├── go.sum
│   │   └── justfile
│   └── web/
│       ├── src/
│       │   ├── App.tsx
│       │   ├── App.test.tsx
│       │   ├── index.css
│       │   ├── main.tsx
│       │   └── test/
│       │       └── setup.ts
│       ├── .prettierrc.json
│       ├── eslint.config.js
│       ├── index.html
│       ├── package.json
│       ├── pnpm-lock.yaml
│       ├── tsconfig.app.json
│       ├── tsconfig.json
│       ├── tsconfig.node.json
│       └── vite.config.ts
├── docs/
│   ├── discussions/
│   ├── worklogs/
│   ├── decisions/
│   └── design/
├── .gitignore
├── justfile
├── LICENSE
├── mise.toml
└── README.md
```

この木構造は初期 scaffold 完了時点の形を示す。機能実装に伴って追加する Go パッケージや React コンポーネントまで事前に細分化しない。

## モジュールの責務

### `apps/api`

Cloud Run で実行する Go アプリケーションを配置する。1 つの Go module とし、依存関係はこのディレクトリ内の `go.mod` と `go.sum` で固定する。

- `cmd/server/main.go` は設定の読み込み、HTTP サーバーの起動、シャットダウンだけを担う。
- `internal/server` はルーターと HTTP ハンドラーの組み立てを担う。初期 scaffold では Hello World 相当のエンドポイントとそのテストを置く。
- 後続実装では、ドメインや技術の名前に基づくパッケージを `internal/` 配下に必要な分だけ追加する。
- フロントエンドの配信方法と配信用生成物の置き場所は、コンテナー設計で決定する。`apps/web/dist` を Go module へ手作業でコピーしない。

### `apps/web`

Vite、TypeScript、React で構築する SPA を配置する。パッケージマネージャーは pnpm だけを使用する。

- `package.json` に `dev`、`build`、`test`、`lint`、`format` などのフロントエンド固有タスクを定義する。
- `pnpm-lock.yaml` は `apps/web` に置き、コミットする。
- ビルド生成物の `apps/web/dist` と依存関係の `apps/web/node_modules` はコミットしない。
- UI の構造が定まる前の scaffold では、コンポーネントディレクトリを先回りして作らない。

### `docs`

議論から決定、現況までを `discussions/`・`worklogs/`・`decisions/`・`design/` の四層で管理する。
役割、言語の使い分け、命名規則は `docs/README.md` を正本とする。設計トピックごとの提案は
`docs/discussions/<YYYYMMDD-短い説明>/` に、実装作業は `docs/worklogs/<YYYYMMDD-短い説明>/` に置く。

## タスク管理

### ルートの `justfile`

開発者と CI が使うリポジトリ全体の入口とする。初期 scaffold では次の公開 recipe を揃える。

| Recipe | 責務 |
| --- | --- |
| `setup` | Go と Web の依存関係を取得する |
| `dev-api` | Go API の開発サーバーを起動する |
| `dev-web` | Vite の開発サーバーを起動する |
| `build` | API と Web をそれぞれビルドする |
| `test` | API と Web のテストを実行する |
| `lint` | API と Web の静的検査を実行する |
| `format` | API と Web のフォーマッターを実行する |
| `check` | フォーマット差分、静的検査、テスト、ビルドをまとめて検証する |

`dev-api` と `dev-web` は別ターミナルで実行する。プロセス管理は導入しない。これにより、個別のログと終了操作を単純に保つ。

### `apps/api/justfile`

Go module の作業ディレクトリを意識せず実行できるよう、`setup`、`dev`、`build`、`test`、`lint`、`format`、`format-check`、`check` を定義する。ルート recipe はこれらを呼び出し、Go コマンドの詳細を重複させない。

`lint` は scaffold で追加ツールを要求せず、標準の `go vet ./...` を実行する。`format` は `gofmt` を使用する。サードパーティ製 linter の導入はコーディング規約と CI の設計時に判断する。

## pnpm workspace の扱い

初期構成では pnpm workspace を使用しない。pnpm で管理するパッケージが `apps/web` の 1 つだけであり、workspace を追加しても共有依存関係や複数パッケージのタスク実行による利点がないためである。

将来、共有 UI パッケージ、複数の Web アプリ、Node.js 製ツールのいずれかを追加する場合は、次の変更をまとめて行う。

1. ルートに `pnpm-workspace.yaml` を追加する。
2. `pnpm-lock.yaml` をリポジトリルートへ移動する。
3. ルートの `justfile` が workspace filter を使ってタスクを呼ぶように変更する。

## ツールと依存関係の管理

- Go、Node.js、pnpm、just の開発用バージョンはルートの `mise.toml` で管理する。
- Go 依存関係は `apps/api/go.mod` と `apps/api/go.sum` で固定する。
- Web 依存関係は `apps/web/package.json` と `apps/web/pnpm-lock.yaml` で固定する。`package.json` の `packageManager` フィールドに使用する pnpm のバージョンを記録する。
- CI では Go の module download と pnpm の frozen lockfile インストールを使用し、ロックファイルと異なる解決結果を許可しない。

## ルートに置くもの

リポジトリ全体に関係する次のファイルだけをルートに置く。

- `justfile`
- `mise.toml`
- `.gitignore`
- `README.md`
- `LICENSE`
- 後続トピックで追加する、統合ビルド用の `Dockerfile` と Cloud Build の設定

Terraform の構成と state の扱いはインフラ設計で決定するため、現時点で空の `infra/` は作成しない。

## 生成物

次のパスは `.gitignore` で除外する。

- `apps/api/bin/`
- `apps/web/dist/`
- `apps/web/node_modules/`
- テスト、カバレッジ、フロントエンドツールが将来生成するキャッシュ、レポート類

## 後続トピックで決定する事項

- Go 内部の機能別パッケージ構成
- React のコンポーネント、ルート、状態管理の構成
- OpenAPI 生成物の出力先と、必要な場合の TypeScript クライアント生成物の置き場所
- React SPA を Go が配信する方法と統合コンテナーの構成
- Terraform のディレクトリ構成と state の保存方法
