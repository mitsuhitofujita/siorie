# GitHub Actions からの手動デプロイ（`workflow_dispatch` + Workload Identity Federation）

## ステータス

提案。決定ではない。提案時点での方針をまとめたもの。

`.github/workflows/deploy.yml` を `workflow_dispatch` 起動のみで追加し、`just check` をゲートにして、
イメージの build / push と `infra/app` の apply を一本で回す。GitHub の OIDC トークンを Workload Identity
Federation（WIF）で交換し、bootstrap で作っておいた休眠 `deployer` SA になりすまして Google Cloud を操作する。
SA キーは作らない。push トリガーの自動デプロイと、push / PR 時の通常 CI は別ラウンドへ送る。

この提案は [0003 CI/CD service selection](../0003-cicd-service-selection/proposal.md) で保留された
「CI/CD サービスの選定」の受け皿であり、GitHub Actions の採用をここで確定させる。

## 背景

- [0003](../0003-cicd-service-selection/proposal.md)（proposed）: Cloud Build 採用を撤回し、選定を IaC・デプロイ設計の
  後続へ保留。比較観点（トリガーの所在、認証方式、コスト、PR 検証）は洗い出し済み。public リポジトリなので
  GitHub Actions の実行時間は実質無制限。ハイブリッド構成は除外済み。
- [decision 0011](../../decisions/0011-terraform-iac-layout.md): bootstrap が `sts` / `iamcredentials` を事前に有効化し、
  ロール付与のない休眠 `deployer` SA を持つ。「将来の CI/CD は GitHub Actions + WIF の方向」と決定ではなく方向として記録。
- [decision 0014](../../decisions/0014-infra-deploy-layers-and-firestore.md): 層を変更頻度で分けた理由の一つが
  「CI/CD が `app` に絞った identity を持ち、`platform` は人間専用のまま残す」こと。
- [decision 0012](../../decisions/0012-container-image-build-and-registry.md) /
  [decision 0016](../../decisions/0016-spa-co-serving.md): イメージはワークステーションで `just infra/publish-image`、
  タグは `git rev-parse --short=12 HEAD`、`:latest` なし。`google_client_id` はビルド時（`VITE_GOOGLE_CLIENT_ID`）と
  apply 時（`-var`）の二重入力で、ずれると無言の 401。
- [0026](../0026-infra-per-deploy-inputs/discovery.md)（open）: `infra/app` の plan / apply が毎回 `image_tag` /
  `google_client_id` / `app_origin` の三つの `-var` を要求する摩擦。候補の一つが「CI/CD が入るまで許容する。CI では
  ビルドした sha を明示的に渡す」だった。

現状のデプロイは、ワークステーションで `just infra/docker-auth`（初回）、`just infra/publish-image <client-id>`、
`just infra/apply app -var image_tag=… -var google_client_id=… -var app_origin=…` を手で打つ。`.github/` は存在しない。

## 前提

- リポジトリは GitHub 上で public。**Actions の実行ログは誰でも読める。** 値をログに出さないには `secrets` に置く
  必要がある（`vars` はマスクされない）。
- `infra/bootstrap/` は apply 済み: `sts.googleapis.com` / `iamcredentials.googleapis.com` 有効、`deployer` SA 存在、
  state バケット `siorie-tfstate` は uniform bucket-level access（IAM 条件が使える）。
- `infra/prod/` の退役（`state rm`、ディレクトリ削除、`infra/app/main.tf` の import ブロック削除、`.gitignore` の
  `prod` 行削除）は**この提案の前提作業**として先に済ませる。
- 0003 のハイブリッド除外と 0023 の `gcloud builds submit` 見送りは維持する。ビルドは Actions ランナー上の `docker build`。
- ローカルからの apply は従来どおり操作者自身の ADC。deployer SA は CI 専用で、ローカルから impersonation はしない
  （0022 と同じ判断）。

## 全体像

```
operator が GitHub UI / gh CLI で deploy.yml を main から dispatch
  │
  ├─ actions/checkout
  ├─ jdx/mise-action            mise.toml の go / node / pnpm / java / gcloud / just / terraform
  ├─ just setup                 go mod download, Firestore エミュレータ, pnpm install
  ├─ just check                 format-check → lint → test → build（API / Web）+ terraform fmt -check   ← ゲート
  ├─ google-github-actions/auth OIDC → WIF プール → deployer SA を impersonation（キーなし）
  ├─ just infra/docker-auth     gcloud auth configure-docker
  ├─ just infra/publish-image $GOOGLE_CLIENT_ID     asia-northeast1-docker.pkg.dev/siorie/siorie/app:<sha>
  ├─ just infra/init app
  └─ just infra/apply app -auto-approve -input=false
        -var image_tag=<sha> -var google_client_id=$GOOGLE_CLIENT_ID -var app_origin=$APP_ORIGIN
```

`<sha>` はチェックアウトしたコミットの `git rev-parse --short=12 HEAD`。`publish-image` が付けるタグと `image_tag` が
同じ式から出るので、0026 が挙げた「HEAD の sha と AR に実在するタグの乖離」は CI 経路では起きない。
`google_client_id` も一つの secret からビルド時と apply 時の両方へ流れるので、二重入力のずれも起きない。

## Google Cloud 側

### `infra/bootstrap/`（「誰が deployer になれるか」と state の入口）

- `data.google_project`: principalSet の組み立てにプロジェクト番号が要る。
- `google_iam_workload_identity_pool`（`github`）。
- `google_iam_workload_identity_pool_provider`（`github-actions`）: OIDC、issuer
  `https://token.actions.githubusercontent.com`。attribute mapping は `google.subject = assertion.sub`、
  `attribute.repository = assertion.repository`、`attribute.ref = assertion.ref`。attribute condition は
  `assertion.repository == "mitsuhitofujita/siorie" && assertion.ref == "refs/heads/main"`。
  main 以外のブランチや fork からのトークンは STS の交換で落ちる。
- `google_service_account_iam_member`: `deployer` SA に `roles/iam.workloadIdentityUser` を、
  `principalSet://iam.googleapis.com/projects/<number>/locations/global/workloadIdentityPools/github/attribute.repository/mitsuhitofujita/siorie`
  へ付与。
- `google_storage_bucket_iam_member`: `siorie-tfstate` に対して `deployer` へ `roles/storage.objectUser` を、
  `resource.name.startsWith("projects/_/buckets/siorie-tfstate/objects/app/")` の IAM 条件付きで付与。
  `platform` と `bootstrap` の state には触れない（未解決 1 を参照）。
- `outputs.tf` に `workload_identity_provider`（プロバイダのフルリソース名）を追加。ワークフローに書き写す値。
- bootstrap はローカル state をコミットする層だが、追加分はプール名、リポジトリ名、プロジェクト番号だけで秘密を含まない。

### `infra/platform/`（「deployer が何に触れるか」）

- `data.google_service_account`（`deployer`）: bootstrap の資源を 0027 と同じく data source で参照する。
- `google_artifact_registry_repository_iam_member`: リポジトリ `siorie` に `roles/artifactregistry.writer`
  （push と、`infra/app` の data source が使う get を含む）。
- `google_service_account_iam_member`: runtime SA `siorie-run` に `roles/iam.serviceAccountUser`
  （Cloud Run のリビジョンに runtime SA を載せるための `actAs` と、data source の get）。
- `google_project_iam_member`: `roles/run.admin`。`app` 層は `allUsers` の invoker binding も管理するので
  `run.developer` では足りない。サービス単位で付けると deployer が自分に付与する循環になるためプロジェクト単位。

### `infra/app/`

- 変更なし。前提作業の import ブロック削除だけ。

### `infra/justfile`

- 変更なし。ワークフローは既存 recipe を呼ぶ。`apply layer *args` がコマンド行をエコーする点は、secrets の
  自動マスクに任せる（`set -x` は使わない）。

## GitHub 側

- Environment `production` を作り、deployment branch policy を `main` のみにする。secrets を Environment に置く:
  - `GOOGLE_CLIENT_ID`: OAuth Web クライアント ID。ビルド時と apply 時の両方に流す。
  - `APP_ORIGIN`: Cloud Run サービスの実 URL（`just infra/output app` の `cloud_run_url`）。
- `.github/workflows/deploy.yml`:
  - `on: workflow_dispatch`（inputs なし）。
  - `permissions: { id-token: write, contents: read }`。
  - `concurrency: { group: deploy, cancel-in-progress: false }`。
  - `jobs.deploy`: `runs-on: ubuntu-latest`、`environment: production`。
  - WIF プロバイダ名と deployer SA のメールは非秘密なので、ワークフローの `env:` にリテラルで置く。
  - ステップは「全体像」のとおり。`google-github-actions/auth` は credential file を書き出し
    `GOOGLE_APPLICATION_CREDENTIALS` と `CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE` を export するので、
    mise で入れた `gcloud` と `terraform`（google provider）がそのまま認証を拾う。
    `docker-credential-gcloud` は gcloud SDK に同梱され PATH に載る。

## ローカル経路との関係

- `just` recipe は変えないので、ワークステーションからのデプロイ手順は従来どおり残る。CI はそれを包んだだけ。
- CI は常に main の HEAD をビルドして出す。**ロールバックはローカル経路のまま**
  （`just infra/apply app -var image_tag=<古い sha> …`）。CI 経路で戻すなら revert コミットを積んで dispatch する。
- 同じコミットを二度 dispatch しても、`docker push` は同内容でタグを上書きし、`image_tag` が変わらないので
  Terraform は差分なしで終わる。冪等。

## 0003 と 0026 の扱い

- **0003**: この提案の decision をもって「GitHub Actions + WIF」で決着とし、`/decide` の時点で 0003 の status を
  `decided` に変え、decision へリンクする。0003 の proposal.md は当時の記録として変更しない。
- **0026**: CI 経路では `image_tag` が自動決定、`google_client_id` / `app_origin` が secrets に集約されて摩擦が消える。
  ローカルの `-var` 三つの摩擦はそのまま残るので status は `open` のまま。

## 今回の作業と導通確認（worklog 向け）

0. 前提作業: `infra/prod/` 退役の follow-up コミット（`state rm` 済みを確認 → ディレクトリ削除 →
   `infra/app/main.tf` と `infra/platform/main.tf` の import ブロック削除 → `.gitignore` の `prod` 行削除 →
   `platform` / `app` の再 plan が差分なし）。
1. `infra/bootstrap/` に WIF プール、プロバイダ、`workloadIdentityUser`、バケット条件付き付与、output を追加。
   ローカルで apply し、更新された `terraform.tfstate` をコミット。
2. `infra/platform/` に deployer の data source と三つのロール付与を追加。ローカルで apply。
3. GitHub で Environment `production` を作成、branch policy を main に限定、二つの secrets を登録。
4. `.github/workflows/deploy.yml` を追加してコミット。
5. main から dispatch。全ステップが緑で、Cloud Run に新しいリビジョンが乗り、ブラウザからサインインが通ること。
6. 検証: `bootstrap` / `platform` の再 plan が差分なし。main 以外のブランチに同じワークフローを置いて dispatch すると
   認証ステップで落ちること（可能なら）。deployer の資格情報で `platform` の state が読めないこと（任意）。
7. docs: `docs/design/repository-structure.md` の「no CI/CD automation」「built and pushed by hand」を書き換える。
   `README.md` にデプロイ手順（dispatch の仕方、初回セットアップ）を書く。

## この提案が可能にすること（次のトピックへの入力）

- push トリガーの自動デプロイ: `on: push: branches: [main]` を足すだけ。WIF 条件とゲートは共通。
- push / PR の通常 CI: `just check` の部分を切り出して別ワークフローにする。deployer の権限は不要。
- 0026 のローカル側: CI が主経路になれば、ローカルの `-var` 三つを「例外的なロールバック手順」として許容する
  選択肢が現実味を持つ。

## 検討したが採用しなかった案

- **Direct WIF（SA を介さない）。** 部品が一つ減り Google の現在の推奨だが、0011 で記録した方向を覆し、
  bootstrap で作った deployer SA が無意味になる。IAM と監査ログで identity が安定する SA 経由を採る。
- **deployer 関連をすべて bootstrap に集める。** platform を無変更にできるが、bootstrap が「ほぼ変えない層」で
  なくなり、AR リポジトリや runtime SA への越境参照が bootstrap に入る。
- **deployer 関連をすべて platform に置く。** バケットと deployer SA が bootstrap 資源なので越境参照が逆向きに増える。
- **`google_client_id` / `app_origin` を `infra/app/terraform.tfvars` にコミットする。** 0026 を閉じられるが、
  リポジトリに値を置かない方針を崩す。
- **GitHub repository variables に置く。** public ログでマスクされない。secrets にする。
- **`app_origin` をワークフロー内で `gcloud run services describe` から取得する。** secret が一つ減るが、
  初回デプロイ前はサービスが無く、入力元が分散する。
- **build / push と apply を別ワークフローに分ける。** 手動運用では一本の方が短く、`image_tag` の受け渡しも要らない。
- **push / PR の通常 CI を同時に扱う。** PR 時の権限、キャッシュ、所要時間など独立した検討があるため別 discovery。
- **Environment の required reviewers で apply 前に承認を挟む。** 一人運用では dispatch が承認と同義。
- **`docker/build-push-action` と buildx の GHA キャッシュ。** ローカルと CI で経路が分かれる。ビルド時間が問題に
  なってから検討する。
- **Go / Node / Terraform を個別の `setup-*` action で入れる。** `mise.toml` が版の単一情報源なので `jdx/mise-action`。
- **Terraform 変数に `sensitive = true` を付ける。** GitHub のマスクで足りる。ローカルの plan 出力まで隠す必要はない。
- **push トリガーの自動デプロイを最初から入れる。** discovery が「まずは手動」と明言。
- **ハイブリッド構成／`gcloud builds submit`／Cloud Build。** 0003・0023 で除外済み。

## 未解決・リスク

1. **バケットの条件付き付与と `storage.objects.list`。** Terraform の GCS backend がバケット単位の list 権限を要求する
   場合、オブジェクト名条件付きの binding では弾かれる。worklog で `init` / `plan` / `apply` を実際に通して確認し、
   駄目なら list を含む最小ロールだけ無条件で追加する。それでも `platform` state の読み書きは条件で塞げる。
2. **`mise.toml` の `latest` ピン。** ゲートの `just check` はランナー上で Go / Node / pnpm を `latest` で解決するので、
   実行のたびに版が変わり得る。デプロイ成果物は Dockerfile 側のピン（`golang:1.27`、`node:24`）で決まるため、
   影響はゲートの安定性だけ。ゲートが理由不明で落ちたら最初に疑う。
3. **`just check` の所要時間。** Firestore エミュレータの起動、`pnpm install`、Go / Web のビルドを Docker の外でも
   走らせるので、イメージビルドと合わせて二重にビルドする。public リポジトリなので課金はないが、一回の dispatch が
   数分かかる。
4. **`APP_ORIGIN` secret の陳腐化。** Cloud Run サービスを作り直して URL が変わると secret も更新が要る。
   ずれると `Origin` 検証で state-changing な `/api/*` が全部 403 になる（0025 と同じ症状）。
5. **credential helper の解決。** `gcloud auth configure-docker` が書く `~/.docker/config.json` を ubuntu ランナーの
   Docker が拾い、`docker-credential-gcloud` が PATH にある必要がある。落ちたら `justfile` に書いてある
   `docker login -u oauth2accesstoken` へ切り替える。
6. **プロジェクト番号が bootstrap の state とワークフローに載る。** 非秘密だが、Cloud Run の legacy-hash URL とは
   別物なので露出が増えるわけではない。

## 参考資料

- [google-github-actions/auth](https://github.com/google-github-actions/auth)
- [Workload Identity Federation with deployment pipelines (GitHub Actions)](https://cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines)
- [GitHub: About security hardening with OpenID Connect](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
- [GitHub: Using secrets in GitHub Actions（マスクの仕組み）](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions)
- [GitHub: Managing environments for deployment](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-deployments/managing-environments-for-deployment)
- [Terraform GCS backend](https://developer.hashicorp.com/terraform/language/backend/gcs)
- [Cloud Storage: IAM Conditions](https://cloud.google.com/storage/docs/access-control/using-iam-conditions)
- [jdx/mise-action](https://github.com/jdx/mise-action)
