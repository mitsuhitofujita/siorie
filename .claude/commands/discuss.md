---
description: discovery.md をもとに議論し、合意できたら proposal.md をまとめる
argument-hint: <YYYYMMDD-短い説明>
---

`docs/README.md` に従って。

対象: `docs/discussions/$1/`

## 1. 読む

まず `discovery.md` を読んで。
次に、関連する `docs/design/`、`docs/decisions/`、
frontmatter のタグが重なる過去の `docs/discussions/` を確認して。

過去に同じ選択肢を検討して見送っている場合は、その事実を最初に伝えて。

## 2. 議論する

この段階では `proposal.md` も `minutes.md` も書かないで。

私の記述で文脈が足りない箇所を質問して。
私が挙げていない選択肢があれば提示して。
私の前提が怪しいと思ったら指摘して。同意を優先しないで。

一度に投げる質問は3つまで。
私の回答が曖昧なら、そのまま進めずにもう一度聞いて。

私が「提案をまとめて」と言うまで、議論を続けて。

## 3. まとめる

合意できたら、以下を作って。

`minutes.md` を日本語で。逐語ではなく要点だけ。
特に、あなたが何を質問したかと、検討した上で採用しなかった案とその理由は必ず残して。

`proposal.md` を日本語で。提案時点での検討を書く。決定ではない。

`discovery.md` の frontmatter の status を `proposed` に変えて。
本文は絶対に変更しないで。
