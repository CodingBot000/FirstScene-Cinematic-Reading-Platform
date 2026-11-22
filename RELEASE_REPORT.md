# FirstScene — QA 및 릴리스 증거

**기준일:** 2026-11-22 (KST)  
**기능 소스:** `main` · squash merge `82a55454ca961874c9dbc33edd46d1d7063f87b3`  
**기능 PR:** [#9](https://github.com/CodingBot000/FirstScene-Cinematic-Reading-Platform/pull/9)

## 확인된 결과

| 구분 | 상태 | 근거 |
| --- | --- | --- |
| 기능 PR 병합 | 완료 | PR #9, 병합 커밋 `82a55454` |
| PR 검증 | 성공 | [기능 PR CI](https://github.com/CodingBot000/FirstScene-Cinematic-Reading-Platform/actions/runs/44924209499) |
| `main` 검증 | 성공 | [병합 커밋 CI](https://github.com/CodingBot000/FirstScene-Cinematic-Reading-Platform/actions/runs/44925526025) |
| 코드 리뷰 | Flip 화면 크기 변동 결함 수정, 회귀 테스트 추가 | 병합된 PR #9와 대응 테스트 |
| 제품 로컬 검증 | 기존 19개 검사 그룹, Docker smoke 13개 통과 기록 | 기능 PR CI의 검증 기록 |
| 실기기 UX/GPU | 미확인 | 자동 브라우저 검사와 별개 |
| 사람 대상 사용성 평가 | 0건 | 현장 실측·인터뷰 없음 |
| 관리형 보안 감사 | 미확정 | 기존 감사 ID 충돌 기록 |
| 운영 DB 백업/복원 | 미확인 | 실제 운영 환경 검증 필요 |
| 공개 프로덕션 배포 및 smoke | **완료 선언 불가** | 대상 프로젝트·권한·공개 URL·운영 검증 필요 |

## 기능 변경 범위

- 공개 가능한 완결 단편 2편과 공개 예정 34편을 탐색 화면에서 구분하고 공유 preview 표지/안내 계약을 적용
- 검색·필터 계산과 브라우저 URL 동기화 책임을 분리
- 데스크톱 조건부 WebGL2 Shader 포털과 GPU 자원 정리·fallback
- 선택적 GSAP Flip 카드 전환, 모션 감소/화면 크기 변화 복구
- UI 패키지 내부 구조 및 CSS의 영역별 분리, 기존 외부 import 호환성 유지
- 읽기 동기화의 읽기 전용 selector 분리, 변경·epoch·outbox/삭제 상태 소유권 유지

## 완료 기준과 제한

이 문서는 기능 PR 병합과 자동 검증을 재현 가능한 링크로 기록합니다. `LOCAL_PRODUCT_READY` 또는 `PUBLIC_RELEASE_READY`를 선언하지 않습니다. 제품 완료율 원장([PROGRESS.md](PROGRESS.md))의 별도 외부 차단 항목도 임의로 완료 처리하지 않습니다.

Vercel 접근/대상과 실제 운영 smoke가 검증되기 전에는 프로덕션 링크를 만들어 기재하거나 배포 성공으로 보고하지 않습니다. 배포가 수행되면 대상 커밋, 빌드/배포 ID, 공개 URL, health/작품/상태변경/rollback 검증 결과를 증거로 추가해야 합니다.
