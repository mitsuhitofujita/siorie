# デプロイ向け Terraform IaC の土台と bootstrap 層

## ステータス

提案。決定ではない。提案時点での方針をまとめたもの。

将来のデプロイに向けた Terraform IaC のディレクトリ構成と state 保存方式を定め、
bootstrap 層を実装・apply して導通を確認するところまでを対象とする。
prod 層の実リソースと CI/CD 自動化は後続に送る。

## 背景

- [0001 purpose and initial tech stack](../0001-purpose-and-initial-tech-stack/proposal.md) で
  GCP の目標構成は確定しているが、「Terraform で管理するリソースの範囲と state の保存方法は
  インフラ設計の後続トピックで決める」と明記されていた。本提案がその後続トピックにあたる。
- [0003 CI/CD service selection](../0003-cicd-service-selection/proposal.md) は Cloud Build 採用を
  撤回し、「CI/CD サービス選定は IaC・デプロイ設計の後続トピックで決める」としていた。本提案で
  方向性（決定ではない）を記録する。
- 現時点でリポジトリに Terraform / Dockerfile / cloudbuild 定義は無い。`mise.toml` に
  `terraform` と `gcloud` は既にピンされている。

## 前提

- GCP プロジェクト（本番用の 1 つ）は手動で作成済み。請求先アカウントに紐付いている。
  Terraform はプロジェクト内リソースのみを管理し、プロジェクト自体は作らない。
- 当面 apply はローカルからのみ行う。CI/CD による自動 apply / デプロイはこの提案の対象外。
- 環境は本番のみ。staging やプレビュー環境は当面作らない。
- リポジトリは GitHub 上で public。
- ローカル apply は実行者自身の Application Default Credentials（`gcloud auth
  application-default login`）で行う。ユーザー管理のサービスアカウントキーは発行しない
  （0001 準拠）。

## ディレクトリ構成

`infra/bootstrap/` と `infra/prod/` の 2 つを、それぞれ独立した root module としてフラットに
置く。`modules/` や `environments/` は作らない。decision 0001 の「実需要が出るまで投機的な
構造を作らない」方針に合わせ、再利用や 2 つ目の環境が実際に必要になってから切り出す。

```text
infra/
├── bootstrap/
│   ├── versions.tf          # required_version, google provider 制約
│   ├── main.tf              # API 有効化, GCS state バケット, deployer SA
│   ├── variables.tf         # project_id, region
│   ├── outputs.tf           # state バケット名など（prod 層が参照する値）
│   ├── terraform.tfvars     # project_id, region の実値（コミットする）
│   ├── .terraform.lock.hcl  # コミットする
│   └── terraform.tfstate    # ローカル state。コミットする
├── prod/
│   ├── versions.tf
│   ├── backend.tf           # GCS backend（bootstrap が作ったバケット、prefix = "prod"）
│   ├── main.tf              # 今回は provider 設定のみ。実リソースは次の worklog
│   └── .terraform.lock.hcl  # コミットする
└── justfile                 # plan / apply の薄い recipe
```

## state 保存方式

bootstrap は「state バケットを作る層」なので、そのバケットを自分の backend には使えない
（卵と鶏）。これを一番素直に回避するため、層ごとに方式を変える。

- **`infra/bootstrap/`**: ローカル state。`terraform.tfstate` をリポジトリにコミットする。
  bootstrap が持つのは有効化 API・GCS バケット・SA 識別子だけで、state に機密は含まれない。
  コミットしておくことで「本番に何が存在するか」の記録が残る。
  - トレードオフ: git 上の state にはロックが無い。実行者が 1 人でローカル apply のみ、という
    前提でのみ許容する。2 人目の実行者や CI が bootstrap を触るようになったら、bootstrap も
    GCS backend へ移行する。
- **`infra/prod/`**: GCS backend。bootstrap が作ったバケットを使い、`prefix = "prod"`。
  バケット名は `project_id` から決まる（`<project_id>-tfstate` を想定）ので `backend.tf` に
  直書きできる。

### Git 管理

- コミットする: `infra/bootstrap/terraform.tfvars`（`project_id`, `region` のみ・非機密）、
  両層の `.terraform.lock.hcl`、`infra/bootstrap/terraform.tfstate`。
- `.gitignore` に追加する: `.terraform/`（両層）、`infra/prod/*.tfstate*`
  （prod は backend 運用なのでローカルに出ない想定だが保険）、
  `infra/**/*.tfplan`。

## bootstrap 層の内容

### API の有効化

`google_project_service` で以下を有効化する。有効化は無料かつ冪等なので、bootstrap と近い将来の
prod 層が必要とする既知分をまとめて有効にする。

- `serviceusage.googleapis.com`
- `cloudresourcemanager.googleapis.com`
- `iam.googleapis.com`
- `iamcredentials.googleapis.com`
- `sts.googleapis.com`
- `storage.googleapis.com`
- `run.googleapis.com`
- `artifactregistry.googleapis.com`
- `firestore.googleapis.com`
- `cloudbilling.googleapis.com`
- `billingbudgets.googleapis.com`
- `monitoring.googleapis.com`
- `logging.googleapis.com`

`firestore.googleapis.com` の有効化は `(default)` データベースの作成までは行わない。DB 作成は
prod 層の担当。

`disable_on_destroy = false` とし、`terraform destroy` で API まで無効化しないようにする。

### GCS state バケット

- 名前: `<project_id>-tfstate`
- ロケーション: `asia-northeast1`
- `uniform_bucket_level_access = true`
- `public_access_prevention = "enforced"`
- `versioning { enabled = true }`
- `lifecycle { prevent_destroy = true }`
- 古いバージョンの肥大化を抑えるライフサイクルルール（noncurrent version を一定数／一定日数で
  削除）は付けてよい。詳細は実装時に決める。

### deployer SA

- `google_service_account`、`account_id = "deployer"` 程度。表示名は用途がわかるものにする。
- **IAM ロールのバインディングは今回付けない。** 休眠状態で識別子だけを確保する。
- 用途は将来の GitHub Actions + Workload Identity Federation のデプロイ ID。WIF プール／
  プロバイダの作成と、この SA へのロール付与は別トピック（下記「CI/CD の方向性」）。

### outputs

- state バケット名（prod 層の `backend.tf` 記述の裏取り用）
- deployer SA の email
- 有効化した API の一覧

## prod 層（今回はスケルトンのみ）

- `versions.tf` と `backend.tf`、provider 設定だけを置く。管理リソースは 0 個。
- 目的は「bootstrap が作ったバケットに `terraform init` が通り、`terraform plan` が差分なしで
  返る」ことの確認だけ。
- Cloud Run / Artifact Registry / Firestore `(default)` / runtime SA + IAM / 予算アラート /
  監視などの実リソースは、この提案から起こす worklog で追加する。

## 認証

- ローカル apply は実行者の ADC。`gcloud auth application-default login` 済みであることを
  前提にする。
- `google` provider には `project` と `region` だけを渡し、credentials は ADC 任せにする。
- SA キーファイルは作らない・置かない。

## CI/CD の方向性（決定ではない）

- 将来の CI/CD は **GitHub Actions + Workload Identity Federation** の方向とする。
  - 0003 の比較で、public リポでは GitHub Actions の実行時間が実質無制限で、GCP 認証は
    WIF によりキーレスにできる、という結果が出ている。
  - bootstrap は、後から WIF プール／プロバイダと deployer SA へのロールバインディングを
    足す前提で設計する（`sts.googleapis.com` / `iamcredentials.googleapis.com` を先に有効化
    しておくのはこのため）。
- 実際の WIF リソース定義、deployer SA の権限設計、`.github/workflows/` の作成は、この提案の
  対象外。0003 の受け皿として別トピックで扱う。
- これは提案時点の方向であり、`decisions/` に書く確定ではない。

## ツール入口

- `infra/justfile` を追加する。`apps/api/justfile` と同じく、root の `justfile` から just の
  クロスディレクトリ解決（`just infra/plan bootstrap` のような形）で呼べるようにする。
  recipe は `plan` と `apply`（対象層を引数で受ける薄いラッパー）程度から始める。
- `mise.toml` の `terraform = "latest"` を、実装時点の安定版に固定した exact 指定へ変更する
  （0001 のビルド再現性方針）。`versions.tf` の `required_version` も同じ系列に合わせる。

## 今回の作業と導通確認

作業:

1. `infra/` のディレクトリと上記ファイルを作成。
2. `infra/bootstrap/` を `terraform init` → `plan` → `apply`（ローカル state）。
3. `infra/prod/` のスケルトンを作成し、`terraform init`（GCS backend）→ `plan`。
4. `infra/justfile` 追加、root `justfile` から辿れるよう配線。`mise.toml` の terraform を
   exact ピンに変更。`.gitignore` を更新。

導通確認（このラウンドの完了条件）:

- `infra/bootstrap/` の `apply` が実プロジェクトに対して成功する。
- 対象 API が有効化され、GCS バケットが versioning 付きで存在する。
- `infra/bootstrap/` の再 `plan` が「No changes」。
- `infra/prod/` の `init` が bootstrap の作ったバケットに対して成功し、`plan` が「No changes」。

## 後続に送るもの

- prod 層の実リソース: Cloud Run サービス、Artifact Registry リポジトリ（＋クリーンアップ
  ポリシー）、Firestore `(default)` データベース（既存なら `terraform import`）、runtime SA と
  その IAM、予算・予算アラート、Cloud Monitoring のダッシュボード／アラート。
- Dockerfile と、Go 単一バイナリからの SPA 配信（0001 のシステム構成）。
- WIF プール／プロバイダ、deployer SA への IAM ロール付与、`.github/workflows/` の CI/CD
  ワークフロー。0003 の受け皿トピックとして起こす。
- OAuth クライアント／同意画面: Terraform のサポートが薄く（`google_iap_brand` は IAP 前提、
  GIS 用 Web OAuth クライアントの管理リソースが実質無い）、当面は Google Cloud Console での
  手動運用のままとする。この方針も後続トピックで明文化する。

## 未解決・リスク

- **bootstrap state をコミットすること**: ロックが無く、複数人・CI が触り始めた時点で
  破綻する。移行トリガー（2 人目の実行者、または CI が bootstrap を触る）を明示しておく。
- **Firestore `(default)` の既存可能性**: これまでの開発はエミュレーターのみだが、本番
  プロジェクトで既に Firestore が初期化されている場合、prod 層では `terraform import` が必要。
- **`prevent_destroy` と apply 運用**: state バケットに `prevent_destroy` を付けるため、
  意図的な作り直しには一時的な削除が要る。運用上の注意点として残す。
- **API 有効化の先出し**: prod 層で使う API を bootstrap でまとめて有効化するため、prod 層を
  読むだけでは「どの API に依存しているか」が見えにくい。prod 層側にコメントで対応関係を
  書くなどの補いを検討する。
- **exact ピンするバージョン**: `mise.toml` と `versions.tf` で固定する Terraform / google
  provider のバージョンは実装時点の安定版を確認して決める。

## 参考資料

- [Terraform Google provider: google_project_service](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/google_project_service)
- [Terraform: GCS backend](https://developer.hashicorp.com/terraform/language/backend/gcs)
- [Workload Identity Federation with GitHub Actions](https://cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines)
- [google-github-actions/auth](https://github.com/google-github-actions/auth)
- [0001 purpose and initial tech stack](../0001-purpose-and-initial-tech-stack/proposal.md)
- [0003 CI/CD service selection](../0003-cicd-service-selection/proposal.md)
