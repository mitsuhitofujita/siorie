---
date: 2026-08-27
tags: [frontend, error-handling, ux]
status: proposed
worklogs: [2026-08-27-items-crud, 2026-08-28-form-error-handling]
---

worklog [2026-08-27-items-crud](../../worklogs/2026-08-27-items-crud/plan.md) で、
「グループ作成→アイテム作成で『作成する』ボタンをタップしてもアイテムが作られず、ページの移動も無かった」
というバグ報告を調査していて気づいたこと。

根本原因はアイテムAPIがバックエンドに1つも実装されていなかったことだったが、それとは別に、
`ItemNewPage.handleSubmit` は次のような形になっていた。

```tsx
const handleSubmit = async (event: FormEvent) => {
  event.preventDefault()
  if (!groupId) return
  setIsSubmitting(true)
  try {
    await api.createItem(groupId, title, Number(completedVolume))
    navigate(`/groups/${groupId}`)
  } finally {
    setIsSubmitting(false)
  }
}
```

`try`はあるが`catch`がない。`api.createItem`が失敗すると、`finally`で`isSubmitting`が
戻るだけで、ユーザーには何のフィードバックもない。ボタンを押した瞬間から見た目上は
「何も起きなかった」にしかならない。今回はバックエンドが存在しないという別の原因で
たまたまこのパターンが表面化したが、このtry/finally(catchなし)のパターンは
`GroupNewPage`、`GroupEditPage`(更新・削除)、`ItemEditPage`(更新・削除)にも
同じ形で存在している。将来バックエンドが正常に動いていても、ネットワークエラーや
バリデーションエラー、セッション切れなど何らかの理由でAPIが失敗するたびに、
同じく「ボタンが無反応に見える」バグとして再発するはずである。

[0010: item groups](../0010-item-groups/proposal.md) と
[0011: items crud](../0011-items-crud/proposal.md) はいずれも
「API失敗時のエラー状態の具体的な表示」を明示的にスコープ外として先送りしている。
今回のバグ報告は、まさにその先送りしてきた穴を踏み抜いた形になる。単発の実装漏れという
より、エラー表示の方針(トースト通知にするのか、フォーム内にインラインで出すのか、
何を出すのか)自体がまだ一度も決まっていないことが繰り返し表面化している、という
構造的な違和感。
