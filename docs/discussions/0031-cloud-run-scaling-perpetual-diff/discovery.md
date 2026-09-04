---
date: 2026-09-05
tags: [infra, iac, terraform, cloud-run, provider, dx]
status: open
worklogs: [0017-github-actions-manual-deploy]
---

worklog [0017-github-actions-manual-deploy](../../worklogs/0017-github-actions-manual-deploy/plan.md)
の Difficulties から起こす（operator の指示でエージェントが下書き）。

`infra/app` の plan が、何も変えていなくても毎回 `google_cloud_run_v2_service.app` に 1 change を出す。

## 具体的な足がかり

- 差分の中身（0017 で `image_tag=cc2089b125c3`、実値の client ID / app_origin で再 plan したもの）:

  ```
  ~ resource "google_cloud_run_v2_service" "app" {
      - scaling {
          - manual_instance_count = 0 -> null
          - min_instance_count    = 0 -> null
        }
    }
  Plan: 0 to add, 1 to change, 0 to destroy.
  ```

  トップレベルの `scaling` ブロック（サービス単位のスケーリング）。設定にあるのは
  `template.scaling { min 0 / max 1 }` で、そちらは差分なし。
- 初出は worklog 0015 の import 時。"all-zero, no behaviour change" と記録し、apply で消えると
  想定した。0016 の operator apply（state serial 5）の後も、0017 の CI apply
  （run 33891738701、revision `siorie-00004-mv5`）の後も残った。恒常。
- provider は `hashicorp/google` `~> 6.50`（lock は 6.50.0）。API が
  `scaling: {manualInstanceCount: 0, minInstanceCount: 0}` を返し、provider がそれを state に
  読み込む一方、設定にはブロックがないので毎回「削除」を計画する。削除の update を送っても
  API 側は再び 0 を返すので終わらない。
- CI 経路の症状: run のログに毎回 `Apply complete! Resources: 0 added, 1 changed` が出る。
  proposal 0029 の「同じコミットを二度 dispatch しても Terraform は差分なしで終わる。冪等」は
  成り立っていない（decision 0017 に注記済み）。
- 未確認: この差分だけの apply（イメージ変更なし）で新しいリビジョンが作られるか。サービス
  単位の scaling は template の外なので作られないはずだが、同じコミットを再 dispatch して
  `gcloud run revisions list` を見れば分かる。

## 違和感

- plan に恒常のノイズがあると「1 change なら想定内」という読み方が習慣になり、本物の差分を
  見落とす。[0026](../0026-infra-per-deploy-inputs/discovery.md) が挙げた「無関係な変更の
  つもりが旧イメージへロールバック」型の事故は、まさに plan を読み飛ばしたときに起きる。
  CI が主経路になった今は plan を人が読む機会そのものが減るので、ノイズの害は前より大きい。
- 「apply で消える」という 0015 の想定が、二度の apply を経ても検証されず worklog にだけ
  残っていた。

## 候補の方向（未決）

- 設定側で `scaling {}` を明示して API の返す形に合わせる。provider がどう解釈するかは要確認
  （`scaling_mode` の既定値次第でさらに差分が出る可能性）。
- `lifecycle { ignore_changes = [scaling] }`。手っ取り早いが、将来サービス単位の scaling を
  使いたくなったときに罠になる。
- provider のバージョンを上げて直っているか見る（`~> 6.50` → 6.x 最新、あるいは 7）。
  lock を更新するので 3 層まとめて。
- 直さずに受け入れ、design に「`infra/app` の plan は 1 change が正常」と書く。

関連: [0026](../0026-infra-per-deploy-inputs/discovery.md)、
[decision 0014](../../decisions/0014-infra-deploy-layers-and-firestore.md)、
[decision 0017](../../decisions/0017-github-actions-manual-deploy.md)。
