# 議事録

`discovery.md`（デプロイ向け Terraform IaC の土台づくり）をもとに、ディレクトリ構成・
state 保存方式・bootstrap 層の範囲・今回 apply するスコープを詰めた。

## 事前確認

- `discovery.md` に frontmatter がなかったため内容から推定して補った
  （`date: 2026-08-30` / `tags: [infra, iac, terraform, deploy, cicd]` / `status: open`）。
  本文は変更していない。ディレクトリ名も `0022-terraform-gcp-bootstrap` にリネームした。
- 過去の discussions・decisions・design を確認した。このトピックは、明示的に先送りされた
  2 件の受け皿である。
  - [0001 purpose and initial tech stack](../0001-purpose-and-initial-tech-stack/proposal.md)（decided）:
    GCP の目標構成（単一本番プロジェクト / Cloud Run `asia-northeast1` min0 max1 /
    Firestore `(default)` / Artifact Registry / SA 分離 / 予算アラート / SA キーを発行しない /
    Secret Manager は初期不使用）は確定済み。ただし「Terraform で管理するリソースの範囲と
    state の保存方法はインフラ設計の後続トピックで決める」と明記していた。
  - [0003 CI/CD service selection](../0003-cicd-service-selection/proposal.md)（proposed）:
    Cloud Build 採用を撤回し、「CI/CD サービス選定（Cloud Build か GitHub Actions か）は
    IaC・デプロイ設計の後続トピックで決める」と明記していた。比較観点（トリガー所在 /
    認証方式 SA vs Workload Identity Federation / コスト / PR 検証）は洗い出し済み。
    ハイブリッド構成は検討対象から除外済み。
- 同じ案を過去に検討して見送った、というものは今回なし。むしろ上記 2 件をここで決める立場。
- リポジトリに Terraform / Dockerfile / cloudbuild 定義は皆無。`mise.toml` に `terraform`
  `gcloud` は既にピン済み。`.gitignore` は `.local/` と `apps/*/.env` を除外。

## 前提への指摘

- `discovery.md` の回答で「bootstrap で deployer SA を作る」となったが、これは 0001 の
  「ユーザー管理の SA キーを発行しない」と、0003 で保留中の CI/CD 方式選定に直接触れる。
  → SA は今回作るが休眠（ロール付与なし）とし、ローカル apply は実行者自身の ADC で行う、
  という形で整理した。SA キーは作らない。

## 質問と回答

### ラウンド 1

1. **Terraform state の保存方式**（0001 で先送りされた論点。bootstrap は「state バケットを
   作る層」になるため卵と鶏の問題が出る）
   → bootstrap はローカル state をリポジトリにコミット、prod は GCS backend。
2. **GCP プロジェクトと bootstrap 層の範囲**
   → プロジェクトは手動作成済み。bootstrap は「API 有効化＋state バケット＋deployer SA」。
      prod 層に Cloud Run / Artifact Registry / Firestore DB / runtime SA / IAM / 予算アラート。
3. **この提案で実際に apply する範囲**
   → ディレクトリ全体を設計し、bootstrap 層だけ実装・apply。prod 層は次の worklog。

### ラウンド 2

1. **休眠 deployer SA をローカル apply でどう扱うか**（0001 の SA キー禁止との整合）
   → 今は休眠。ローカル apply は自分の ADC（`gcloud auth application-default login`）で行う。
      deployer SA は bootstrap で作成だけしておき、実際に使うのは将来の CI/CD トピックから。
2. **0003 で保留中の CI/CD 方式の方向性をこの提案で記録するか**
   → GitHub Actions + Workload Identity Federation 方向として記録する。bootstrap はその
      WIF プール／deployer SA バインディングを後から足す前提で設計。実際の WIF 設定と
      ワークフロー作成は別トピック。
3. **ディレクトリ構成**（decision 0001 の「実需要が出るまで投機的な構造を作らない」方針）
   → `infra/bootstrap/` ＋ `infra/prod/` のフラット構成。`modules/` も `environments/` も
      作らない。

### ラウンド 3

1. **今回の「導通確認」の範囲**
   → prod スケルトン（providers ＋ GCS backend ブロックのみ、リソース 0 個）も作り、
      `terraform init` がバケットに通り `plan` が空、までを今回の導通確認に含める。
2. **bootstrap の tfvars と provider lock ファイルの Git 扱い**
   → `terraform.tfvars`（`project_id`, `region` の非機密値のみ）も `.terraform.lock.hcl` も
      そのままコミット。`.terraform/` と `infra/prod/` のローカル state 系は gitignore。
3. **休眠 deployer SA への IAM ロール付与を今回行うか**
   → 識別子だけ作成し、ロール付与は prod 層 / CI/CD トピックで行う。
4. **ローカル実行の入口（justfile / mise）**
   → `infra/justfile`（`plan` / `apply` の薄い recipe）を追加し root から辿れるようにする。
      `mise.toml` の `terraform = "latest"` を exact バージョン指定に変更（0001 の再現性方針）。

## 検討したが採用しなかった案

- **bootstrap の state もリポジトリに置かず gitignore する案。** bootstrap を冪等・再実行可能に
  保ち、state は手元のみ（消えても import で復旧）とする案。採らなかった理由は、コミットして
  おく方が「本番に何が存在するか」の記録が残り、卵と鶏の回避としても素直なため。bootstrap の
  state は有効化 API・バケット・SA 識別子だけで機密を含まない。
- **すべてローカル state（当面 backend を使わない）案。** 1 人・ローカル apply のみなら
  オーバースペックという判断もあり得たが、prod は最初から GCS backend にしておく方が、
  将来 CI/CD を足すときの移行コストが小さい。
- **state バケットを Terraform 管理外（gcloud/gsutil で先に作成）とし、bootstrap 含む全層を
  最初から GCS backend にする案。** バケットのライフサイクル（versioning、`prevent_destroy`、
  クリーンアップ）も IaC で残したいので、bootstrap に含めた。
- **GCP プロジェクト作成も Terraform（bootstrap）に含める案。** `google_project` で
  プロジェクト自体を作る。請求先アカウント ID と、組織／フォルダの有無の扱いが絡み、個人
  アカウントで組織なしの場合の制約もある。プロジェクトは手動作成済みとして、Terraform は
  プロジェクト内リソースに限定する方が単純と判断した。
- **bootstrap を「API 有効化＋state バケット」のみとし SA を一切作らない案。** CI/CD 用 ID は
  方式が決まってから別トピックで足す、という切り方。deployer SA の識別子だけは先に確保して
  おいても害がなく、WIF 方向を記録する以上、識別子を bootstrap に置く方が一貫すると判断した。
- **bootstrap に加え prod 層も「定義まで」やる案／bootstrap と prod 両方を今回 apply して
  デプロイ導通まで見る案。** 前者は plan が通る prod 層を今回書く、後者はコンテナビルドと
  Cloud Run 初回デプロイ、run.app URL でアプリが開くところまでを今回のゴールにする案。
  discovery が「bootstrap 的な定義、apply、導通確認」までを求めており、prod 実リソースの
  設計（Firestore の import 可否、runtime SA の権限範囲、予算リソースなど）は独立した検討量が
  あるため、今回は bootstrap のみ実装・apply とし、prod はスケルトンで backend 導通だけ見る。
- **今から deployer SA を impersonation で使う案（キーなし）。** `--impersonate-service-account`
  で本番と同じ権限境界から apply できるが、`roles/iam.serviceAccountTokenCreator` の付与など
  初期設定が増える。ローカル・1 人の段階では自分の ADC で十分と判断した。
- **想定デプロイロールを今から deployer SA に付与しておく案。** prod 層作成時の変更を減らせるが、
  prod 層がまだ無く使われもしない権限を先に持たせることになる。付与は prod 層 / CI/CD トピックに
  寄せる。
- **CI/CD の方向性を保留したまま、deployer SA を方式非依存の汎用 SA として作る案／Cloud Build
  方向に戻す案。** 0003 で public リポの GitHub Actions は実行時間が実質無制限・認証はキーレス
  （WIF）という比較結果が出ており、その線で方向を記録する方が後続の設計判断がぶれない。決定
  ではなく提案時点の方向として書く。
- **ディレクトリを `terraform/` ルートにする案／最初から `infra/environments/` ＋
  `infra/modules/` を用意する案。** 前者は名前の好みの差。後者は staging 追加やモジュール化を
  見越した構造だが、decision 0001 の「実需要が出るまで投機的な構造を作らない」方針に反する。
  `infra/bootstrap/` ＋ `infra/prod/` のフラット 2 root module とし、再利用や 2 つ目の環境が
  実際に出てから切り出す。
- **`.env` パターンに合わせ `terraform.tfvars.example` だけコミットし実体は gitignore する案。**
  bootstrap の tfvars は `project_id` と `region` のみで機密がなく、bootstrap state を
  コミットする以上その値は結局 state に載る。実体をそのままコミットする方が単純。
- **`infra/justfile` を追加せず terraform を直接叩く案／mise は `latest` のまま。** justfile を
  単一の入口とする方針と、0001 のビルド再現性方針に合わせ、薄い recipe 追加と terraform の
  exact ピンを行う。

## 結論

- `infra/bootstrap/` ＋ `infra/prod/` のフラット構成。
- bootstrap: ローカル state をコミット。必要 API の有効化、GCS state バケット
  （`asia-northeast1`・versioning・`prevent_destroy`）、休眠 deployer SA（ロール付与なし）。
- prod: GCS backend のスケルトンのみ（リソース 0 個）。実リソースは次の worklog。
- ローカル apply は実行者の ADC。SA キーは作らない。
- 将来の CI/CD は GitHub Actions + Workload Identity Federation 方向、と proposal に記録
  （決定ではない）。
- `infra/justfile` を追加し root から辿れるようにする。`mise.toml` の terraform を exact ピンに
  変更。
- 今回の導通確認: bootstrap の apply 成功、対象 API 有効、バケット versioning 付きで存在、
  bootstrap 再 plan が差分なし、prod スケルトンが GCS backend に init でき plan が差分なし。
