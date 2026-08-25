# 議事録

discovery.md の指示は短く、エージェントが構成全体を組み立てて proposal.md にまとめた。
往復のやりとりは discovery.md の指示のみで、個別の質問応答としては記録が残っていない。

## 検討したが採用しなかった案

### pnpm workspace の導入

Web パッケージが `apps/web` の 1 つしかない現時点では、pnpm workspace を導入しても
共有依存関係や複数パッケージのタスク実行といった利点が得られないため見送った。
理由は proposal.md の「pnpm workspace の扱い」に残し、将来パッケージが増えた際の
移行手順（`pnpm-workspace.yaml` の追加、lockfile のルート移動、ルート `justfile` の filter 化）も
そこにあらかじめ記載した。

### 共有パッケージディレクトリの先行作成

`apps/api` と `apps/web` の間で共有するコードは、現時点では存在しないため、
`packages/` のような共有パッケージ用ディレクトリは作らないことにした。
小規模アプリに必要な境界だけを設け、必要になってから追加する方針とした。

## この議論で確定したこと

- 実行可能なアプリケーションは `apps/` 配下に置き、Go API と React SPA を独立したモジュールとする。
- リポジトリ全体の入口はルートの `justfile` に統一し、Go 固有のタスクは `apps/api/justfile` に委譲する。
- フロントエンドの依存関係とタスクは pnpm と `apps/web/package.json` で管理する。
- 生成物とキャッシュは `.gitignore` で除外し、ソースディレクトリと分離する。

以上を proposal.md に反映した。
