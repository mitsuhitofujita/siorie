# 議事録

discovery.md の懸念をもとに、エージェントと CI/CD サービスの選定方針を詰めた。

## 事前確認

過去の discussions・decisions・design を確認したが、CI/CD サービスの選定そのものを検討した議論はなかった。
[purpose and initial tech stack](../0001-purpose-and-initial-tech-stack/proposal.md) での Cloud Build 採用は、
GCP のサービスに一通り寄せる初期方針の中で決まったもので、CI/CD 単体としての比較検討を経たものではなかった。

## 前提への指摘

discovery.md で例に挙がった AWS CodeCommit は、ソースコード管理サービスであり CI/CD サービスではない。
Cloud Build と比較するのは筋が違う可能性があることを指摘した。

このリポジトリは GitHub 上で public であることを確認した。GitHub Actions は public リポジトリなら実行時間が無料枠無制限になり、
Cloud Build の無料枠（1 日 120 build-minutes）より制約が少ない。

## 質問と回答

1. 再検討の動機を確認した。「なんとなくの懸念」であり、GCP のサービスに揃えることへのこだわりが、より良い選択肢の見落としにつながるという懸念だった。
2. 知見の獲得を判断軸に入れるかを確認した。入れないという回答だった。目的なく特定サービスを使うことは経験にはなるが知見にはなりづらい、という理由。
3. ハイブリッド構成（GitHub Actions でトリガーし、実際のビルド・デプロイは Cloud Build に任せる）を検討対象に含めるかを確認した。含めない、Cloud Build を「使うか使わないか」の二択で判断する、という回答だった。

## 検討したが採用しなかった案

- **この場で Cloud Build か GitHub Actions かを確定させる案。** トリガー設定の所在、認証方式（サービスアカウント vs Workload Identity Federation）、コスト、プルリクエスト検証の扱いを比較する材料は洗い出したが、確定はしなかった。理由は、根本の問題が「どちらが優れているか」ではなく「IaC やデプロイ方式が定まらないうちに CI/CD サービスだけを先に確定させてしまったこと」だと判明したため。IaC・デプロイ設計と合わせて決める方が手戻りが少ないと判断した。
- **ハイブリッド構成（トリガーは GitHub Actions、ビルド・デプロイは Cloud Build）。** 検討対象から明示的に除外した。Cloud Build を使うか使わないかの二択で判断する方針としたため。
- **`purpose-and-initial-tech-stack/proposal.md` の Cloud Build 関連の記述を書き換える案。** 検討したが採用しなかった。今回の議論は別の discussion であり、古い proposal.md は当時の判断の記録としてそのまま残すことにした。

## 結論

- Cloud Build の採用は撤回する。
- CI/CD サービスの選定は、IaC（Terraform）・デプロイ設計を検討する後続トピックで、今回洗い出した比較観点を踏まえて決定する。
- 古い `purpose-and-initial-tech-stack/proposal.md` は変更しない。
