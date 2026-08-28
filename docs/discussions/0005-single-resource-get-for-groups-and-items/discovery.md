---
date: 2026-08-23
tags: [api, backend]
status: decided
worklogs: [0002-home-login-frontend-structure]
---

[purpose and initial tech stack](../0001-purpose-and-initial-tech-stack/proposal.md) の初期 API 一覧には、
グループ・アイテムそれぞれの単体取得エンドポイントがない。

    GET    /api/groups                              グループ一覧の取得
    POST   /api/groups                               グループの作成
    PATCH  /api/groups/{groupId}                     グループ名の変更
    DELETE /api/groups/{groupId}                     グループと所属アイテムの削除
    GET    /api/groups/{groupId}/items               所属アイテム一覧の取得
    POST   /api/groups/{groupId}/items                アイテムの作成
    PATCH  /api/groups/{groupId}/items/{itemId}       アイテムの変更
    DELETE /api/groups/{groupId}/items/{itemId}       アイテムの削除

一覧(GET)と PATCH/DELETE by id はあるが、`GET /api/groups/{groupId}` や
`GET /api/groups/{groupId}/items/{itemId}` に相当するものがない。

一方 [home and login](../0004-home-and-login/proposal.md) は編集ページの挙動を
「既存データ取得中はローディング表示」と定めている。単体取得を暗黙に前提にしているように読める。

[0002-home-login-frontend-structure](../../worklogs/0002-home-login-frontend-structure/README.md)
でフロントエンド構造を実装した際、この矛盾に実際にぶつかった。編集ページの初期データをどう取得するかが
API 側で決まっていなかったため、一覧を取得してクライアント側で該当 id を `find()` する形で凌いだ。
動くには動くが、編集を開くたびにそのグループ配下(あるいはユーザーの全グループ)を丸ごと取得することになり、
件数が増えたときにスケールしない。加えて、該当 id が一覧に存在しない場合(削除済み・不正な URL など)は
`find()` が `undefined` を返すだけで、編集ページはローディング状態のまま止まる。これは
「エラー状態の表示は別トピック」というスコープ外指定と地続きの問題でもあるが、まずは単体取得の有無を
決めないと、エラー状態側でも「何に対して 404 を返すか」を定義しづらい。

## 検討候補

- `GET /api/groups/{groupId}` と `GET /api/groups/{groupId}/items/{itemId}` を追加する。
- 追加せず、一覧取得 + クライアント側フィルタを正式な方針として採用する(ページネーション導入時に
  評価し直す前提を明記する)。
- 一覧 API のレスポンスにキャッシュ手段(状態管理ライブラリ側)を持たせ、編集ページは新規リクエストを
  発行せず一覧のキャッシュから引く。ただし状態管理ライブラリは他のトピックで保留中。
