# インフラのデプロイ単位を頻度で3層化し、Firestore を用意する

## ステータス

提案。決定ではない。提案時点での方針をまとめたもの。

`infra/` を変更頻度で3つのルートモジュールに割り直し（`bootstrap` / `platform` / `app`、
`prod` は廃止）、`platform` 層に Firestore `(default)` データベースと runtime SA への
`roles/datastore.user` を足す。既存の apply 済みリソースは destroy せず新層へ import する。

## 背景

- **decision 0011（accepted）＋ worklog 0011**：`infra/` は Terraform、ワークステーションから
  apply、当面本番のみ。**flat 2ルートモジュール `infra/bootstrap/` と `infra/prod/`。
  `modules/` も `environments/` ラッパーも作らない**。構造の factor out は second
  environment か real reuse ができてから（0001 の no-speculative-structure ルール）。
  `bootstrap` は API 有効化・`siorie-tfstate` バケット・休眠 `deployer` SA。`prod` は GCS
  backend ＋ AR リポジトリ。「Cloud Run、Firestore `(default)`、runtime SA と IAM、予算、
  Cloud Monitoring は後続の worklog で」と本文が明記。
- **decision 0012（accepted）＋ worklog 0012**：AR リポジトリ `siorie`（`asia-northeast1`）、
  イメージ参照 `asia-northeast1-docker.pkg.dev/siorie/siorie/app:<git-sha>`、`:latest` なし、
  cleanup は KEEP のみ・`dry_run = true`。
- **discussion 0024（worked）＋ worklog 0013**：`infra/prod/` に `google_cloud_run_v2_service`、
  `google_service_account.runtime`（`siorie-run`、ロールなし）、`allUsers` invoker、
  `data.google_project` を追加し、操作者が apply して `curl <cloud_run_url>/api/hello` が
  200 を返すところまで確認済み。**Firestore `(default)`、runtime SA へのロール付与、SPA
  同梱、AR の DELETE ポリシー、予算・監視、CI/CD は明示的に後続へ送られた**。preflight で
  Firestore `(default)` は未作成と確認済み。
- **discussion 0025（open）**：Cloud Run サービスが自分の実 URL を Terraform で
  self-reference できず、project number から構築した `APP_ORIGIN` が実 URL（旧ハッシュ形式）
  と食い違う。本提案では解決しない。
- **discussion 0026（open）**：`image_tag` と `google_client_id` を default なし変数にした
  結果、`infra/prod/` に対する plan / apply が Cloud Run と無関係でも `-var` 2つ必須。
  本提案では層分割で緩和されるが解消はしない。

## 前提

- 変更頻度でルートモジュールを割るのは **予防的整理**。現時点で具体的な運用上の痛み（頻繁な
  Cloud Run 再デプロイ）が出ているわけではない。decision 0011 の「必要になってから factor
  out」および 0001 の no-speculative-structure とのテンションは承知のうえで取る。決着時に
  0011 を更新する新 decision を起こす。
- 環境は本番のみ。apply は操作者本人の ADC。SA キーは発行しない（0001）。
- `terraform apply`（`infra/prod/` 系の層）は Claude Code の auto-mode classifier に弾かれる
  （worklog 0012・0013）。`init` / `validate` / `plan` はエージェント、`apply` と導通確認は
  操作者。
- Firestore `(default)` は未作成（worklog 0013）。`google_firestore_database` で新規作成、
  `terraform import` は不要。
- 移設対象の4リソース（AR リポジトリ、runtime SA、Cloud Run サービス、invoker バインディング）
  は現在 live で `gs://siorie-tfstate/prod/` state にある。

## 3層構成

| 層 | 変更頻度 | ディレクトリ | state |
| --- | --- | --- | --- |
| `bootstrap` | ほぼ不変 | `infra/bootstrap/` | ローカル・リポにコミット（変更なし） |
| `platform` | まれ | `infra/platform/`（新規） | `gs://siorie-tfstate/platform/`（新規 prefix） |
| `app` | 毎デプロイ | `infra/app/`（新規） | `gs://siorie-tfstate/app/`（新規 prefix） |

`infra/prod/` は廃止。`infra/Dockerfile` と `infra/justfile` は `infra/` 直下のまま。

### `infra/bootstrap/`

変更なし。API 有効化（`firestore.googleapis.com` を含む既存セット）、`siorie-tfstate`
バケット、休眠 `deployer` SA。

### `infra/platform/`（新規）

**移設（`import`、destroy/recreate しない）:**

- `google_artifact_registry_repository.app` — `prod` から定義をそのまま移動
  （`repository_id = "siorie"`、`DOCKER`、`location = var.region`、KEEP `keep-recent` /
  `keep_count = 2`、`cleanup_policy_dry_run = true`）。DELETE ポリシーと `dry_run = false`
  は引き続き後続（この層に入る）。
  `import` id: `projects/siorie/locations/asia-northeast1/repositories/siorie`
- `google_service_account.runtime` — `prod` から移動（`account_id = "siorie-run"`）。
  表示名／コメントを更新（`roles/datastore.user` が同じ層に入るため「no role bindings yet」
  を外す）。
  `import` id: `projects/siorie/serviceAccounts/siorie-run@siorie.iam.gserviceaccount.com`

**新規追加:**

- `google_firestore_database.default`
  - `name = "(default)"`、`location_id = var.region`（`asia-northeast1`）、
    `type = "FIRESTORE_NATIVE"`、`app_engine_integration_mode = "DISABLED"`
  - GCP 側の削除保護を有効化（`google_firestore_database` の削除保護フィールド。正確な
    属性名は pin した provider `~> 6.50` に対して worklog で確認）＋ Terraform 側
    `lifecycle { prevent_destroy = true }` の二重ガード。
  - PITR（`point_in_time_recovery_enablement`）は既定（無効）のまま — コスト。必要になったら別途。
  - セキュリティルール・複合インデックスのリソースは入れない（アクセスは Go バックエンドの
    ADC 経由のみ、クライアント SDK からの直アクセスなし）。
- `google_project_iam_member.runtime_datastore`
  - `role = "roles/datastore.user"`、
    `member = "serviceAccount:${google_service_account.runtime.email}"`
  - 0024 が後続に送った IAM。これで本番で `/api/me` やグループ／アイテムのエンドポイントが
    動く。

**その他ファイル:**

- `versions.tf`（`terraform ~> 1.15`、`google ~> 6.50`）、`backend.tf`
  （`bucket = "siorie-tfstate"`、`prefix = "platform"`）、`provider "google"`。
- `variables.tf` — `project_id`（default なし）、`region`（default `asia-northeast1`）。
  **default なし変数はこれ以上足さない** → `just infra/plan platform` が素で通る。
- `terraform.tfvars` — `project_id = "siorie"`、`region = "asia-northeast1"`（コミット）。
  `.terraform.lock.hcl` もコミット。
- `outputs.tf` — `artifact_registry_repository`（`prod` の同名 output を踏襲、
  `just infra/publish-image` と人間向け）。

### `infra/app/`（新規）

**`platform` の値は `data` source で GCP から直接引く**（`terraform_remote_state` は使わない）:

- `data "google_project" "this"` — project number（`APP_ORIGIN` 構築用、0025 が残る）。
- `data "google_artifact_registry_repository" "app"` — イメージパス構築用
  （`repository_id = "siorie"`）。
- `data "google_service_account" "runtime"` — `template.service_account` の email。

**移設（`import`）:**

- `google_cloud_run_v2_service.app` — `prod` から移動。`name = "siorie"`、
  `deletion_protection = false`、`ingress = "INGRESS_TRAFFIC_ALL"`、
  `scaling { min 0 / max 1 }`、`ports.container_port = 8080`。
  - `template.service_account = data.google_service_account.runtime.email`
  - `image = "${data.google_artifact_registry_repository.app.location}-docker.pkg.dev/${data.google_artifact_registry_repository.app.project}/${data.google_artifact_registry_repository.app.repository_id}/app:${var.image_tag}"`
  - env：`GOOGLE_CLIENT_ID = var.google_client_id`、
    `APP_ORIGIN = "https://siorie-${data.google_project.this.number}.${var.region}.run.app"`
    （実 URL 化は 0025）、`FIRESTORE_PROJECT_ID = var.project_id`
  `import` id: `projects/siorie/locations/asia-northeast1/services/siorie`
- `google_cloud_run_v2_service_iam_member.public` — `prod` から移動（`roles/run.invoker`
  → `allUsers`）。
  `import` id:
  `projects/siorie/locations/asia-northeast1/services/siorie roles/run.invoker allUsers`

**その他ファイル:**

- `versions.tf`、`backend.tf`（`prefix = "app"`）、`provider "google"`。
- `variables.tf` — `project_id`（default なし）、`region`（default `asia-northeast1`）、
  `image_tag`（`string`、default なし）、`google_client_id`（`string`、default なし。非秘密
  だがリポに置かない＝0024 / 0026 の方針を維持）。
- `terraform.tfvars` — `project_id` / `region` のみコミット。`.terraform.lock.hcl` もコミット。
- `outputs.tf` — `cloud_run_url = google_cloud_run_v2_service.app.uri`。

### `infra/justfile`

- recipe（`init` / `plan` / `apply` / `output` はすべて層名を引数に取る）は **変更不要**。
  `just infra/apply platform` / `just infra/apply app` がそのまま動く。
- コメントの更新のみ：「Roll the Cloud Run service」ブロックの例を `just infra/apply prod …`
  → `just infra/apply app -var image_tag=<sha> -var google_client_id=<id>`。層間の apply 順
  （`platform` → `app`）を注記。
- `publish-image` / `docker-auth` は AR パスが同一なので変更なし。

## 移設手順

エージェント（read-only まで）:

1. `infra/platform/` と `infra/app/` のファイル一式を作成（`import` ブロック込み）。
   `infra/justfile` のコメント更新。`docs/design/repository-structure.md` の更新は worklog 側。
2. `terraform fmt -recursive infra/`。
3. 各新層で `terraform init`（新 prefix に空 state 作成）→ `validate` → `plan`。
   - `platform` の plan 期待値：AR リポジトリと runtime SA が **import され差分ほぼゼロ**、
     Firestore DB と `google_project_iam_member` が **2 to add**。
   - `app` の plan 期待値（`-var image_tag=<AR に実在するタグ> -var google_client_id=<dummy>`）：
     Cloud Run サービスと invoker が **import され差分ほぼゼロ**（`GOOGLE_CLIENT_ID` env は
     dummy との差分が出る＝worklog 0013 と同じアーティファクト）。
   - **いずれかのリソースが `-/+`（replace）になったら停止して再検討**（import id かスキーマ
     差分の疑い）。

操作者（`apply`）:

4. `terraform -chdir=infra/platform apply` → AR・SA を import で取り込み、Firestore DB と
   `roles/datastore.user` を作成。
5. `terraform -chdir=infra/app apply -var image_tag=<sha> -var google_client_id=<real id>`
   → Cloud Run サービスと invoker を import で取り込み。
6. 両層で再 `plan` が「No changes」（`app` は apply 時と同じ `-var` 値で）。
7. `curl -i "$(terraform -chdir=infra/app output -raw cloud_run_url)/api/hello"` が 200。
   任意で Firestore 経由の経路（dev-login 後の `/api/me` など）も確認。

`prod` の撤去:

8. `terraform -chdir=infra/prod state rm google_artifact_registry_repository.app
   google_service_account.runtime google_cloud_run_v2_service.app
   google_cloud_run_v2_service_iam_member.public`
   （**`terraform destroy` はしない** — live リソースは新層が管理している）。
9. `infra/prod/` ディレクトリを削除。`gs://siorie-tfstate/prod/` の state オブジェクトは
   任意で削除（versioned・30日 noncurrent cleanup なので放置も可）。
10. import 済みの `import` ブロックを `platform` / `app` から削除（後続コミット）。

preflight（worklog に明記。0011 / 0012 / 0013 の踏襲）:

- ADC 設定済み、`gcloud` アカウント = `mitsuhitofujita@gmail.com`、project = `siorie`。
- `firestore.googleapis.com` 有効（bootstrap）。
- Firestore `(default)` が依然として未作成（`gcloud firestore databases list`）。
- 移設対象4リソースが依然 live（`gcloud artifacts …`、`gcloud iam service-accounts …`、
  `gcloud run services describe siorie`、invoker バインディング）。
- `app` の `-var image_tag` に渡す、AR に実在するタグ
  （`gcloud artifacts docker images list asia-northeast1-docker.pkg.dev/siorie/siorie`）。
- `gs://siorie-tfstate` に到達可能。

## この提案が可能にすること / 申し送り

- **本番の Firestore アクセス**：`platform` apply 後、`/api/me`・グループ／アイテムの
  エンドポイントが本番で動く。
- **`app` 層だけが per-deploy `-var` を持つ**：`platform`・`bootstrap` は `-var` 不要。
  discussion 0026 の摩擦は「`infra/prod/` の全操作」から「`app` の操作だけ」に縮小（解消は
  しない。0026 は open のまま）。
- **`APP_ORIGIN` の実 URL 化（0025）** が `app` 層内に閉じて扱いやすくなる
  （`data.google_cloud_run_v2_service` での読み戻し、または `app` 内2段階）。
- **CI/CD（0003：GitHub Actions + WIF）** が入るとき、`deployer` SA のロールを `app` 層に
  絞りやすい（`platform` は人間が年に数回触るだけ）。
- **予算・予算アラート、Cloud Monitoring、AR の DELETE クリーンアップポリシー**（0024 の
  申し送り）は `platform` 層に入る見込み。本提案には含めない。
- **decision 0011 の更新**：`/decide` 時に、変更頻度 / blast radius を factor-out の trigger
  に足し、flat 2層方針を撤回、`prod` → `platform` + `app` を記録する新 decision を起こす。

## 未解決・リスク

- **予防的分割のカットライン**：実際の再デプロイ頻度や CI/CD が入ってから `platform` /
  `app` の境界が最適でないと判明する可能性。是正は「リソースを層間で移す＝もう一度 import
  手順」。
- **層間 `data` source が暗黙の apply 順序を作る**：`app` の plan / apply は AR リポジトリと
  runtime SA がプロジェクトに存在していることが前提。ルートモジュール跨ぎの `depends_on` は
  無いので、両方変わるときは `platform` を先に apply する運用を justfile／コメントに明記する。
- **全 import のリスク**：`import` id 誤りやスキーマ差分で replace 提案が出ると live リソース
  を作り直しかねない。→ エージェントの `plan` で import ＋ 差分ほぼゼロを確認してから操作者
  が apply。replace が出たら停止。
- **`(default)` データベースは不可逆**：ロケーション（`asia-northeast1`）・Native モードは
  後から変更不可。削除保護（GCP 側）＋ `prevent_destroy` で `terraform destroy` から二重に
  保護。消すには両方を意図的に外す必要がある。
- **`app` は依然 `-var` 2つ**（`image_tag`・`google_client_id`）。0026 の申し送り。
- **`prod` state オブジェクトの後始末**：`state rm` ＋ バケット掃除をしないとバケットに残る
  （無害だが不潔）。
- **`APP_ORIGIN`** は構築値（このプロジェクトでは誤り）のまま。0025 の担当。

## 参考資料

- [Terraform: google_firestore_database](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/firestore_database)
- [Terraform: import ブロック](https://developer.hashicorp.com/terraform/language/import)
- [Terraform: google_artifact_registry_repository（data source）](https://registry.terraform.io/providers/hashicorp/google/latest/docs/data-sources/artifact_registry_repository)
- [Terraform: google_service_account（data source）](https://registry.terraform.io/providers/hashicorp/google/latest/docs/data-sources/service_account)
- [Firestore: ロケーション](https://cloud.google.com/firestore/docs/locations)
- [decision 0011 Terraform IaC layout](../../decisions/0011-terraform-iac-layout.md)
- [decision 0001 Monorepo scaffold](../../decisions/0001-monorepo-scaffold.md)
- [decision 0012 Container images](../../decisions/0012-container-image-build-and-registry.md)
- [discussion 0024 Cloud Run service](../0024-cloud-run-service/proposal.md)
- [discussion 0025 Cloud Run app origin](../0025-cloud-run-app-origin/discovery.md)
- [discussion 0026 Infra per-deploy inputs](../0026-infra-per-deploy-inputs/discovery.md)
- [worklog 0013 Cloud Run service](../../worklogs/0013-cloud-run-service/plan.md)
