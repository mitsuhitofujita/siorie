---
date: 2026-08-23
tags: [auth, ux]
status: decided
worklogs: [0002-home-login-frontend-structure]
---

[home and login](../0004-home-and-login/proposal.md) はホームページの未認証／認証済みの
出し分けと、共通レイアウトを使う `/groups` 以下の URL・空状態・ローディング状態を定めているが、
未認証のまま `/groups` 以下へ直接到達した場合の挙動を定めていない。ブックマーク、共有 URL、
ログアウト後のブラウザの「戻る」など、認証フローを経由しない到達経路は普通にあり得る。

[0002-home-login-frontend-structure](../../worklogs/0002-home-login-frontend-structure/README.md)
でルーティングを実装する際、この点が未決定であることに気づいた。今回はバックエンドが存在せず
どのみち一覧は空扱いになるため、ルートガードなしでそのまま素通しにしている。バックエンド
(`/api/groups` などの認証チェック)が実装された段階で、未認証アクセス時に 401 を受けて
どう振る舞うかを決めないと、素通しのままだと「空のグループ一覧」に見えてしまい、未認証であること
自体がユーザーに伝わらない。

## 検討候補

- 共通レイアウトの各ページで `useAuth()` の状態を見て、未認証なら `/` へリダイレクトする。
- ページ側では何もせず、API が 401 を返したらそれをエラー状態として扱う(別途決定予定の
  エラー状態表示トピックに合流させる)。
- 共通レイアウト自体(ヘッダ・ナビメニュー)を認証必須の入れ物と位置づけ、`AppLayout` 側で
  ガードする。

## 追記 (2026-08-29)

[0015-home-signin-button-lifecycle](../0015-home-signin-button-lifecycle/proposal.md) がこの
論点を吸収した。上記「検討候補」の3番目(共通レイアウトを認証必須の入れ物とし `AppLayout`
側でガードする)を `<RequireAuth>` として実装し、未認証アクセスは `/login` に送る。実装は
worklog [0008-home-signin-button-lifecycle](../../worklogs/0008-home-signin-button-lifecycle/plan.md)。
0015 が decided になった時点でこの discovery を閉じる。

## 追記 (2026-08-29) — closed

0015 は [decision 0008-route-level-auth-split](../../decisions/0008-route-level-auth-split.md)
として decided。この論点はそこで解決したため、status を `decided` にした。
