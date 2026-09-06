---
date: 2026-08-23
tags: [auth, ui]
status: decided
worklogs: []
---

ホームページのGoogle認証後にユーザの名前を画像を表示する。

## 追記 (2026-08-29) — superseded

この discovery の元の要求（認証後にホームで名前・画像を表示）は worklog
[0002-home-login-frontend-structure](../../worklogs/0002-home-login-frontend-structure/README.md)
/ [0003-google-auth](../../worklogs/0003-google-auth/README.md) で実装済みだった。その後
[proposal.md](proposal.md) はログイン直後にサインインボタンが残るバグの修正（A案 `key=`／
B案 effect クリーンアップ）に舵を切ったが、その提案は
[0015-home-signin-button-lifecycle](../0015-home-signin-button-lifecycle/proposal.md) が
supersede した。B案は 0015 のセッションで成立しないことが確認され、A案は対症療法として不採用。
バグは [decision 0008-route-level-auth-split](../../decisions/0008-route-level-auth-split.md)
（ルート単位の認証分割＋`<GoogleSignInButton>` の切り出し）で構造的に解消。
実装は worklog [0008-home-signin-button-lifecycle](../../worklogs/0008-home-signin-button-lifecycle/plan.md)。
