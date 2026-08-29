---
date: 2026-08-29
tags: [frontend, css, ui, fonts]
status: decided
worklogs: [0010-style-fit-and-finish]
---

スタイルの微調整を行う。

- フォントのブレが気になる。ユーザー入力で使用している、最初からブラウザの持っている丸ゴシックを全体で使用するようにして。ブラウザが丸ゴシックを持ってない場合は単なるゴシックを使用して。
- `/groups`のページで`+ New group`を`Groups   (+ New group)`のように同じ列に合わせて。Groupsのフォントの上下にボタンの上下を揃えて。
- `/groups/:groupId`のページで`グルーブ名   ( | Edit )`をグループ名のフォントの上下にボタンの上下を揃えて。
- `/groups/:groupId`のページで`Items   ( + Add item )`をItemsのフォントの上下にボタンの上下を揃えて。
- `/groups/:groupId`のページで`← Groups`は削除して。
- `/groups/:groupId`のページでアイテム一覧の、`vol. 3`をより右に寄せて。3桁表示できれば良い。
- `/groups/:groupId/items/:itemId`のページで`← Back`を削除して。
- ヘッダーの`siorie`タイトルをタップで`/`に遷移して。
- `/groups/:groupId/items/:itemId/edit`のページで`Delete Item`ボタンは右寄せにして、上にセパレーターを設けて。
