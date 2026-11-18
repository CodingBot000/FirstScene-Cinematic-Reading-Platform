# FirstScene 제품 QA와 출시 상태

로컬 제품 QA와 문서 인계를 완료했습니다. 개발 원장은 29/33입니다. `LOCAL_PRODUCT_READY`와 `PUBLIC_RELEASE_READY`는 false입니다. [진행 요약](PROGRESS.md)

로컬 자동 검사 19개가 통과했습니다. 단위 107건, PostgreSQL 23건, API 25건, Chromium과 Linux WebKit 각 47건, 접근성 검사 2건을 실행했습니다. 화면 104장을 검수했고, 장면 전환 도중 촬영된 한 장을 안정적으로 다시 수집하도록 수정했습니다. [공개용 증거 요약](evidence/qa/public-product-qa-20261118.json)

## 주요 기술 개선

- **브라우저 설치**. Chromium은 러너에서 직접 설치해 입력 동작을 확인하고, WebKit은 운영체제 의존성이 사전 설치된 버전 고정 Playwright 이미지에서 실행합니다. 검증 커밋 `77b7f61`에서 준비 단계는 각각 13초와 28초였습니다. [워크플로](.github/workflows/check.yml)
- **깨끗한 환경에서의 재현**. 프로덕션 빌드 뒤에 실제 PostgreSQL API 검사를 실행합니다. Lighthouse는 측정마다 Playwright가 새로 띄운 고정 Chromium에 루프백으로 연결합니다. 콜드 측정 9회와 브라우저 성능 검사 4건이 기존 예산을 통과했습니다. [실행 순서](tools/full-check.mjs) · [성능 측정 코드](tools/performance/collect-lighthouse.mjs)
- **장면 전환 검수**. 데스크톱 캡처는 두 삽화 레이어의 전환이 완료된 후 저장합니다. 두 작품의 12개 장면을 양방향으로 확인했고, 원본 검수 자료의 해시는 공개 요약에 기록했습니다. [장면 검사](tests/visual/scenes.spec.ts) · [공개용 QA 증거](evidence/qa/public-product-qa-20261118.json)

검증 커밋 `77b7f61`의 원격 `check:ci`에서 자동 검사 19개와 컨테이너 smoke 13건이 통과했습니다. [GitHub Actions 실행](https://github.com/CodingBot000/FirstScene-Cinematic-Reading-Platform/actions/runs/44307943151) · [선별된 결과 아티팩트](https://github.com/CodingBot000/FirstScene-Cinematic-Reading-Platform/actions/runs/44307943151/artifacts/14430335855)

관리형 소스 감사는 발견사항 ID 충돌로 최종 확정 전이며 배포 공급자 접근은 403 상태입니다. 공개 서비스와 실제 사람의 사용성 평가 결과는 아직 없습니다. [감사 상태](evidence/security/managed-scan-review.json) · [공급자 상태](evidence/deploy/provider-access.json)

[첫 원격 실행](https://github.com/CodingBot000/FirstScene-Cinematic-Reading-Platform/actions/runs/44305718507)의 API 시작 순서와 성능 측정 실패는 수정 전 증거로 보존했습니다.
