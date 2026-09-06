# 議事録

## 前提確認

- `discovery.md` に frontmatter がなかったため内容から補った（`date: 2026-09-04` /
  `tags: [infra, iac, terraform, deploy, cicd, github-actions]` / `status: open`）。本文は変更していない。
  ディレクトリ名を `0029-github-actions-manual-deploy` にリネームした。
- 関連文書を確認した。
  - [0003 CI/CD service selection](../0003-cicd-service-selection/proposal.md)（proposed）: Cloud Build 採用を撤回し、
    サービス選定は IaC・デプロイ設計の後続へ保留。ハイブリッド（Actions でトリガー、Cloud Build で build）は除外済み。
    0022 で「GitHub Actions + Workload Identity Federation の方向」を決定ではなく方向として記録
    （[decision 0011](../../decisions/0011-terraform-iac-layout.md)）。0023 では「この回を 0003 の受け皿にする案」を
    スコープ超過で見送っている。**0029 が 0003 の受け皿そのもの**である。
  - [0022 の minutes](../0022-terraform-gcp-bootstrap/minutes.md): 「deployer SA へ想定ロールを今から付与する案」と
    「deployer SA を impersonation で使う案」は「CI/CD トピックまで待つ」として見送り。今がその時点。
  - [0026 infra per-deploy inputs](../0026-infra-per-deploy-inputs/discovery.md)（open）: `-var` 三つの摩擦。候補の一つが
    「CI/CD が入るまで現状を許容する。CI ではビルドした sha を明示的に渡すので CLI 渡しの形が活きる」だった。
  - [decision 0014](../../decisions/0014-infra-deploy-layers-and-firestore.md) の rationale: 層の分割は
    「CI/CD が `app` に絞った identity を持ち、`platform` は人間専用のまま残す」ことを見込んだもの。
- 現状: `.github/` は存在しない（通常 CI もない）。`infra/bootstrap/` は `sts` / `iamcredentials` を有効化済みで、
  休眠 `deployer` SA が state に載っている。state バケットは uniform bucket-level access（条件付き IAM が使える）。
  `infra/prod/` の退役（`state rm`、ディレクトリ削除、`infra/app/main.tf` の import ブロック削除）は未完。
  リポジトリは GitHub 上で public。
- 過去に見送られた案で今回に関わるもの: ハイブリッド構成（0003 で除外）、`gcloud builds submit`（0023 で見送り）。
  どちらも再導入しない。Actions ランナー上で `docker build` する前提。

## 前提への指摘

- **「WIF プール ＋ deployer へのロール付与」という前提。** WIF には SA を介さない Direct WIF
  （プールの principal に直接ロールを付ける）があり、Google は現在そちらを推奨している。Cloud Run、Artifact Registry、
  GCS、IAM はいずれも直接 principal に対応するため、休眠 deployer SA を使わない選択も成立する（→ 論点 2）。
- **「`platform` は人間専用のまま残せるか」。** ロール付与を `app` 層の範囲に絞れば残せるが、state バケットが一つなので
  deployer に素直にバケット権限を与えると `platform` の state も書けてしまう。守るならバケット IAM に `app/` プレフィックス
  条件を付けるか、バケットを分ける必要がある（→ 論点 3）。
- **前提となる未完了作業。** `infra/prod/` の退役が残っている。import ブロックは再 apply では no-op なので CI は壊れないが、
  CI が最初に触る apply がこれを抱えたままなのは避けたい。
- **CI が無い。** `workflow_dispatch` で main の HEAD をそのまま出すと、テストを一度も通していないコミットが本番に出られる
  （→ 論点 1）。
- **GitHub repository variables は公開ログでマスクされない。** public リポジトリでは Actions の実行ログを誰でも読める。
  `vars` は `just infra/apply app -var google_client_id=…` のコマンド行や `terraform plan` の差分にそのまま出る。
  `secrets` なら GitHub が自動でマスクする（→ 論点 4）。

## 論点 1: ワークフローの範囲

- 質問: 一つの `workflow_dispatch` で「`just check` → イメージ build/push → `infra/app` apply」まで一気に回すか、
  build/push と apply を別ワークフローに分けるか。push や PR で `just check` だけ走らせる通常の CI をこの討議に含めるか。
- 採用: **一本で回し、`just check` をゲートにする。通常 CI（push / PR）は別 discovery。**

## 論点 2: デプロイ主体

- 質問: 案 A「休眠 deployer SA を WIF 経由（impersonation）で使う」か、案 B「Direct WIF で SA を使わず、deployer SA は
  休眠のまま残す」か。
- 採用: **案 A。** 0011 で記録した方向どおりで、SA が既に存在し、IAM と監査ログで identity が安定する。
- 不採用: 案 B。部品が一つ減るが、記録済みの方向を覆し、bootstrap で作った deployer SA が無意味になる。

## 論点 3: WIF とロール付与の置き場所

- 質問: `bootstrap` にプール、プロバイダ、deployer への `roles/iam.workloadIdentityUser`、state バケットの `app/`
  プレフィックス条件付き付与（バケットは bootstrap の資源）。`platform` に AR リポジトリへの
  `roles/artifactregistry.writer`、runtime SA への `roles/iam.serviceAccountUser`、プロジェクトレベルの
  `roles/run.admin`。対案は「deployer 関連をすべて bootstrap に集める」。
- 採用: **提案どおりの分割。** bootstrap が「誰が deployer になれるか」と state の入口、platform が「deployer が何に
  触れるか」を持つ。
- 不採用: 全部 bootstrap（platform を無変更にできるが、bootstrap が「ほぼ変えない層」でなくなり、AR リポジトリや
  runtime SA への越境参照が bootstrap に入る）。全部 platform（バケットと deployer SA が bootstrap 資源なので、
  越境参照が逆向きに増える）。

## 論点 4: 三つの値の渡し方

- 質問: `image_tag` はワークフローがビルドしたコミットの sha そのものなので入力不要。残る `google_client_id` と
  `app_origin` を、案 (i)「`infra/app/terraform.tfvars` にコミットし、`-var` は `image_tag` だけにする（0026 の第一候補で、
  0026 を閉じられる）」か、案 (ii)「GitHub 側に置き、ローカルは従来どおり `-var` で渡す」か。
- 回答: **(ii)。公開情報だが、秘密を維持したい**（リポジトリに値を置かない方針を続ける）。
- 指摘と修正: (ii) を `vars` で実装すると public ログに値が出る。**`secrets` に置く**ことで合意。
- 不採用: (i)。0026 をここで閉じられるが、リポジトリに値を置かない方針を崩す。

## 論点 5: デプロイできるブランチと Environment

- 質問: `workflow_dispatch` は任意ブランチから起動できる。WIF の attribute condition を `repository` に加えて
  `ref == refs/heads/main` まで絞るか。GitHub Environment `production` を作って secrets をそこに置き、deployment branch
  policy を main に限定するか。
- 採用: **main 限定、Environment あり。** main 以外からの起動は STS の認証で落ちる。Environment により GitHub の
  Deployments 画面に履歴が残る。

## 論点 6: `app_origin` の出所

- 質問: secrets に置く（`GOOGLE_CLIENT_ID` と同列）か、ワークフロー内で `gcloud run services describe` を叩いて毎回
  取り直すか。
- 採用: **secrets。** 入力が一か所に揃う。
- 不採用: 実行時取得。secret が一つ減るが、初回デプロイ前はサービスが無く取れず、入力元が分散する。

## 質問にせず前提として置いたもの（異議なし）

- ワークフローは既存の `just` recipe の薄いラッパー。`just check` → `just infra/docker-auth` →
  `just infra/publish-image` → `just infra/apply app -auto-approve`。ローカルと CI で同じ経路を通す。
- `concurrency` グループで apply の並走を防ぐ。承認ゲートは置かず、dispatch 自体を承認とみなす。
- `infra/prod/` の退役と import ブロック削除は、この worklog の前提作業として先に済ませる。
- 0003 はこの討議の decision をもって閉じる。0026 は CI 経路だけ解消され、ローカルの `-var` 摩擦は残るので open のまま。

## 検討したが採用しなかった案（まとめ）

- **Direct WIF（SA なし）。** 論点 2。記録済みの方向と既存の deployer SA を活かす方を選んだ。
- **deployer 関連をすべて bootstrap に集める案／すべて platform に置く案。** 論点 3。
- **`google_client_id` / `app_origin` を `terraform.tfvars` にコミットする案。** 論点 4。リポジトリに値を置かない方針を維持。
- **GitHub repository variables に置く案。** 論点 4。public ログでマスクされないため secrets に変更。
- **`app_origin` をワークフロー内で `gcloud run services describe` から取得する案。** 論点 6。
- **build/push と apply を別ワークフローに分ける案。** 論点 1。手動運用では一本の方が手順が短く、`image_tag` の受け渡しも不要。
- **push / PR の通常 CI を同じ討議で扱う案。** 論点 1。デプロイと独立した検討（PR 時の権限、キャッシュ、所要時間）が
  あるため別 discovery へ。
- **Environment の required reviewers で apply 前に承認ゲートを置く案。** 一人運用では dispatch が承認と同義。
- **`docker/build-push-action` と buildx の GHA キャッシュを使う案。** ローカルと CI で経路が分かれる。まず `just` recipe の
  再利用で通し、ビルド時間が問題になってから検討する。
- **Go / Node / Terraform を個別の `setup-*` action で入れる案。** `mise.toml` が版の単一情報源なので `jdx/mise-action` で
  そのまま使う。
- **Terraform 変数に `sensitive = true` を付ける案。** GitHub のマスクで足りる。ローカルの plan 出力まで隠す必要はない。
- **push トリガーでの自動デプロイ。** discovery が「まずは手動」と明言。条件は整うので後続で足せる。
- **ハイブリッド構成／`gcloud builds submit`／Cloud Build。** 0003・0023 で除外済み。再導入しない。

## 残る懸念（提案に書き込む）

- state バケットの `app/` プレフィックス条件付き付与で、Terraform GCS backend が必要とする `storage.objects.list`
  （バケット単位の権限）が弾かれる可能性。worklog で `init` と `plan` を実際に通して確認し、駄目なら list だけ
  無条件で付与する。
- `mise.toml` の `latest` ピン。`just check` のゲートはランナー上で Go や Node を `latest` で解決するため、実行のたびに
  版が変わり得る。デプロイ成果物は Dockerfile 側のピンで決まるので、影響はゲートの安定性だけ。

## 結論

- `.github/workflows/deploy.yml` を `workflow_dispatch` のみで追加。main 限定。`just check` → build/push → `app` apply を一本で回す。
- 認証は GitHub OIDC → WIF → deployer SA（impersonation）。SA キーは作らない。
- bootstrap にプール、プロバイダ、`workloadIdentityUser`、state バケットの `app/` 条件付き付与。platform に AR writer、
  runtime SA への `serviceAccountUser`、プロジェクトの `run.admin`。
- `GOOGLE_CLIENT_ID` と `APP_ORIGIN` は GitHub Environment `production` の secrets。`image_tag` はビルドしたコミットの sha。
- 前提作業として `infra/prod/` を退役する。0003 は閉じ、0026 は open のまま。
