# Go バイナリからの SPA 同梱配信と `APP_ORIGIN` の実値化

## ステータス

提案。決定ではない。提案時点での方針をまとめたもの。

`infra/Dockerfile` に web ビルド段を足して `apps/web/dist` を最終イメージへ同梱し、Go サーバーに `/api/*` 以外の静的ファイル配信と SPA フォールバックを持たせる。同時に、SPA を本番オリジンから配信した瞬間に load-bearing になる `APP_ORIGIN` の構築値ズレ（discussion 0025）を実値化して解消する。AR の DELETE クリーンアップポリシーと、同梱イメージをローカルで動かす検証手段は別ラウンドへ送る。

## 背景

- [0001 purpose and initial tech stack](../0001-purpose-and-initial-tech-stack/proposal.md)（decided）: SPA と API を同一 Cloud Run サービスから同一オリジンで配信する目標像は確定済み。実現手順は未着手だった。
- [decision 0012](../../decisions/0012-container-image-build-and-registry.md): イメージ名が最初から `app`（`api` ではない）なのは、SPA を同梱する将来を見込んでのもの。「同梱時は builder に web ステージを足し、最終ステージが `apps/web/dist` をコピーする」と明記済み。
- [decision 0015](../../decisions/0015-cloud-run-service.md) ＋ [discussion 0025](../0025-cloud-run-app-origin/discovery.md)（本提案が置き換える）: `APP_ORIGIN` を `data.google_project` のプロジェクト番号から `https://siorie-<project number>.<region>.run.app` と構築していたが、実際に割り当てられた URL は旧形式 `https://siorie-u6y3wdsaua-an.a.run.app` で一致しない。`GET /api/hello` は `Origin` 検証を通らないため今は無害だが、状態変更リクエスト（`POST /api/auth/google` を含む）を本番 URL から叩いた瞬間に `Origin` 検証が落ちる。SPA を本番オリジンから配信する本提案で、このズレが初めて load-bearing になる。
- [discussion 0026](../0026-infra-per-deploy-inputs/discovery.md)（未解決のまま）: `image_tag` と `google_client_id` はデフォルトなし `-var`。「無関係な変更のときも毎回 2 つ渡す」摩擦を指摘済み。本提案は `app_origin` を 3 本目として追加し、この摩擦を悪化させることを承知の上で進める。
- 現状の `apps/web`: `vite.config.ts` が `/api` を `http://localhost:8080` へ proxy し（[discussion 0008](../0008-local-dev-same-origin/discovery.md)）、ブラウザから見て `pnpm dev` / `vite preview` と Go API が同一オリジンに見える構成。本提案はこのローカル構成を変えない。`BrowserRouter` を使っているため、`/groups/:groupId` のような深いパスへの直接アクセス・リロードには SPA フォールバックが要る。`VITE_GOOGLE_CLIENT_ID` は `vite build` 時にバンドルへ inline される（`apps/web/.env.example`）。

## 前提

- 環境は本番のみ。ローカル開発（`pnpm dev` / `vite preview`）は変更しない。Go の静的配信パスは本番専用。
- AR の DELETE クリーンアップポリシー（`cleanup_policy_dry_run = false`）、同梱イメージをローカルで `docker run` する検証手段、Cloud Monitoring・予算は対象外（後続ラウンド）。
- OAuth Web クライアントは Google Cloud Console での手動運用のまま（0022 で決定済み）。本番オリジン `https://siorie-u6y3wdsaua-an.a.run.app` を「承認済み JavaScript 生成元」へ登録することが preflight として要る。

## `infra/Dockerfile`: web ビルド段の追加

マルチステージに web ビルド段を挟む。既存の builder（`golang:1.27-bookworm`）・最終ステージ（`gcr.io/distroless/static-debian12:nonroot`）の構造は変えない。

- **web ステージ**: Node.js の現行 LTS 系タグ（`mise.toml` の `node = "lts"` に対応する具体的なタグを実装時に確認して固定する。builder 同様タグピンで digest ピンはしない）。
  - `apps/web/package.json` と `apps/web/pnpm-lock.yaml` を先にコピーし、`corepack enable`（`packageManager` フィールドのバージョンをそのまま使う）→ `pnpm install --frozen-lockfile` でこの層をキャッシュ可能にする。
  - `ARG VITE_GOOGLE_CLIENT_ID` を宣言し、ビルド前に `ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID` として `vite build` から見えるようにする。
  - `apps/web/` の残りをコピーし `pnpm build`（`tsc -b && vite build`）を実行、`apps/web/dist` を生成する。
  - `import.meta.env.DEV` が `false` になるため、`vite build` は既存どおり "Dev Login" ボタンを自動的に含めない。
- **最終ステージ**: 既存の `COPY --from=builder /server /server` に加え、`COPY --from=web /web/dist /web` を追加する（web ステージの `WORKDIR` を `/web` にした場合の例。ステージは互いに独立したファイルシステムなので最終イメージのパス `/web` と衝突しない）。distroless/static はシェルを持たないが `COPY` はビルダー側で完結するので影響しない。ファイルは root 所有・ビルド時のパーミッションのまま残るが、`nonroot`（UID 65532）から読み取れれば十分。
- **`.dockerignore` は変更不要**: 既存で `apps/web/node_modules` と `apps/web/dist` を除外したままにする。web ステージは毎回ソースから `pnpm install` → `pnpm build` するため、ローカルの古い `dist` や `node_modules` が context に混じらないのはむしろ都合がよい。

`infra/justfile` の `publish-image` は現在ビルド引数を取らないため、シグネチャを変える。

```
publish-image google_client_id:
    ...
    docker build -f {{infra_dir}}/Dockerfile \
      --build-arg VITE_GOOGLE_CLIENT_ID={{google_client_id}} \
      -t "${ref}" {{repo_root}}
    docker push "${ref}"
```

呼び出しは `just infra/publish-image <oauth-client-id>` になる。

## Go: 静的ファイル配信と SPA フォールバック

- `internal/server.Deps` に `WebRoot string` を追加する。空文字なら本提案のハンドラは一切登録しない（ローカル開発は今までどおり Vite が配信し、Go 側は素の chi 既定 404 のまま）。
- `cmd/server/main.go` は `WEB_ROOT` を `requireEnv` ではなく素の `os.Getenv` で読み、`Deps.WebRoot` に渡す。他の 3 つの必須 env（`GOOGLE_CLIENT_ID` / `APP_ORIGIN` / `FIRESTORE_PROJECT_ID`）とは扱いを分け、`AUTH_DEV_LOGIN` と同じ presence-triggered な任意 env とする。
- `NewRouter` は `deps.WebRoot != ""` のときだけ `router.NotFound(spaHandler(deps.WebRoot))` を登録する（新規ファイル、例: `internal/server/static.go`）。挙動:
  - パスが `/api/` で始まる場合は `http.NotFound` を呼ぶ。既存の（Huma を経由しない）未登録 `/api/*` パスの応答を変えない。
  - `filepath.Join(webRoot, path)` が実在するファイルなら、`/assets/` 配下は `Cache-Control: public, max-age=31536000, immutable` を、それ以外（`index.html` 自体を含む）は `Cache-Control: no-cache` を付けたうえで `http.ServeFile` で配信する（`Content-Type` は Go の組み込み MIME テーブルで `.js` / `.css` / `.html` / `.svg` / `.png` / `.json` / `.wasm` をカバーし、design 上フォントは同梱されないため不足しない）。
  - ファイルが存在せず、パスが `/assets/` 配下なら `http.NotFound` を返す（古いバンドルが参照する消えたハッシュ付きファイルを `index.html` へフォールバックさせない）。
  - ファイルが存在せず、`/assets/` 配下でもなく、メソッドが GET（または HEAD）なら `webRoot/index.html` を `no-cache` で 200 配信する（`BrowserRouter` のディープリンク、`/`・`/login`・`/groups/:groupId` 等）。
  - それ以外（非 GET/HEAD で未マッチ）は `http.NotFound`。
  - `WEB_ROOT` が設定されているのにディレクトリや `index.html` が存在しない場合、起動時のチェックはしない。リクエストのたびに上と同じロジックで 404 になるだけで、起動失敗にはしない。

## `infra/app`: `APP_ORIGIN` の実値化と `WEB_ROOT`

`infra/app/variables.tf` に `app_origin`（デフォルトなし）を追加する。

```hcl
variable "app_origin" {
  description = "The Cloud Run service's real public origin (from `terraform output cloud_run_url`), used as the Go server's APP_ORIGIN. No default; pass -var app_origin=<url> (or TF_VAR_app_origin) at plan/apply time (discussions 0025, 0026)."
  type        = string
}
```

`infra/app/main.tf`:

- プロジェクト番号からの構築専用だった `data "google_project" "this"` ブロックを削除する（他に参照箇所がないことを確認済み）。
- `APP_ORIGIN` env を `value = var.app_origin` に変更する。
- `WEB_ROOT` env を追加する（`-var` ではなく固定リテラル）: `env { name = "WEB_ROOT", value = "/web" }`。

`infra/justfile` のデプロイ手順コメントを 3 `-var` の形に更新する:

```
just infra/publish-image <oauth-client-id>
just infra/apply app \
  -var image_tag=$(git rev-parse --short=12 HEAD) \
  -var google_client_id=<oauth-web-client-id> \
  -var app_origin=<cloud-run-url>
```

`apps/api/.env.example` に `WEB_ROOT=`（空、コメントで「ローカルでは未設定のまま。本番はイメージ内パス」と明記）を足す。

## `APP_ORIGIN` を実値リテラルにすることについて

検討した他の選択肢:

- `infra/app/terraform.tfvars` へのコミット — `google_client_id` を「コミットせず操作者が渡す」とした判断と非対称になるため見送り。
- `infra/app` 内で自サービスを `data "google_cloud_run_v2_service"` として読み戻す — siorie のサービスは既に存在する（0027 の import 経由）ため、ゼロからの再作成時を除けば 2 段階 apply にならず筋は良いが、今回は採らない。
- `APP_ORIGIN` env を廃し、サーバーがリクエストの `Host` + `X-Forwarded-Proto` から許可オリジンを導出する — CSRF 判定の根拠をリクエストヘッダに移すことになるため見送り。

採用は「`infra/app` に `app_origin` をデフォルトなし変数として追加し、操作者が `-var` で渡す」。`image_tag` / `google_client_id` と同じ形に揃え、`infra/app` の毎 plan/apply が 3 `-var` 必須になることを承知の上で進める（discussion 0026 へその摩擦を明示的に引き渡す。シェル変数 `TF_VAR_*` での軽減は今回は運用として明記しない）。

## `VITE_GOOGLE_CLIENT_ID` の二重入力について

`GOOGLE_CLIENT_ID`（サーバーの `aud` 検証対象）と `VITE_GOOGLE_CLIENT_ID`（SPA バンドルに inline される GIS 初期化用の値）は、同じ OAuth Web クライアント ID を指すが、本提案後は独立した 2 箇所（`docker build --build-arg` と `terraform apply -var`）で操作者が渡す。値がズレると、SPA が発行する ID Token の `aud` とサーバーが期待する `aud` が食い違い、サインインが `401` で静かに失敗する。自動整合チェックは入れない。

## 今回の作業と導通確認

作業:

1. `infra/Dockerfile` に web ビルド段を追加し、最終ステージへ `apps/web/dist` をコピー。
2. `internal/server` に `Deps.WebRoot` と静的配信＋SPA フォールバックハンドラを追加。`cmd/server` が `WEB_ROOT` を読む。
3. `apps/api/.env.example` に `WEB_ROOT=` を追記。
4. `infra/app/variables.tf` に `app_origin` を追加、`main.tf` の `APP_ORIGIN` env と `data.google_project` を差し替え、`WEB_ROOT` env を追加。
5. `infra/justfile` の `publish-image` に `google_client_id` 引数を追加し `--build-arg` を渡す。デプロイ手順コメントを 3 `-var` に更新。
6. `just infra/publish-image <client-id>` → `just infra/apply app -var image_tag=<sha> -var google_client_id=<id> -var app_origin=<url>`。

preflight:

- OAuth Web クライアントの「承認済み JavaScript 生成元」に `https://siorie-u6y3wdsaua-an.a.run.app` が登録済みであること（未登録なら Console で手動追加）。
- `terraform output cloud_run_url`（`infra/app`）で `app_origin` に渡す値を確認する。

導通確認（このラウンドの完了条件）:

- `infra/app` の再 `plan` が「No changes」。
- ブラウザで `https://siorie-u6y3wdsaua-an.a.run.app/` を開くと `index.html` が返り SPA が起動し、未認証なら `/login` へ遷移する。
- 実際に Google サインインが完了し `/groups` へ遷移する（dev-login ではなく本物の Google フロー — `vite build` は Dev Login ボタンを含まない）。
- グループの作成が成功する（`POST /api/groups` の `Origin` 検証が `app_origin` と一致して通る）。
- `/groups/<id>` のような深いパスへの直接アクセス・リロードが `index.html`（200）を返す。
- 存在しない `/assets/*` パスが 404 を返す。
- `curl -I` で `index.html` が `no-cache` 系、ハッシュ付きアセットが `immutable` 系の `Cache-Control` を持つことを確認する。

## この提案が可能にすること（次のトピックへの入力）

- discussion 0026（`-var` 3 本の摩擦）の解消、または CI/CD 到来までの許容判断。
- AR の DELETE クリーンアップポリシー（全件マッチ）と `cleanup_policy_dry_run = false` への切り替え — 実デプロイが定常化するため優先度が上がる。
- 同梱イメージをローカルで `docker run` して SPA・フォールバック・`/api/hello` を push 前に確認する `just` recipe。
- Cloud Monitoring・予算アラート（0001、未着手のまま）。

## 未解決・リスク

- **`-var` が 3 本になる**: `image_tag` / `google_client_id` / `app_origin`。無関係な変更のときも 3 つとも必須。
- **`google_client_id` の二重入力**: image build と `infra/app` apply の 2 箇所で独立に渡す。ズレると自動検出されない静かな認証失敗になる。
- **`WEB_ROOT` の起動時チェックなし**: ビルドミスでファイルが同梱されていない場合、気づくのはリクエスト時の 404 経由のみ。
- **`APP_ORIGIN` の根本問題は残る**: 実値リテラルは対症であり、「サービスが自分の公開オリジンを知る手段が無い」という 0025 の違和感自体は解消しない。将来 Cloud Run サービスを作り直す（`deletion_protection = false` のため起こり得る）と `.uri` が変わり、`app_origin` を手で更新し直す必要がある。
- **同梱後の Go 静的配信パスをローカルで直接検証する手段がない**: 本ラウンドでは `docker run` recipe を作らないため、初回の確認は本番 apply が最初になる。
- **AR の DELETE クリーンアップポリシー未整備のまま実デプロイが定常化**: イメージが無制限に蓄積し始める。
- **Node ビルドステージのタグピン**: golang ステージ同様タグピンに留め、digest ピンはしない。

## 参考資料

- [0023 Container image build-and-push](0023-container-image-build-and-push/proposal.md) — SPA 同梱を「別 discovery」として先送りした箇所
- [0024 Cloud Run service](0024-cloud-run-service/proposal.md) — 同上、および `APP_ORIGIN` 構築式の初出
- [0025 Cloud Run app origin](../0025-cloud-run-app-origin/discovery.md) — 本提案が置き換える discovery
- [0026 Infra per-deploy inputs](../0026-infra-per-deploy-inputs/discovery.md) — `-var` 摩擦、本提案が悪化させる側
- [0008 Local dev same origin](../0008-local-dev-same-origin/discovery.md) — ローカルの Vite proxy 運用（本提案では不変）
- [decision 0012](../../decisions/0012-container-image-build-and-registry.md) / [decision 0014](../../decisions/0014-infra-deploy-layers-and-firestore.md) / [decision 0015](../../decisions/0015-cloud-run-service.md)
