---
date: 2026-08-23
tags: [purpose, tech-stack, scope]
status: decided
worklogs: [20260823-scaffold-app-modules]
---

このリポジトリでは、小規模な Web アプリケーションを開発する。
この Web アプリケーションは実際に私が使用する。
開発を通して、私の知見とすることが目的。
知見の蓄積が目的なので、技術選定はある程度決まっている。
さらに、実質私しか使用しない想定なので、ランニングコストは無料枠を使用し 0 円が可能となるようにする。
私しか使用しないが、知見の蓄積が目的なので、マルチユーザーでも動作するようにする。

API: go+chi+Huma
Frontend: react(SPA)
クラウドプラットフォーム: Google Cloud
API ホスト: Cloud Run
認証: Google 認証
データベース: Firestore

フロントエンドで認証し、API で情報の確認し、セッションを振り出す。
