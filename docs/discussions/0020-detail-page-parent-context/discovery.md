---
date: 2026-08-29
tags: [frontend, react, perf, ux]
status: decided
worklogs: [0009-visual-style-overhaul, 0010-style-fit-and-finish]
---

worklog [0009-visual-style-overhaul](../../worklogs/0009-visual-style-overhaul/plan.md)
の difficulty 5 を discovery として起こし直す。

モック `docs/discussions/0016-visual-style-overhaul/item-detail.html` は backlink に
親グループ名を出している（`← マンガ喫茶`）。実装の `ItemDetailPage` はアイテムしか
fetch していないので、グループ名を出すには item-detail を開くたびに
`GET /api/groups/{groupId}` が1回増える。今回は `← Back` に留めた。

手が止まったのは、「たった1語（親の名前）を出すために、リクエストを1本増やすか UI を
諦めるかの二択しかない」と気づいたとき。しかも増やす側は
[0017-duplicate-api-requests-on-load](../0017-duplicate-api-requests-on-load/discovery.md)
（ロード時に `groups` と `me` が2回ずつ飛ぶ問題。status: dropped で先日クローズ）と
同じ「ロード時リクエスト」圏内。0017 が dropped になったため、この論点は今どの
discussion にも属していない。

## 具体的な足がかり

- `apps/web/src/pages/groups/items/ItemDetailPage.tsx`:
  `useFetch(fetchItem)` のみ。`useParams` から `groupId` は取れるが、グループ名は
  持っていない。
- `apps/web/src/lib/api.ts` に `getGroup(groupId)` はある。呼べば backlink に
  グループ名を出せるが、表示ごとに1リクエスト増。
- 同種：`ItemEditPage` / `ItemNewPage` の backlink も `← Back`（親名なし）。
- 対照：`GroupDetailPage` は group と items を2本の `useFetch` で個別に取っている
  （decision [0005](../../decisions/0005-form-and-fetch-error-feedback.md)）。
  detail / edit 系ページは「自分の1エンティティ」しか知らない構造になっている。
- ページ間で親データを持ち回る仕組みがない：ルートローダーもクライアントキャッシュも、
  一覧→詳細で取得済みの名前を location state で渡す経路もない。

## 違和感

detail / edit ページが親エンティティの表示情報（名前）を必要とするたびに、
リクエストを増やすか UI を諦めるかになる。モックが要求する UI（パンくず的な親名表示）と
現在のデータ取得構造が噛み合っていない。0017 を dropped にしたことで、
「ロード時に何をどれだけ取るか」を扱う場所が無くなっているのも気になる。

## 候補の方向（未決）

- 一覧 / 詳細で取得済みのグループ名を、遷移先へ `<Link state>` などで渡す
  （リロード直打ちでは名前が無いので fallback が要る）。
- クライアント側の軽いキャッシュ（`groupId → name` 程度）。
- backlink は親名なしを許容する（今回の `← Back` を正式化する）。
- [0017](../0017-duplicate-api-requests-on-load/discovery.md) を dropped から
  revive し、「ロード時リクエスト」全体（重複排除 + 親コンテキスト取得）で扱う。
