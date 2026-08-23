---
description: proposal.md から worklog を起こして実装し、結果と困難を追記する
argument-hint: <discussions のディレクトリ名> または実施内容
---

`docs/README.md` に従って。

対象: $ARGUMENTS

## 1. 起点を確認する

引数が `docs/discussions/` のディレクトリ名なら、その `proposal.md` を読んで。
proposal を伴わない小さな作業なら、それでいい。discovery を書かせようとしないで。

実装に入る前に、関連する `docs/design/` を確認して。

## 2. worklog を作る

`docs/worklogs/<今日の日付>-<短い説明>/README.md` を作って。
日付は proposal の日付ではなく、今日の日付を使って。

frontmatter は以下の形で。

```yaml
---
date: <今日の日付>
status: in-progress
discussions: []
decisions: []
pr: null
---
```

対応する `discovery.md` の frontmatter にも、この worklog へのリンクを追加して。
リンクは必ず双方向に張って。

## 3. 実装する

本文は英語で書いて。

作業しながら README.md を書き足して。終わってからまとめて書かない。
proposal の想定と違った点があれば、その場で記録して。

## 4. 終わったら

何をしたかと、どのような困難があったかを追記して。
困難の節は日本語で構わない。私が読み返す部分だから。

想定と違った点は、最も価値のある記述として扱って。
うまくいった話より詳しく書いて。

`proposal.md` には何も書き戻さないで。ずれは worklog 側に置く。

## 5. 困難を見直す

記録した困難のうち、単発の事故ではなく設計や前提の歪みに見えるものがあれば、
それを指摘して。新しい `discovery.md` を書くべきかどうか、私に聞いて。

勝手に discovery を作らないで。書くのは私の仕事。
