# FirstScene 제품 QA와 출시 상태

로컬 제품 QA와 문서 인계를 완료했습니다. 개발 원장은 29/33입니다. `LOCAL_PRODUCT_READY`와 `PUBLIC_RELEASE_READY`는 false입니다. [진행 요약](PROGRESS.md)

로컬 자동 검사 19개가 통과했습니다. 단위 107건, PostgreSQL 23건, API 25건, Chromium과 Linux WebKit 각 47건, 접근성 검사 2건을 실행했습니다. 화면 104장을 검수했고, 장면 전환 도중 촬영된 한 장을 안정적으로 다시 수집하도록 수정했습니다. [공개용 증거 요약](evidence/qa/public-product-qa-20261118.json)

이 스냅샷은 GitHub Actions의 새 `check:ci`용입니다. 실행 결과는 해당 커밋의 Actions 실행과 요약 아티팩트에서 확인합니다. 로컬 결과는 원격 실행의 통과 근거로 계산하지 않습니다.

관리형 소스 감사는 발견사항 ID 충돌로 최종 확정 전이며 배포 공급자 접근은 403 상태입니다. 공개 서비스와 실제 사람의 사용성 평가 결과는 아직 없습니다. [감사 상태](evidence/security/managed-scan-review.json) · [공급자 상태](evidence/deploy/provider-access.json)

[첫 원격 실행](https://github.com/CodingBot000/FirstScene-Cinematic-Reading-Platform/actions/runs/44305718507)은 설치 단계와 Chromium·WebKit 회귀를 완료했습니다. API 시작 순서와 성능 측정 단계가 실패해 수정을 반영했습니다. 적용한 커밋의 원격 상태는 Actions에서 확인합니다.
