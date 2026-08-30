# 議事録

`discovery.md`（デプロイに向けて Docker イメージを作成・アップロードする IaC）をもとに、
今回のスコープ、ビルド／push の実行方法、Artifact Registry リソースの範囲、Dockerfile の
置き場所とベースイメージ、タグとクリーンアップの方針を詰めた。

## 事前確認

- `discovery.md` に frontmatter がなかったため内容から推定して補った
  (`date: 2026-08-30` / `tags: [infra, iac, deploy, docker, cicd]` / `status: open`)。本文は変更していない。
  ディレクトリ名も `0023-container-image-build-and-push` にリネームした。
- 過去の discussions・decisions・design を確認した。
  - [0001 purpose and initial tech stack](../0001-purpose-and-initial-tech-stack/proposal.md)（decided）:
    SPA ビルド成果物を Go コンテナに同梱、SPA と API を同一 Cloud Run サービスから同一オリジンで配信、
    コンテナは Artifact Registry（`asia-northeast1`）へ保存、古いイメージはクリーンアップポリシーで削除、
    という目標像は確定済み。実現手順（Dockerfile、ビルド経路、レジストリリソース）は未着手。
  - [0003 CI/CD service selection](../0003-cicd-service-selection/proposal.md)（proposed）:
    Cloud Build 採用は撤回、CI/CD サービス選定は「IaC・デプロイ設計の後続トピックで決める」と保留。
    「GitHub Actions でトリガー、ビルド／デプロイは Cloud Build」のハイブリッドは検討対象から除外済み。
  - [0011 Terraform IaC layout](../../decisions/0011-terraform-iac-layout.md)（accepted）＋
    [worklog 0011](../../worklogs/0011-terraform-gcp-bootstrap/plan.md):
    `infra/bootstrap/`（API 有効化、`siorie-tfstate` バケット、休眠 `deployer` SA）は apply 済み。
    `infra/prod/` は GCS backend のスケルトンでリソース 0 個。`artifactregistry.googleapis.com` は
    有効化済み。ローカル apply の資格情報は実施者の ADC（worklog では未設定のまま OAuth トークンで代用）。
- 同じ案を過去に検討して見送った、というものは今回なし。ただし「Cloud Build を使う」形は 0003 で
  撤回済みであること、ハイブリッドは除外済みであることを共有した（後述の「採用しなかった案」）。

## スコープの絞り込み（質問と回答）

### ラウンド 1

1. **「IaC」の中身 ＝ ビルドと push を誰が実行するか** → 案 a。ローカル実施者が回すステップ。
   Terraform が持つのは Artifact Registry リポジトリのみ。
2. **スコープの境界** → 「イメージが Artifact Registry に載る」まで。Cloud Run・runtime SA・
   Firestore DB・予算・監視は対象外。
3. **Dockerfile と同梱配信をこの discussion で扱うか** → インフラ／レジストリ／recipe に限定。
   Go バイナリからの SPA 同梱配信、`/api/*` 不明パスの扱いと SPA フォールバックは別 discovery 送り。

### ラウンド 2

1. **ビルド実行方法**（`docker build` + `docker push` か `gcloud builds submit` か）→
   `docker build` + `docker push`。ローカル Docker デーモン、`gcloud auth configure-docker` で
   レジストリ認証、Cloud Build API は使わない。
2. **Dockerfile 不在との整合** → 案 (ii)。今回、最小 Dockerfile（Go バイナリのみ・静的配信なし）を
   置き、recipe が push まで実際に通ることを worklog の導通確認とする。
3. **クリーンアップ方式とタグ規約** → 「最新 N 世代を残す（keep most-recent）」。タグは `:<git-sha>` のみ、
   `:latest` は付けない。

### ラウンド 3

1. **Dockerfile の場所とベースイメージ** → `infra/` に置く（アプリ固有ではなくデプロイ機構なので）。
   build context はリポジトリルート、recipe は常に `-f infra/Dockerfile` で呼ぶ。
   ベースはベストプラクティスに従い、マルチステージ（builder `golang:1.27-bookworm` +
   `CGO_ENABLED=0`、最終 `gcr.io/distroless/static-debian12:nonroot`、`ENTRYPOINT ["/server"]`）。
2. **レジストリのパス** → 案 A。repository=`siorie` / image=`app` →
   `asia-northeast1-docker.pkg.dev/siorie/siorie/app:<sha>`。
   （B: `mitsuhitofujita/siorie/app` は AR の repository ID に `/` が使えず 4 階層になるため見送り。
   C: `containers/app` は重複も階層も避けられるが、A のままで実害なしと判断。）
3. **Docker 認証と dirty-tree の扱い** → `gcloud auth configure-docker asia-northeast1-docker.pkg.dev`
   は事前手順としてドキュメント化 ＋ `just` 便利 recipe。`setup` には混ぜない。
   dirty-tree ガードは設けず、作業ツリーの状態に関わらず build/push（タグは `git rev-parse --short=12 HEAD`、
   実施者責任）。`--force` フラグ不要。

### ラウンド 4（提案前の見直し）

エージェントから提案内容への違和感を洗い出し、以下を確認した。

1. **cleanup policy は KEEP 単体では削除されない**（KEEP は DELETE から守る例外指定）。
   → DELETE ポリシーは後からで良い。今回は KEEP `most-recent-versions`（`keep_count = 2`）だけ置く。
     DELETE を足すまで実際の削除は起きないが、イメージ増加はデプロイが無い間ほぼ皆無で、
     AR 無料枠に十分収まるため許容。
2. **「一世代前だけ」の解釈** → `keep_count = 2`（現行＋一つ前）。
3. **この回はイメージ生成が手動のまま**（discovery の「手動ではなく IaC として」との差）→
   この文脈では手動で良い。実施のタイミングは人間が決めるが、recipe は build から push まで一気通貫。
   「タイミングは手動、push まで自動」が意図通り。
4. **今回の成果物が薄い**（動かない Go 単体イメージが 1 個載るだけ）→
   Artifact Registry にイメージがあれば下流の IaC（Cloud Run 等）が動き出せる。
   その準備と、下流で必要になる検討項目の洗い出しが今回の施策の狙い。
5. **パス A の project/repo 名重複** → A で良い。
6. **`infra/prod/` の実 apply に実施者の ADC が要る**（0011 で詰まった箇所）→ preflight として明記。
7. **distroless `static` は tzdata なし** → 承知。UTC のみなら問題なし。
8. **builder イメージの digest ピン**（0001 の再現性方針）→ 承知。今回はタグピンで進める。
9. **`:latest` なし → 将来のデプロイ回は明示 `<sha>` 指定が必須** → 承知。

## 検討したが採用しなかった案

- **`gcloud builds submit` でサーバー側ビルド。** ローカルに Docker 不要で gcloud だけで完結するが、
  ビルドが Cloud Build 上で走る（Cloud Build API を使用・課金対象）。0003 で Cloud Build 採用は
  撤回済みで、単発ビルドとはいえ触れたくないため見送り。ローカル `docker build` + `docker push` とする。
- **この discussion を 0003 の受け皿（GitHub Actions + WIF）とする案。** WIF プール／プロバイダ、
  `deployer` SA へのロール付与、`.github/workflows/` まで一気にやる。範囲が大きく、discovery は
  「ビルドしてアップロードする」ところまでを求めている。CI/CD 自動化は別トピックのままとする。
- **Cloud Run サービス作成と初回デプロイまで今回に含める案。** run.app URL でアプリが開くところまで。
  Firestore の import 可否、runtime SA の権限範囲、env 供給、同梱配信の設計など独立した検討量があり、
  スコープを「イメージが AR に載る」までに切った。
- **Dockerfile を `apps/api/` に置く案。** API モジュールと同居させる。将来 `apps/web/dist` を同梱する
  時点で「API だけではない」ため、デプロイ機構として `infra/` に置く方が据わりが良いと判断した。
- **Dockerfile をリポジトリルートに置く案。** 素の `docker build .` 慣習には合うが、アプリコードと
  デプロイ機構を分けたい意図で `infra/` を選んだ。recipe が常に `-f` を渡すので慣習を外す実害は小さい。
- **レジストリパス B（`mitsuhitofujita/siorie/app`）／C（`containers/app`）。** B は AR の repository ID
  に `/` が使えず `siorie/mitsuhitofujita/siorie/app` の 4 階層になる。C は名前の重複も階層も避けられるが、
  A の `siorie/siorie/app` でも実害はなく（AR は必ず project ID を含む）、A のままとした。
- **`:latest` タグを併用する案。** floating tag があるとデプロイ時の参照は楽だが、`<sha>` 明示の方が
  何がデプロイされるか一意になる。`:latest` は付けない。
- **dirty-tree で build を止める案（`--force` でオプトアウト）。** `<sha>` タグと中身がずれ得るが、
  作業ツリーの状態に関わらず実施・実施者責任、とした。
- **cleanup policy を DELETE + KEEP のセットで今回完成させる案。** 「最新 2 世代だけ残して他は消す」を
  今回から効かせる。DELETE は後からで良いとの判断で、今回は KEEP のみ（実際の削除はまだ起きない）。
- **cleanup policy を一切置かず後続に丸投げする案。** 0001 がクリーンアップを求めており、KEEP の意図
  だけでも先に置いておく方が、DELETE を足すときに retention が決まっている。
- **`mise.toml` に Docker 系を追加する案。** Docker デーモンは mise 管理外でバージョンピンが効かない。
  `infra/` のドキュメントに「Docker（または互換エンジン）が必要」と前提を明記するに留める。

## 結論

- Terraform（`infra/prod/`、prod 層で初の実リソース）: `google_artifact_registry_repository`
  （id=`siorie`、DOCKER、`asia-northeast1`）＋ KEEP cleanup policy（`most-recent-versions`,
  `keep_count = 2`）。DELETE ポリシー・`deployer` SA へのロール付与は後続。
- `infra/Dockerfile`（build context = リポジトリルート）: マルチステージ、builder `golang:1.27-bookworm`
  + `CGO_ENABLED=0`、最終 `gcr.io/distroless/static-debian12:nonroot`。静的配信なしの最小構成。
- リポジトリルートに `.dockerignore` を追加。
- `infra/justfile` に build→push 一気通貫の recipe を追加し、root から辿れるよう配線。
  イメージ参照は `asia-northeast1-docker.pkg.dev/siorie/siorie/app:<git-sha>`
  （`<git-sha>` = `git rev-parse --short=12 HEAD`、`:latest` なし、タグ可変）。
- `gcloud auth configure-docker asia-northeast1-docker.pkg.dev` は事前手順としてドキュメント化 ＋
  便利 recipe。`setup` には混ぜない。`mise.toml` は不変更。
- worklog 導通確認: `terraform apply` で AR リポジトリ作成 → 再 `plan` 差分なし →
  recipe で `docker build` + `docker push` 成功 → イメージが AR に見える → KEEP policy 設定済み。
- この回は CI/CD 自動化でも 0003 の解決でもない。イメージ生成の手順体系化とレジストリの用意、
  および下流 IaC（Cloud Run 等）に必要な検討項目の洗い出しが狙い。
