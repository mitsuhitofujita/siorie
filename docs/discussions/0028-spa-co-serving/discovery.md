---
date: 2026-09-01
tags: [infra, deploy, cloud-run, docker, spa, auth]
status: proposed
worklogs: [0016-spa-co-serving]
---

静的ファイルを含めたアプリケーションをデプロイできるようにして。

いまの `infra/Dockerfile` は Go バイナリだけを distroless に載せていて、`apps/web` のビルド成果物（`apps/web/dist`）はイメージにも Cloud Run にも入っていない。design の "Not yet present" が名指ししている「SPA を Go バイナリから同一オリジンで配信する」構成を、ようやく実際に組む。
論点は、Dockerfile に web ビルドステージを足して最終ステージへ `dist` をコピーすること、Go 側に `/api/*` 以外を静的ファイル＋SPA フォールバックで返すハンドラを足すこと、ローカルの Vite プロキシ運用（discussion 0008）との整合あたり。イメージ名が最初から `app` なのも、この統合を見込んでのものだった（decision 0012）。
