# デプロイ向け Docker イメージのビルド・push 経路と Artifact Registry

## ステータス

提案。決定ではない。提案時点での方針をまとめたもの。

将来のデプロイに向けて、コンテナイメージを Artifact Registry へ載せるところまでの経路を用意する。
Terraform で Artifact Registry リポジトリを管理し、`infra/Dockerfile` と `infra/justfile` の
recipe でローカルからビルド・push する。Cloud Run 以降の実デプロイと CI/CD 自動化は後続に送る。

## 背景

- [0001 purpose and initial tech stack](../0001-purpose-and-initial-tech-stack/proposal.md)（decided）:
  SPA ビルド成果物を Go コンテナに同梱し、SPA と API を同一 Cloud Run サービスから同一オリジンで
  配信する、コンテナは `asia-northeast1` の Artifact Registry へ保存する、古いイメージはクリーンアップ
  ポリシーで無料枠内に収める、という目標像は確定済み。実現手順（Dockerfile、ビルド経路、レジストリ
  リソース）は未着手。
- [0003 CI/CD service selection](../0003-cicd-service-selection/proposal.md)（proposed）:
  Cloud Build 採用は撤回され、CI/CD サービス選定は保留中。本提案はそれを解決しない。ローカルからの
  `docker` によるビルド・push に限定し、GitHub Actions + Workload Identity Federation を含む自動化は
  別トピックのまま。
- [0011 Terraform IaC layout](../../decisions/0011-terraform-iac-layout.md)（accepted）:
  `infra/bootstrap/` は apply 済み（API 有効化、`siorie-tfstate` バケット、休眠 `deployer` SA）。
  `infra/prod/` は GCS backend のスケルトンでリソース 0 個。本提案の Artifact Registry リポジトリが
  `infra/prod/` で最初の実リソースになる。`artifactregistry.googleapis.com` は bootstrap で有効化済み。
- 現時点でリポジトリに Dockerfile・`.dockerignore`・コンテナ関連の recipe は無い。Go サーバーは
  `/api/*` のみを扱い、静的ファイル配信は未実装。

## 前提

- スコープは「イメージが Artifact Registry に載る」まで。Cloud Run サービス、runtime SA と IAM、
  Firestore `(default)` データベース、予算・予算アラート、Cloud Monitoring は対象外。
- ビルドと push はローカル実施者が実行する。実行のタイミングは人間が決めるが、recipe はビルドから
  push まで一気通貫で自動化する。
- ビルドは実施者のマシンの Docker デーモンで行う（`docker build` + `docker push`）。Cloud Build は
  使わない。
- GCP への認証は実施者自身の資格情報（ADC もしくは同等の短命 OAuth トークン、および
  `gcloud auth configure-docker` による Docker 認証）。サービスアカウントキーは発行しない（0001 準拠）。
- 環境は本番のみ。
- Go バイナリからの SPA 同梱配信、`/api/*` 以外の不明パスの SPA フォールバック、アセットの
  キャッシュヘッダは、本提案の対象外（別 discovery）。今回のイメージは Go バイナリのみを含む。

## Artifact Registry リポジトリ（Terraform）

`infra/prod/` に `google_artifact_registry_repository` を追加する。

- `repository_id = "siorie"`、`format = "DOCKER"`、`location = "asia-northeast1"`。
- 完全なイメージ参照は `asia-northeast1-docker.pkg.dev/siorie/siorie/app:<git-sha>`。
  `siorie` が project ID と repository ID で重複するが、AR のパスは必ず project ID を含むため
  よくある形であり、実害はない。image 名は `app`（API 専用ではなく、将来 SPA を同梱するため）。
- **クリーンアップ**: KEEP ポリシー 1 本のみを置く。

  ```hcl
  cleanup_policy_dry_run = true

  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 2
    }
  }
  ```

  - AR の cleanup policy は KEEP 単体では何も削除しない（KEEP は DELETE から守る例外指定）。
    「最新 2 世代だけ残して他を消す」を実際に効かせる DELETE ポリシー（全件マッチ）は後続に送る。
  - `cleanup_policy_dry_run = true` を明示し、「まだ実削除はしない」ことを分かるようにする。
    DELETE ポリシーを足す回で `false` にする。
  - デプロイが無い間はイメージがほぼ増えず、AR 無料枠（0.5 GB／distroless の Go イメージは数十 MB）に
    十分収まるため、今回は retention の意図表明だけ先に置く。
- `depends_on` かコメントで、`artifactregistry.googleapis.com` が bootstrap 側で有効化されている
  前提を明示する（0022 で挙がった「prod 層だけ読むと API 依存が見えない」への補い）。

`infra/prod/` の apply はこれが初の実リソース作成になる。state は `gs://siorie-tfstate/prod/`。

## Dockerfile（`infra/Dockerfile`）

アプリコードではなくデプロイ機構として `infra/` に置く。build context はリポジトリルートで、
recipe は常に `docker build -f infra/Dockerfile <repo-root>` の形で呼ぶ（素の `docker build .` は
使わない前提）。

マルチステージ:

- **builder**: `golang:1.27-bookworm`（`apps/api/go.mod` の `go 1.27.0` に合わせる）。
  `apps/api/go.mod` / `go.sum` を先にコピーして `go mod download`、その後ソースをコピーし、
  `CGO_ENABLED=0 GOOS=linux go build -o /server ./cmd/server` で静的バイナリを作る。
- **最終**: `gcr.io/distroless/static-debian12:nonroot`。
  - CA 証明書を含む（Firestore／Google API の TLS に必要）。shell 無し、非 root（UID 65532）で実行。
  - `COPY --from=builder /server /server`、`ENTRYPOINT ["/server"]`。
  - `EXPOSE 8080` は記載してよい（Cloud Run は `PORT` を注入するので必須ではない）。
- タイムゾーンデータは含まれない。現状アプリは UTC のみで問題ないが、将来ローカルタイム整形を
  入れるなら `import _ "time/tzdata"` が要る。
- builder イメージはタグピン（`golang:1.27-bookworm`）とする。0001 の再現性方針からは digest ピンも
  あり得るが、今回はタグで進める。

今回のイメージは Go バイナリのみを含み、静的配信はしない。env（`GOOGLE_CLIENT_ID` /
`APP_ORIGIN` / `FIRESTORE_PROJECT_ID`）が無いと起動時に落ちるが、今回は「ビルドできて push できる」
ことだけを確認し、コンテナの起動・実行は確認しない。

## `.dockerignore`（リポジトリルート）

build context をリポジトリルートに取るため、無関係なものを除外する。少なくとも:

- `.git`（タグ用 SHA は recipe が context 外で算出するので不要）
- `node_modules` / `apps/web/node_modules`
- `apps/web/dist`
- `apps/api/bin`
- `**/.terraform` / `*.tfstate*` / `*.tfplan`
- `docs` / `.claude` / `.env` / `apps/*/.env`

## `infra/justfile` の recipe

ビルドから push まで一気通貫の recipe を 1 本追加する（例: `just infra/publish-image`）。
既存の `init` / `plan` / `apply` / `output` は層名を引数に取るが、この recipe は層を取らない。

- タグ: `git rev-parse --short=12 HEAD` の値。`:latest` は付けない。
- 作業ツリーが dirty でも中断しない（`<git-sha>` タグと中身がずれ得るが実施者責任）。
- 実行内容:
  `docker build -f infra/Dockerfile -t asia-northeast1-docker.pkg.dev/siorie/siorie/app:<sha> <repo-root>`
  → `docker push` 同参照。push 前に押す参照を echo する。
- 認証の便利 recipe（例: `just infra/docker-auth`）で
  `gcloud auth configure-docker asia-northeast1-docker.pkg.dev` を実行。`setup` には混ぜない。
- `mise.toml` は変更しない。Docker デーモンは mise 管理外。

root `justfile` からは just のクロスディレクトリ解決で辿れるようにする（`just infra/publish-image`）。

## 認証・事前手順（preflight）

worklog に preflight チェックリストとして明記する（0011 で「project は作成済みだが billing 未リンク」
の前提崩れが partial apply として顕在化した反省）。

- `terraform apply`（`infra/prod/`）: 実施者の ADC が要る。
  `gcloud auth application-default login` 済み、または `GOOGLE_OAUTH_ACCESS_TOKEN` を export。
- `docker push`: `gcloud auth configure-docker asia-northeast1-docker.pkg.dev` 済み、
  かつ `gcloud auth login` 済み（Docker credential helper が gcloud のユーザー資格情報を使う）。
- billing は 0011 でリンク済み（`billingEnabled: true`）。

## 今回の作業と導通確認

作業:

1. `infra/prod/` に `google_artifact_registry_repository`（＋ KEEP cleanup policy）を追加。
2. `infra/Dockerfile` を作成（マルチステージ、上記）。
3. リポジトリルートに `.dockerignore` を作成。
4. `infra/justfile` に publish 系 recipe と docker-auth 便利 recipe を追加。root から配線。
5. `infra/prod/` を `terraform plan` → `apply`。
6. recipe で `docker build` → `docker push` を実行。

導通確認（このラウンドの完了条件）:

- `infra/prod/` の `apply` が成功し、Artifact Registry リポジトリ `siorie` が `asia-northeast1` にできる。
- `infra/prod/` の再 `plan` が「No changes」。
- recipe が `docker build` → `docker push` まで成功する。
- `asia-northeast1-docker.pkg.dev/siorie/siorie/app:<sha>` が AR 上で確認できる
  （`gcloud artifacts docker images list`）。
- リポジトリに KEEP cleanup policy が設定されている（実削除は DELETE を足すまで発生しない）。

## この提案が可能にすること（次のトピックへの入力）

Artifact Registry に参照可能なイメージが 1 つあると、下流の IaC が着手できる。次のトピックで
扱うべき項目:

- Cloud Run サービス（Terraform）: どのイメージ `<sha>` を指すか（Terraform 変数で渡す／
  data source で解決する等）、min 0 / max 1、リクエストベース課金。
- runtime サービスアカウントと IAM（Firestore 読み書きの最小権限）。
- Firestore `(default)` データベース（既存なら `terraform import`）。
- コンテナへの設定供給: `GOOGLE_CLIENT_ID` / `APP_ORIGIN`（本番 run.app URL）/
  `FIRESTORE_PROJECT_ID` / `PORT`。Secret Manager は初期不使用（0001）。
- 予算・予算アラート、Cloud Monitoring。
- Go バイナリからの SPA 同梱配信、`/api/*` 以外の不明パスの SPA フォールバック、アセットの
  キャッシュヘッダ（別 discovery）。この設計が決まったら `infra/Dockerfile` は builder に web
  ビルド段を足し、`apps/web/dist` を最終イメージへコピーする形に拡張する。
- cleanup policy の DELETE ポリシー（全件マッチ）を足し、`cleanup_policy_dry_run = false` にする。
- CI/CD 自動化: GitHub Actions + Workload Identity Federation（0003 の受け皿トピック）。
  `:latest` を作らないため、ワークフローはビルドした `<sha>` を明示的に Cloud Run へ渡す。

## 未解決・リスク

- **手動運用の範囲**: ビルド・push は実施者が回す。実行のタイミングと、正しいコミットからビルドして
  いるかは実施者の責任。dirty-tree でも止めない。タグは可変なので、同一 `<sha>` を異なるツリー状態から
  push すると上書きされる。
- **KEEP のみの cleanup policy**: DELETE を足すまで実際の削除は起きない。デプロイ開始後にイメージが
  増え始めるので、DELETE ポリシー追加を Cloud Run のトピックと同時かそれ以前に行う。
- **`infra/prod/` 初の実 apply**: これまで backend 導通しか確認していない層に初めて実リソースを作る。
  state は `gs://siorie-tfstate/prod/`。apply には実施者の ADC が要る（未設定なら 0011 と同じく
  トークン代用になる）。
- **build context がリポジトリルート**: `.dockerignore` の網羅性が効いてくる。緩いと context が
  膨らみ、狭いと将来 web 同梱時に必要なファイルを取りこぼす。
- **builder イメージのタグピン**: `golang:1.27-bookworm` はタグ。同一タグの内容が更新され得る。
  再現性を厳密にするなら digest ピンへ移行する。
- **`infra/Dockerfile` の置き場所**: 素の `docker build .` が通らない（`-f` 必須）。IDE や外部ツールが
  repo ルートの Dockerfile を期待する場合に食い違う。

## 参考資料

- [Artifact Registry: cleanup policies](https://cloud.google.com/artifact-registry/docs/repositories/cleanup-policy)
- [Terraform: google_artifact_registry_repository](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/google_artifact_registry_repository)
- [Authenticating to Artifact Registry for Docker](https://cloud.google.com/artifact-registry/docs/docker/authentication)
- [distroless: gcr.io/distroless/static](https://github.com/GoogleContainerTools/distroless/tree/main/base)
- [Cloud Run: container runtime contract (PORT)](https://cloud.google.com/run/docs/container-contract)
- [0001 purpose and initial tech stack](../0001-purpose-and-initial-tech-stack/proposal.md)
- [0003 CI/CD service selection](../0003-cicd-service-selection/proposal.md)
- [0011 Terraform IaC layout](../../decisions/0011-terraform-iac-layout.md)
