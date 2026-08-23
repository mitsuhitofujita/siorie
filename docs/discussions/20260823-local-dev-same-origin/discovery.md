---
date: 2026-08-23
tags: [auth, deploy, local-dev]
status: open
worklogs: [20260823-google-auth]
---

Google認証の実装中、`apps/web/vite.config.ts` に `/api` への proxy を足さないと
`__Host-session` Cookie も `Origin` 検証もローカルではそもそも成立しないことに気づいた。

`docs/discussions/20260823-purpose-and-initial-tech-stack/proposal.md` の「システム構成」は
本番構成(SPA と API を同じ Cloud Run サービスから配信し、同一オリジンにする)しか書いていない。
「ローカル開発」の節も Firestore エミュレーターと Google Identity Services の承認済みオリジン
登録には触れているが、Vite(5173)と Go サーバー(8080)がブラウザから見て別オリジンになる、
という話そのものは出てこない。

今回は `apps/web/vite.config.ts` の `server.proxy['/api'] -> http://localhost:8080` を足し、
`apps/api/.env` の `APP_ORIGIN` も Vite 側のオリジン(`http://localhost:5173`)に合わせることで
その場で解決した。動いてはいるが、これは実装者がコードを書きながら偶然気づいて足した回避策であり、
proposal 側で決めた話ではない。

ステージング環境を用意する場合や、将来 API とフロントを別サービスとしてデプロイする構成に
変えた場合など、「ブラウザから見て同一オリジンかどうか」という同じ種類の問題は形を変えて
何度も出てきそうに見える。そのたびに実装側で個別に気づいて対応するより、ローカル開発・本番・
将来の環境それぞれで同一オリジンをどう保つかを一度きちんと設計として決めておいた方がよいのでは、
というのがこの discovery の趣旨。

詳細は [20260823-google-auth worklog](../../worklogs/20260823-google-auth/README.md) の
「困難」節、特に Vite proxy に関する項目を参照。
