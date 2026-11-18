# FirstScene 진행 검수

현재 [작업 원장](execution/tasks.json)에서 33개 중 24개가 `DONE`입니다. 각 작업의 `acceptance`, `dependencies`, `status`, `commit`, `evidence`를 함께 확인하세요. [진행 요약](PROGRESS.md)은 작업별 상태를 빠르게 확인할 때 사용합니다.

1. [릴리스 보고서](RELEASE_REPORT.md)의 결과를 [전체 검사 원본](evidence/qa/full-run/2026-11-18T09-30-21-703Z-81108322/index.json)과 대조합니다. 19개 검사를 실행했고, 시각 검사는 새 이미지 검토가 필요해 원래 실행에서 종료 코드 2를 반환했습니다. 같은 이미지를 열어 확인한 뒤 [별도 시각 재검증](evidence/qa/post-full-visual.json)이 통과했습니다.
2. [QA 기준](docs/07_QA_ACCESSIBILITY_PERFORMANCE.md), [QA 57개 항목](contracts/qa-cases.yaml), [사례별 증거](evidence/qa/case-coverage.json)를 대조합니다. [디자인 기준](docs/02_DESIGN_SYSTEM.md), [시각 검수 목록](evidence/visual/review.json), [실제 200% 확대 증거](evidence/responsive/native-zoom-blocker.json)에서 화면 검수 범위를 확인할 수 있습니다.
3. [결함 원장](execution/defects.json)에서 수정과 재검증을 확인합니다. `P06-T04`는 [관리형 보안 스캔 상태](evidence/security/managed-scan-review.json)의 발견사항 ID 충돌로 차단됐습니다. `P09-T01`은 [공급자 접근 확인](evidence/deploy/provider-access.json)의 403으로 차단됐습니다. 후속 작업 상태는 [최종 검수 기준](docs/12_FINAL_REVIEW.md)과 [재개 문서](RESUME.md)를 참고하세요.
4. [최종 증거 목록](evidence/final/index.json)의 `records[].artifacts`에서 원본 경로와 SHA256을 대조합니다. 시각 검증은 보존본을 가리킵니다. 보안 스캔은 로컬 원본을 바탕으로 작성한 상태 요약을 가리키며, [별도 수정 검증](evidence/security/network-isolation-repair/index.json)에서 단위·DB·API 결과를 확인할 수 있습니다.

작업 원장의 `commandIds`는 [명령 계약](docs/15_COMMAND_CATALOG.md)에 정의되어 있습니다. 실제 실행 엔트리는 [현재 스크립트](package.json), 환경 준비 방법은 [운영 가이드](docs/public/runbook.md)를 확인하세요. 작업 원장의 의존성과 증거 파일은 `pnpm check:state`로 검사합니다. 원래 작업 커밋은 내보내기 전에 원본 저장소에서 확인했으며, 검수본에는 당시 커밋 식별자를 기록했습니다. [내보내기 기록](execution/review-snapshot.json)

현재 자료는 로컬 검수 기록입니다. 두 출시 상태는 모두 미완료이고 사람 사용성 평가는 0건입니다. 검수본은 새 첫 커밋으로 시작합니다. 과거 증거의 일부 표현을 정리했고, 바뀐 파일과 연결된 해시는 내보내기 기록에 남겼습니다. 테스트 수치와 상태는 보존했습니다.
