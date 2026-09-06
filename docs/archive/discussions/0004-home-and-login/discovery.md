---
date: 2026-08-23
tags: [ux, ui]
status: decided
worklogs: [0001-scaffold-app-modules, 0002-home-login-frontend-structure]
---

ページ一覧文書を作成する。
共通レイアウト: ヘッダ→タイトル(左)とアカウント画像(右)。フッター→目立たないタイトル。
ナビメニュー: ヘッダのアカウント画像をタップで右から表示。グループ一覧ページへのリンク、ログアウト。
ホームページ: 未認証→タイトルとログインボタン表示。認証済→タイトルとアカウント情報表示(画像と名前)。共通レイアウトは使用しない。
他: アイテムグループのCRUDと一覧、グループ内のアイテムのCRUDと一覧

## 追記 (2026-08-29)

[proposal.md](proposal.md) のうちホームページに関する2点を
[decision 0008-route-level-auth-split](../../decisions/0008-route-level-auth-split.md) が覆した。
(1)「専用の `/login` ページは作らない（その場でログインを起動する）」→ `/login` ルートを作る。
(2)「認証済みホームにアカウント情報＋グループ一覧リンク＋ログアウトを置く（`/groups` へ直接
リダイレクトしない）」→ `/` はリダイレクトのみにし、認証済みは `/groups` へ送る。名前は
`NavMenu` のシート内へ移設。

残り（共通レイアウト、ナビメニュー、URL 一覧、作成／編集の分離、削除確認モーダル、空状態／
ローディング状態）は worklog
[0002-home-login-frontend-structure](../../worklogs/0002-home-login-frontend-structure/README.md)
で実装済みで、[decision 0009-frontend-app-structure](../../decisions/0009-frontend-app-structure.md)
に記録した。先送りしていたエラー状態の表示は
[decision 0005-form-and-fetch-error-feedback](../../decisions/0005-form-and-fetch-error-feedback.md)
で決定済み。これで proposal の各項目に decision が対応したため status を `decided` にした。

