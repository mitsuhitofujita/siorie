---
date: 2026-08-29
tags: [frontend, react, perf]
status: dropped
worklogs: []
---

`groups/`にブラウザでアクセスした時、APIへのアクセスが、`groups`と`me`がそれぞれ2回リクエストされる。
この問題を調査し、是正する。
