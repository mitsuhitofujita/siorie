# 議事録

`discovery.md`（AR へのイメージ push が済んだので、そのイメージを動かす側のインフラを
Terraform で用意する）をもとに、今回のスコープ、デプロイの回し方、runtime SA の扱い、
`APP_ORIGIN` の供給方法、機密でない設定値の置き場所を詰めた。

## 事前確認

- `discovery.md` に frontmatter がなかったため内容から推定して補った
  (`date: 2026-08-30` / `tags: [infra, iac, terraform, deploy, cloud-run, cicd]` /
  `status: open`)。本文は変更していない。ディレクトリ名も `0024-cloud-run-service` に
  リネームした。
- 過去の discussions・decisions・design を確認した。
  - [0001 purpose and initial tech stack](../0001-purpose-and-initial-tech-stack/proposal.md)（decided）:
    Cloud Run 単一サービス、SPA+API 同梱・同一オリジン、`min 0` / `max 1`、リクエストベース課金、
    専用 runtime SA（Firestore 最小権限）、`run.app` URL 公開・インターネット到達可・認可はアプリ、
    少額予算アラート、Cloud Monitoring、Secret Manager は初期不使用（env は平文）、SA キーは発行しない。
  - [0003 CI/CD service selection](../0003-cicd-service-selection/proposal.md)（proposed）:
    Cloud Build 撤回、選定は保留。方向は GitHub Actions + Workload Identity Federation。
  - [0011 Terraform IaC layout](../../decisions/0011-terraform-iac-layout.md)（accepted）＋
    [worklog 0011](../../worklogs/0011-terraform-gcp-bootstrap/plan.md):
    `infra/bootstrap/` は apply 済み（13 API、`siorie-tfstate`、休眠 `deployer` SA）。
    `infra/prod/` は GCS backend ＋ AR リポジトリ 1 個。「Cloud Run … は後続の worklog で」と明記。
  - [0012 Container images](../../decisions/0012-container-image-build-and-registry.md)（accepted）＋
    [worklog 0012](../../worklogs/0012-container-image-build-and-push/plan.md):
    AR リポジトリ `siorie`、イメージ `asia-northeast1-docker.pkg.dev/siorie/siorie/app:<sha>`、
    ワークステーションから build/push、`:latest` なし、cleanup は KEEP のみ・`dry_run = true`。
    DELETE ポリシーと `deployer` SA へのロール付与は「Cloud Run のトピック」へ明示的に先送り。
    イメージが AR に載っていることは操作者確認済み。
- **同じ案を過去に検討して見送った、というものは今回なし。** このトピックは 0011・0012 が
  繰り返し後続へ送っていた「Cloud Run のトピック」そのものにあたる。手動運用の既知リソースは
  GCP プロジェクト本体・請求先リンク・OAuth Web クライアントで、OAuth クライアントは 0022 で
  「当面 Console 手動のまま」と決定済み。

## スコープと方式の絞り込み（質問と回答）

### ラウンド 1

1. **「ブラウザで何かしらレスポンス」をどこまでにするか** → 超最小。エラーページや 500 でも
   「レスポンスがある」とみなす。env も最小限で可。導通だけ確認して残りは全部後続。
   （`/api/hello` は Firestore に触れないため、Firestore `(default)` DB と `roles/datastore.user`
   が無くても達成できる、という前提を共有した。）
2. **イメージの指定とデプロイの回し方** → `image_tag` を Terraform 変数にする。デプロイのたび
   `terraform apply -var image_tag=<sha>` をワークステーションから実行。CI/CD（GHA + WIF）は
   0003 の受け皿トピックのまま。
3. **予算アラート・Cloud Monitoring・AR の DELETE クリーンアップを今回に含めるか** → 全部後続へ。
   今回は Cloud Run ＋ runtime SA ＋ 設定供給に絞る。

### ラウンド 2

1. **runtime SA に今回ロールを付けるか** → ロールなしで作る。`deployer` SA と同じく休眠識別子だけ
   確保し、`roles/datastore.user` は Firestore `(default)` DB を作る次のラウンドで付与する。
2. **`image_tag` の置き場所** → CLI で `-var` を毎回渡す。コミットは増えないが「今何がデプロイ
   されているか」は git に残らない（state には残る）。
3. **`APP_ORIGIN`（サービス自身の `run.app` URL）の扱い** → 決定論的 URL
   （`https://siorie-<project number>.<region>.run.app`）を project number から構築して env に渡す。
   一回の apply で済む。

### ラウンド 3

1. **`GOOGLE_CLIENT_ID` の値の渡し方** → デフォルトなしの変数にする。非秘密値だがリポジトリには
   置かず、`image_tag` と同じく apply 時に `-var` / `TF_VAR_` で渡す。
2. **Cloud Run サービスの `deletion_protection`** → `false`。provider 新版の既定は `true` なので
   明示的に下げ、destroy／再作成を摩擦なくできるようにする。サービス自体にデータは無い。

## 検討したが採用しなかった案

- **フル導通（Firestore `(default)` DB を作成し `roles/datastore.user` を付与）を今回含める案。**
  認証済みリクエストが本番で端から端まで通る状態まで作る。`/api/hello` は Firestore に触れず
  超最小はこれ無しで達成できるため、DB 作成と IAM は次のラウンドへ切り出した。
- **`image_tag` を `infra/prod/terraform.tfvars` にコミットする案。** デプロイのたび書き換えて
  コミットすれば `git log` がそのままデプロイ履歴になる。リポの「コミットして追える」方針とも
  一貫するが、コミットの増加を避け CLI `-var` を選んだ。
- **`just infra/deploy <sha>` recipe を作る案。** `publish-image` とペアになるが、履歴は git に
  残らない点は CLI `-var` と同じ。recipe を増やさず素の `terraform apply -var` とした。
- **runtime SA に `roles/datastore.user` を今回付与する案。** 0001 が記す最終形で、DB 未作成でも
  無害。だが「今回の導通に必要なものだけ」に絞る方針で、Firestore のラウンドへ回した。
- **`APP_ORIGIN` にプレースホルダを入れておく案 / 二段階 apply。** 超最小では Origin チェック
  （状態変更リクエスト）を叩かないのでプレースホルダでも動く。二段階 apply は確実だが手順が
  増える。決定論的 URL の構築が一回で済み実値に最も近いので採用。
- **`GOOGLE_CLIENT_ID` を `terraform.tfvars` にコミットする案。** SPA バンドルに載る非秘密値
  なので project_id / region と同じ扱いでよい。だがリポに ID を一切置かない形を選んだ。
- **`deletion_protection = true`（provider 既定）のまま。** 誤 destroy の保険になるが、作り直し
  時に一旦 `false` にして apply する手間が入る。データを持たないサービスなので `false`。
- **この回を 0003 の受け皿（GitHub Actions + WIF）にする案。** WIF プール／プロバイダ、`deployer`
  SA へのロール付与、`.github/workflows/` まで一気にやる。範囲が大きく、discovery は「イメージを
  動かして応答を確認する」ところを求めている。CI/CD 自動化は別トピックのまま。
- **予算・予算アラート・Cloud Monitoring・AR の DELETE ポリシーを今回まとめて片付ける案。**
  0012 が「Cloud Run のトピックで」と挙げた項目群。導通の焦点がぼやけるため、それぞれ後続の
  worklog に分けた。
- **runtime 用に新しい Terraform レイヤーを切る案。** `infra/prod/` に足す。2 つ目の環境も
  実再利用も無いので、0011 の「実需要が出るまで投機的な構造を作らない」に従いフラットのまま。
- **`google_cloud_run_service`（v1）を使う案。** 現行の `google_cloud_run_v2_service` を使う。

## 結論

- リソースは全部 `infra/prod/`（新レイヤーなし）。state は `gs://siorie-tfstate/prod/`。
- `data.google_project`（project number 取得）＋ `google_service_account`（`siorie-run`、
  ロールバインディングなし）＋ `google_cloud_run_v2_service`（`deletion_protection = false`、
  `ingress = "INGRESS_TRAFFIC_ALL"`、`min 0` / `max 1`、runtime SA 割り当て、
  `image = <AR パス>/app:${var.image_tag}`、env に `GOOGLE_CLIENT_ID` / `APP_ORIGIN`（決定論的
  URL を構築）/ `FIRESTORE_PROJECT_ID`）＋ `google_cloud_run_v2_service_iam_member`
  （`roles/run.invoker` を `allUsers`）。
- 変数 `image_tag` / `google_client_id`（ともにデフォルトなし、apply 時に `-var` / `TF_VAR_`）。
- `outputs.tf` に `cloud_run_url = ...app.uri`（実 URL。構築した `APP_ORIGIN` との照合と導通確認）。
- `infra/justfile` の `plan` / `apply` recipe に `*args` を足し、`-var` を素通しできるように。
- preflight（worklog）: ADC／`gcloud` プロジェクト／billing（済）／`run.googleapis.com`（済）／
  AR に `app:<sha>` が存在（SHA を `gcloud artifacts docker images list` で確認）／Firestore
  `(default)` の既存有無を記録／`allUsers` invoker を弾く組織ポリシーが無いこと／実 `uri` が
  新 URL 形式か。
- 導通確認: `terraform apply` 成功 → 再 `plan` 差分なし → `curl <cloud_run_url>/api/hello` が
  200 JSON → ブラウザで同 URL に応答（`/` は 404 でも可） → 実 `uri` と `APP_ORIGIN` の一致を記録。
- `terraform apply`（`infra/prod/`）は Claude Code の auto-mode classifier に弾かれる（0012 で
  顕在化）ため、apply と導通確認は操作者が回す前提で書く。
- この回は CI/CD 自動化でも 0003 の解決でもない。イメージを Cloud Run で動かし、ブラウザから
  応答が返ることの確認と、下流（Firestore、SPA 同梱、DELETE ポリシー、予算・監視、CI/CD）で
  必要になる検討項目の洗い出しが狙い。
