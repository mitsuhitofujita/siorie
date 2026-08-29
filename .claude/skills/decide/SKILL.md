---
name: decide
description: worklog を decisions に記録し、design に現況を反映する
argument-hint: <docs/worklogs/ 以下の相対パス（例: docs/worklogs/0004-item-groups-crud）>
disable-model-invocation: true
---

`docs/README.md` に従って。

$1 はリポジトリルートからの相対パス。ディレクトリでも、その中の任意のファイルでも構わない。
ファイルが渡されたら、それを含むディレクトリを対象とする。

対象: $1

## 1. 確認する

worklog の plan.md を読んで。
起点となった `docs/discussions/` があれば、その `proposal.md` と `minutes.md` も読んで。

今は開発初期で、プルリクエストもマージも介さず main に直接コミットする運用のため、
マージを待つ必要はない。`/decide` が呼ばれたことが反映の起点。

## 2. decision を書く

`docs/decisions/NNNN-short-title.md` を英語で作って。
NNNN は既存ファイルの続きの連番。

決定事項とその理由に絞って要約して。
検討の過程は discussions に、実装の実際は worklog に残っているから、ここで繰り返さないで。
proposal をそのまま移さないで。短くていい。

先頭に、対応する discussions と worklog へのリンクを書いて。

判断が過去の decision を覆すものなら、新しい decision を追加した上で、
古い方の status を変更して相互にリンクして。古い decision の本文は書き換えないで。

## 3. design を更新する

この変更で現況が変わったなら、該当する `docs/design/` を英語で書き換えて。
古い記述は上書きしていい。design は現況だけを持つ。

各文書の末尾に、いま作った decision へのリンクを追加して。

現況が変わっていないなら、design は触らないで。

## 4. status を揃える

worklog の frontmatter の decisions に、いま作った decision へのリンクを追加。
worklog の status を `merged` に。
起点の `discovery.md` の status を `decided` に。本文は変更しないで。

## 5. 最後に

worklog に記録された困難のうち、まだ discovery になっていないものがあれば指摘して。
`/decide` したからといって、そこで気づいた歪みが解消したわけではない。
