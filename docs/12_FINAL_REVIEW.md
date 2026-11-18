# 12. 최종 검수 · 자동 보완 · 인계

## 1. 완료 직전 순서
1. 작업 원장의 의존성과 증거를 검사하고 DONE인데 evidence가 없는 항목을 다시 연다.
2. fresh local DB에서 migrations→seed→production build→full QA를 수행한다. 기존 개인 DB는 reset하지 않는다.
3. 12개 씬을 정방향/역방향으로 실제 읽으며 원고·이미지·mood·강조의 의미가 일치하는지 본다.
4. desktop/mobile/general/reduced/오류 상태 screenshot을 열어 rubric으로 검수한다.
5. P0/P1과 수용 기준 위반을 별도 defect ID로 만들고 원인→수정→동일 재현→회귀를 반복한다.
6. 공개 배포 가능 여부를 확인하고 허용 환경이면 실제 배포/smoke. 불가하면 외부 작업만 blocked.
7. 최종 README/아키텍처/운영가이드/portfolio case study와 현재 상태를 대조한다.

## 2. 수용 체크
| 영역 | 필수 증거 |
|---|---|
| 콘텐츠 | 2 story hash, 12 scene, 72 beat, 16 public asset actual hashes |
| 컴파일 | Markdown→JSON parity, 악성/오류fixture 실패 |
| UI | 네 viewport screenshot, rubric≥10/12, 0점항목0 |
| 리더 | 일반/연출/OSreduce, 빠른scroll/역scroll/anchor복구 |
| 데이터 | fresh DB migration, 독립 세션A/B, offline/retry/CAS/delete |
| 패키지 | next없는 외부 consumer tarball build |
| 품질 | lint/type/unit/integration/E2E/a11y/security/build full results |
| 성능 | 실제 환경·3회 값·median·전송량, field data 미수집 표시 |
| 배포 | 실제URL·TLS·write/reload/isolation·rollback 또는 blocker |
| 문서 | AI도구/agent판단/한계/인간검증 여부/미완료목록 |

## 3. 자동 보완 원칙
검수에서 문제를 발견하면 사용자에게 기능 선택을 질문하지 말고 현재 명세 안에서 고친다. 한 원인에 복구3회 실패하면 같은 명령을 무한히 반복하지 않는다. 원인 범위를 축소하거나 독립 작업을 진행하고 마지막 sweep에서 재평가한다. 복구 예산은 장애를 숨기기 위한 것이 아니라 루프 폭주를 막기 위한 것이다.

미관 판단이 애매하면 docs02의 고정 방향과 rubric을 기준으로 여백·대비·타이포·구도를 수정한다. 새로운 디자인 시스템으로 전체를 재작성하지 않는다. 최종 근거가 없으면 완료수준을 낮춘다.

## 4. 최종 인계 형식
`RELEASE_REPORT.md`에 상태, commit, 실행환경, local/public URL, 실제 생성 이미지 수, 테스트 그룹 결과, 관찰된 성능, AI/인간 검수구분, blocker, 실행/정지/복구방법을 쓴다. URL을 만들지 못했으면 문자열을 지어내지 않는다. 이미지 sourcehash가 없으면 생성됐다고 쓰지 않는다. PROGRESS와 report가 불일치하면 release gate실패.

`evidence/final/index.json`에는 evidenceId/taskId/command/exitCode/timestamp/commit/artifacts/status를 기록한다. artifact는 실제 파일이고 hash가 맞아야 한다. known skipped는 skipped이지 pass가 아니다. 결과를 설명하는 문장만 있고 실행 흔적이 없는 것은 증거가 아니다.


## 수집·검수·수정 상태의 구분
P07-T01의 수집 완료와 P07-T02의 관찰 완료는 제품 통과가 아니다. 실패 결과를 정확히 기록하고 수정 작업으로 넘길 수 있다는 뜻이다. 미실행 검사를 숨기지는 않는다. P07-T03 이후에는 일반 `pnpm check:full`이 모든 수용 기준을 통과해야 하며 `--collect` 결과로 대체할 수 없다.

최종 gate 작업 자체가 아직 VERIFYING이라는 이유로 자기 자신을 선행 DONE으로 요구하지 않는다. 나머지 필수 작업과 현재 gate의 검증을 확인하고 현재 작업을 DONE으로 저장한 다음, 전체 상태를 계산한다.
