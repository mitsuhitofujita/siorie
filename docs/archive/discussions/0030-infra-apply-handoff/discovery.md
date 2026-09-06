---
date: 2026-09-05
tags: [process, agent, infra, terraform, permissions, dx]
status: open
worklogs: [0017-github-actions-manual-deploy]
---

worklog [0017-github-actions-manual-deploy](../../worklogs/0017-github-actions-manual-deploy/plan.md)
の Difficulties から起こす。`/work` の原則では discovery は人間が書くが、今回は operator の
「discovery を書いておいて」という指示でエージェントが下書きした。

`terraform apply` が Claude Code の auto mode classifier に遮られ、infra 系の worklog が
毎回「エージェントが書いて plan するまで、operator が apply して確認する」の二段階に割れる。
これが 0012 から 0017 まで 5 回続いた。0012 の時点では「設計の信号ではなく固定の tooling
境界。discovery 不要」と片付けている（worklog 0012 の Review）。0017 で手が止まったのは、
この分担が「意図して決めた運用」ではなく「classifier の副産物として定着した運用」になっていて、
しかも今回はコストが複利で効いた、と気づいたとき。

## 具体的な足がかり

- 0017 で遮られたコマンド: `terraform -chdir=infra/bootstrap apply -input=false -auto-approve`
  と同 `platform`。両方「Permission for this action was denied by the Claude Code auto mode
  classifier」。0011 では bootstrap の apply は通っていた（billing で途中失敗したのは別の理由）。
  0012 / 0013 / 0015 / 0016 は prod / platform / app の apply が遮られ、operator が実行した。
- 同じセッションで通ったもの: `gh api --method PUT .../environments/production`、
  `POST .../deployment-branch-policies`、`gh secret set --env production`（公開リポジトリの
  設定変更）。IAM binding を 8 個足す `terraform apply` は止まり、GitHub 側の設定変更は通る。
  境界は影響範囲ではなくツール名で引かれているように見える。
- operator がチャットで「あなたが apply まで通してもよい」と言った後、`just infra/apply bootstrap`
  / `just infra/apply platform` を再試行したら通った。`.claude/settings.json` は変えていない。
  つまり境界は固定ではなく、会話の文脈（か運）で動く。再現性がない。
- `.claude/settings.json` の現状: allow は `just build` / `just lint` / `just test` /
  `just generate *` / `rg *` / `jq *`、deny は `git push *` / `just run`。`just infra/apply`
  に関する rule はない。`git push *` の deny は意図的なので、push と dispatch は今後も operator。
- 0017 で apply の向こう側に置かれた完了条件: dispatch、新しいリビジョン、ブラウザでのサイン
  イン、state バケットの権限確認（未解決 1）、main 以外からの起動が落ちること。つまり proposal
  の検証項目の全部。エージェントの側に残ったのは plan と静的検査だけだった。
- worklog の最も価値がある部分（動かして初めて分かった困難）が、エージェントのセッションの
  外で起きる構造になっている。operator が追記しなければ記録に残らない。
  - 残った例: worklog 0016 の「Operator steps」節（OAuth origin 未登録でサインインが落ちた話は
    ここにしかない）。
  - 残らなかった例: worklog 0015 には rollout の追記がない。その結果、proposal 0029 は
    「`infra/prod` の `state rm` は未完」という前提で書かれたが、実際にはバケットの `prod/`
    prefix ごと消えていた（0017 の Preflight）。
- 同じセッションでの追記（2026-09-04 15:39Z〜）: エージェントの bootstrap apply が終わった 8 秒後に
  operator が dispatch し、platform apply（deployer のロール付与）はその 2 分後だった。run は
  push まで通ったが、`artifactregistry.repositories.get` が binding 作成の 78 秒後にまだ拒否されて
  apply で落ちた（IAM の伝播遅延）。apply と dispatch が別の主体に割れているので、
  「両方 apply して、伝播を待って、dispatch」という順序を誰も持っていなかった。
- 0017 では apply の後の権限確認も詰まった。deployer の impersonation は Owner に
  `iam.serviceAccounts.getAccessToken` がなくて不可、Policy Troubleshooter API は未有効化。
  どちらも有効化・付与すれば通るが、それ自体がスコープ外の変更。結局「初回 dispatch で
  `terraform init` が通るか」だけが検証手段になった。

## 違和感

- 「apply は人間」という分担自体は悪くない。問題は、それを決めた記録がどこにもなく、
  proposal も `/work` もその前提で書かれていないこと。proposal は毎回「apply して確認する」まで
  を worklog の作業として書き、worklog は毎回「classifier に遮られたので operator へ」と書く。
  同じ齟齬を 5 回書いている。
- 境界がツール名で引かれているので、守りたいもの（本番の状態）と守られているもの
  （`terraform` という単語）がずれている。`gh secret set` は通り、IAM の read-only 系の
  binding は止まる。
- 会話で許可すれば通る、という挙動は「許可の記録が残らない」形の運用になる。settings.json の
  rule なら diff として残る。

## operator の判断（2026-09-05、0017 のセッション中）

エージェントが apply まで通してよい。push と dispatch は引き続き operator。

## 候補の方向（未決）

- `.claude/settings.json` の allow に `Bash(just infra/apply *)` を置き、会話上の許可に依存
  しない形にする。`terraform apply` の直叩きは含めず recipe 経由だけ通す。`destroy` は入れない。
  `git push *` の deny は維持し、apply までがエージェント、push と dispatch が operator、という
  線を rule として残す。
- 逆に二段階を正式な運用にする。proposal に「operator checklist」、worklog に「rollout 追記」を
  標準の節として入れ、`/work` の SKILL.md に「apply が遮られたら checklist を書いて止まる」を
  明記する。0017 の "Left to the operator" 節がその雛形。
- 両方やる。rule で apply を通しつつ、push / dispatch / ブラウザ確認は checklist として残す
  （0017 の最終形はこれに近い）。
- 検証経路の整備は別件: deployer を impersonation できるように operator 自身へ
  `roles/iam.serviceAccountTokenCreator` を付けるか、Policy Troubleshooter API を有効化するか。
  0022 の「ローカルから impersonation はしない」と衝突するので、要判断。

関連: [0003 CI/CD service selection](../0003-cicd-service-selection/proposal.md)（0029 で決着）、
[0029 GitHub Actions manual deploy](../0029-github-actions-manual-deploy/proposal.md)。
