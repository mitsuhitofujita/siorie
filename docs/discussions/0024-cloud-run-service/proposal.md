# Cloud Run サービスと runtime SA の Terraform 定義（超最小の導通確認）

## ステータス

提案。決定ではない。提案時点での方針をまとめたもの。

Artifact Registry に載ったイメージを Cloud Run で動かすところまでを `infra/prod/` に足し、
ワークステーションから apply して「ブラウザ／`curl` で何らかの HTTP 応答が返る」ことを確認する。
Firestore `(default)` データベース、runtime SA へのロール付与、SPA 同梱配信、AR の DELETE
クリーンアップ、予算・監視、CI/CD 自動化はいずれも後続に送る。

## 背景

- [0001 purpose and initial tech stack](../0001-purpose-and-initial-tech-stack/proposal.md)（decided）:
  Cloud Run 単一サービスで SPA+API を同梱・同一オリジン配信、`min 0` / `max 1`、リクエストベース
  課金、専用の runtime SA（Firestore 読み書きの最小権限）、`run.app` URL で公開・インターネット
  到達可・認可はアプリ側、少額の予算アラート、Cloud Monitoring。Secret Manager は初期不使用で
  env は平文、ユーザー管理の SA キーは発行しない。目標像は確定済みで、実現手順は未着手。
- [0003 CI/CD service selection](../0003-cicd-service-selection/proposal.md)（proposed）:
  Cloud Build 採用は撤回、CI/CD サービス選定は保留。方向は GitHub Actions + Workload Identity
  Federation。本提案はこれを解決しない。
- [0011 Terraform IaC layout](../../decisions/0011-terraform-iac-layout.md)（accepted）＋
  [worklog 0011](../../worklogs/0011-terraform-gcp-bootstrap/plan.md):
  `infra/bootstrap/` は apply 済み（API 有効化、`siorie-tfstate` バケット、休眠 `deployer` SA）。
  `infra/prod/` は GCS backend ＋ AR リポジトリ 1 個。decision 本文が
  「Cloud Run、Artifact Registry、Firestore `(default)`、runtime SA と IAM、予算、Cloud
  Monitoring は後続の worklog で」と明記している。
- [0012 Container images](../../decisions/0012-container-image-build-and-registry.md)（accepted）＋
  [worklog 0012](../../worklogs/0012-container-image-build-and-push/plan.md):
  AR リポジトリ `siorie`（`asia-northeast1`）に対し、イメージ参照
  `asia-northeast1-docker.pkg.dev/siorie/siorie/app:<git-sha>`、ワークステーションから
  `docker build` + `docker push`、`:latest` なし。cleanup は KEEP のみ・`cleanup_policy_dry_run
  = true`。DELETE ポリシーと `deployer` SA へのロール付与は「Cloud Run のトピック」へ明示的に
  先送り。イメージが AR に存在することは操作者確認済み。**本提案がその「Cloud Run のトピック」に
  あたる。**
- 現状のアプリ: Go サーバーは `/api/*` のみを扱い静的配信は未実装。`cmd/server/main.go` は
  `GOOGLE_CLIENT_ID` / `APP_ORIGIN` / `FIRESTORE_PROJECT_ID` のいずれかが未設定だと起動時に
  `log.Fatalf` する。`firestore.NewClient` はクライアント生成時にネットワークへ出ないので、
  `FIRESTORE_PROJECT_ID` に値さえあればサーバーは起動する。`GET /api/hello` は Firestore に
  触れず JSON を返す。

## 前提

- スコープは「`infra/prod/` を apply して Cloud Run サービスが立ち、割り当てられた URL に
  ブラウザ／`curl` でアクセスすると何らかの HTTP 応答が返る」まで。合格ライン ＝ 操作者の
  マシンから `curl <cloud_run_url>/api/hello` が 200 JSON、ブラウザで同 URL を開いて応答が
  ある（`/` は 404 でも可）。
- 対象外: Firestore `(default)` データベース、runtime SA へのロール付与、Go バイナリからの
  SPA 同梱配信・`/api/*` 以外の `index.html` フォールバック・アセットのキャッシュヘッダ、
  AR の DELETE クリーンアップポリシーと `cleanup_policy_dry_run = false` への切り替え、
  予算・予算アラート、Cloud Monitoring、CI/CD 自動化。
- apply は操作者本人の Application Default Credentials。SA キーは発行しない（0001）。
- 環境は本番のみ。
- リソースは全部 `infra/prod/`。新レイヤーは作らない。state は `gs://siorie-tfstate/prod/`。
- OAuth Web クライアントは Google Cloud Console での手動運用のまま（0022 で決定済み）。
- `terraform apply`（`infra/prod/`）は Claude Code の auto-mode classifier に弾かれる
  （worklog 0012 で顕在化）ため、apply と導通確認は操作者が実行する前提で書く。

## `infra/prod/` に追加するリソース

### `data.google_project`

`APP_ORIGIN` に使う project number を取得するためだけの data source。`cloudresourcemanager`
API は bootstrap で有効化済み。

### runtime サービスアカウント

- `google_service_account`、`account_id = "siorie-run"`。表示名は用途がわかるもの
  （例: `siorie Cloud Run runtime (no role bindings yet)`）。
- **IAM ロールのバインディングは今回付けない。** bootstrap の `deployer` SA と同じく、
  休眠状態で識別子（email）だけを確保する。
- `roles/datastore.user` は Firestore `(default)` データベースを作る次のラウンドで付与する。

### Cloud Run サービス

`google_cloud_run_v2_service`（v1 の `google_cloud_run_service` は使わない）。

- `location = var.region`、`deletion_protection = false`（provider 新版の既定 `true` を明示的に
  下げる。サービス自体にデータは無く、`publish-image` 済みイメージから即座に再作成できる）、
  `ingress = "INGRESS_TRAFFIC_ALL"`。
- `template.service_account` ＝ 上記 runtime SA の email。
- `template.scaling { min_instance_count = 0, max_instance_count = 1 }`（0001）。
  リクエストベース課金は v2 の既定（`cpu_idle = true`）のまま。concurrency も既定。
- `template.containers.image` ＝
  `"${...app.location}-docker.pkg.dev/${...app.project}/${...app.repository_id}/app:${var.image_tag}"`
  （`google_artifact_registry_repository.app` の属性から組み立てる。`outputs.tf` の
  `artifact_registry_repository` と同じ組み方に `/app:<tag>` を足したもの）。
- `template.containers.ports.container_port = 8080`（省略時の既定も 8080。Go サーバーは `PORT`
  を読み、未設定なら 8080 にフォールバックする）。
- `template.containers.env`:
  - `GOOGLE_CLIENT_ID` = `var.google_client_id`
  - `APP_ORIGIN` = `"https://siorie-${data.google_project.this.number}.${var.region}.run.app"`
  - `FIRESTORE_PROJECT_ID` = `var.project_id`
- `PORT` は明示しない（Cloud Run が注入する）。

### 未認証到達

- `google_cloud_run_v2_service_iam_member`、`role = "roles/run.invoker"`、`member = "allUsers"`。
  0001 の「Cloud Run サービスはインターネットから到達可能にし、認証・認可は Go API が行う」。

### 変数

- `variable "image_tag"`（`string`、デフォルトなし）— デプロイ対象イメージの短縮コミット SHA。
- `variable "google_client_id"`（`string`、デフォルトなし）— OAuth Web クライアント ID。
  非秘密値だがリポジトリには置かず、apply 時に `-var` / `TF_VAR_google_client_id` で渡す。

### 出力

- `output "cloud_run_url"` = `google_cloud_run_v2_service.app.uri` — 実際に割り当てられた URL。
  構築した `APP_ORIGIN` と一致するかの照合、および導通確認の対象。

## `infra/justfile`

- `plan` / `apply` recipe に `*args` を足し、`just infra/apply prod -var image_tag=<sha> -var
  google_client_id=<id>` の形で追加フラグを素通しできるようにする。
- 「Deploy container image」コメントブロックにデプロイ手順を追記する:
  `just infra/publish-image` の後に
  `just infra/apply prod -var image_tag=$(git -C <repo-root> rev-parse --short=12 HEAD) -var
  google_client_id=<id>`。

## `APP_ORIGIN` を決定論的 URL で構築することについて

新しい `run.app` URL は `https://<service>-<project number>.<region>.run.app` で決定論的に
決まる。サービス自身の `.uri` を同じリソース定義内の env で self-reference することはできない
ため、project number（`data.google_project`）から組み立てる。

- リスク: プロジェクトが旧 URL 形式（ランダムハッシュ）だと構築値が外れる。その場合は状態変更
  リクエストの `Origin` チェックが本番で崩れる。ただし超最小スコープでは `Origin` チェックを
  通る経路（`POST /api/*`）を叩かないので、このラウンドでは実害が出ない。
- `cloud_run_url` 出力で実 `uri` を確認し、worklog に一致／不一致を記録する。SPA 同梱の
  ラウンドで env を実値へ移す。

## 今回の作業と導通確認

作業:

1. `infra/prod/` に `data.google_project`、`google_service_account.runtime`、
   `google_cloud_run_v2_service.app`、`google_cloud_run_v2_service_iam_member.public` を追加。
2. `variables.tf` に `image_tag` / `google_client_id`。`outputs.tf` に `cloud_run_url`。
3. `infra/justfile` の `plan` / `apply` に `*args`。デプロイ手順のコメント追記。
4. `terraform fmt` → `terraform -chdir=infra/prod validate` → `plan`（`-var` 2 つ）。
5. `terraform -chdir=infra/prod apply`（操作者）。
6. `cloud_run_url` に対し `curl` とブラウザで導通確認。

preflight（worklog に明記。0011・0012 の踏襲）:

- ADC 設定済み（`~/.config/gcloud/application_default_credentials.json`、`quota_project_id =
  siorie`）。
- `gcloud` アカウント = `mitsuhitofujita@gmail.com`、`gcloud config` の project = `siorie`。
- 請求先アカウントがリンク済み（0011）。
- `run.googleapis.com` が有効（bootstrap、0011）。
- AR に `app:<sha>` が存在する。`gcloud artifacts docker images list
  asia-northeast1-docker.pkg.dev/siorie/siorie` で SHA を確認し、その値を `image_tag` に渡す。
- Firestore `(default)` データベースの既存有無を記録する（今回は作らない。次ラウンドの
  `terraform import` 要否判断のため）。
- `allUsers` への `roles/run.invoker` を弾く組織ポリシー
  （`constraints/iam.allowedPolicyMemberDomains` など）が無いこと。個人アカウント・組織なしなら
  通る想定。弾かれたら worklog に記録して方針を相談する。

導通確認（このラウンドの完了条件）:

- `terraform apply`（`infra/prod/`）が成功し、`google_cloud_run_v2_service.app`、runtime SA、
  invoker バインディングができる。
- 再 `plan` が「No changes」。
- `curl <cloud_run_url>/api/hello` が 200 で JSON を返す。
- 同 URL をブラウザで開いて応答がある（`/` は 404 でも可）。
- 実 `uri` が構築した `APP_ORIGIN` と一致するかを worklog に記録。

## この提案が可能にすること（次のトピックへの入力）

- **Firestore `(default)` データベース**（`google_firestore_database`、既存なら `terraform
  import`）＋ runtime SA へ `roles/datastore.user`。これで `/api/me` やグループ／アイテムの
  エンドポイントが本番で動く。
- **SPA 同梱配信**・`/api/*` 以外の `index.html` フォールバック・アセットのキャッシュヘッダ
  （別 discovery）。設計が決まれば `infra/Dockerfile` の builder に web ビルド段を足し、
  最終イメージへ `apps/web/dist` をコピーする。Cloud Run 側の `image` 参照は変わらない。
- **`APP_ORIGIN` を構築文字列から実値（`cloud_run_url`）へ**。`Origin` チェックが load-bearing に
  なるのは SPA 同梱後。
- **AR の DELETE クリーンアップポリシー**（全件マッチ）＋ `cleanup_policy_dry_run = false`。
  デプロイでイメージが増え始めるため、遅くとも数デプロイ以内に足す。
- **予算・予算アラート、Cloud Monitoring**（0001）。
- **CI/CD 自動化**: GitHub Actions + Workload Identity Federation（0003 の受け皿）。`:latest` が
  無いので、ワークフローはビルドした `<sha>` を `image_tag` として明示的に apply へ渡す。WIF
  プール／プロバイダの定義と `deployer` SA へのロール付与もそのトピック。
- **Go サーバーの構造化ログ**（0001 は標準出力への構造化ログを求めるが、現状は `log.Printf`）。

## 未解決・リスク

- **デフォルトなし変数 2 つ**（`image_tag`、`google_client_id`）。`infra/prod/` に対する
  `plan` / `apply` は、無関係な変更のときも `-var` 2 つが必須になる。
  `TF_VAR_image_tag` / `TF_VAR_google_client_id` をシェルに置けば緩和できるが、素の
  `just infra/plan prod` は通らなくなる。
- **構築 `APP_ORIGIN` は新 URL 形式が前提**。外れると `Origin` チェックが崩れる（超最小スコープ
  では未使用）。
- **`max_instance_count = 1`**（0001）でコールドスタート待ちが毎リクエスト発生し得る。個人利用
  なので許容。
- **KEEP のみ・`dry_run = true`** のため、`publish-image` を回すたびイメージが増え続ける
  （DELETE ポリシーが入るまで何も削除されない）。当面は AR 無料枠内。
- **`terraform apply`（`infra/prod/`）は Claude Code の auto-mode classifier に弾かれる**
  （0012 で顕在化）。apply と導通確認は操作者が回す。
- **runtime SA がロールなしのまま**。`firestore.NewClient` はクライアント生成時にネットワークへ
  出ないので、`FIRESTORE_PROJECT_ID = siorie` でも DB 未作成でもサーバーは起動し `/api/hello` は
  応答する。Firestore を叩く経路はリクエスト時に失敗する（このラウンドの対象外）。
- **`deletion_protection = false`**。誤操作 `destroy` の保険が無い。サービス自体はデータを持たず
  再作成が容易、というトレードオフ。
- **Firestore `(default)` を今回作らない**ため、次ラウンドまで本番のデータ操作は一切できない。

## 参考資料

- [Terraform: google_cloud_run_v2_service](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/cloud_run_v2_service)
- [Terraform: google_cloud_run_v2_service_iam](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/cloud_run_v2_service_iam)
- [Terraform: google_project (data source)](https://registry.terraform.io/providers/hashicorp/google/latest/docs/data-sources/project)
- [Cloud Run: container runtime contract (PORT)](https://cloud.google.com/run/docs/container-contract)
- [Cloud Run: URL 形式](https://cloud.google.com/run/docs/triggering/https-request)
- [Cloud Run: 未認証の呼び出しを許可する](https://cloud.google.com/run/docs/authenticating/public)
- [0001 purpose and initial tech stack](../0001-purpose-and-initial-tech-stack/proposal.md)
- [0003 CI/CD service selection](../0003-cicd-service-selection/proposal.md)
- [0011 Terraform IaC layout](../../decisions/0011-terraform-iac-layout.md)
- [0012 Container images](../../decisions/0012-container-image-build-and-registry.md)
