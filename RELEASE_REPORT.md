# FirstScene 검증 및 재개 보고서

검증 기준: 2026-11-18T09:40:31.509886+00:00. 작업 원장 **24/33완료**. **LOCAL_PRODUCT_READY·PUBLIC_RELEASE_READY 모두 미선언**입니다. 제품 구현은 `f415ffa792b8d106f10040834e93cf00f2d2ad2b`, QA도구 수정은 `e6a58aabee0461d33716bc6ad510023a59474901`, 최종 전체 실행은 `4f7aac271235826998bc3a07bd05d65a75519c62` 기준입니다. 이후 보고서·증거 정리는 별도 checkpoint로 보존합니다.

로컬 미리보기는 [FirstScene](http://127.0.0.1:3100)입니다. 최신 production build의 live/ready·홈·두 작품 본문200과 각36문단을 확인했습니다. 공개 서비스URL은 없습니다. 공개 게시·push·유료 API·권한 변경은 수행하지 않았습니다.

## 승인된 피드백 정책과 구현

사용자가 선택한 한국 시간 자정에 초기화하는 하루5회/작품/익명세션 기준을 적용했습니다. DB세션 row잠금 후 실제 시각으로 Asia/Seoul달력일을 계산합니다. 같은 요청의 재전송은 추가 횟수를 소비하지 않으며, 서로 다른 세션·작품의 제한은 분리됩니다. 선택형4항목과 명시적 전송, 서버201확인 후 성공 표시, 오프라인 수동 재전송, 삭제·다른탭·늦은응답 격리를 검증했습니다. 자유입력이나 기기 간 계정 동기화는 없습니다.

## 실제 실행 결과

| 검사 | 결과 |
|---|---|
| 전체 명령 |19suite 실제 실행·보고서 확인;18명령 exit0, 시각명령 exit2 후 추가 검증 통과 |
| 단위 / PostgreSQL / API |105 /23 /25통과 |
| Chromium / Linux WebKit / 접근성 |47 /47 /2통과; skip·flaky0 |
| 시각 |16그룹·104화면, 에이전트 rubric최저11/12·0점항목0 |
| 실제 native 확대 |200%에서 본문·설정·24px·피드백 키보드 접근 확인 후100%복원 |
| 성능 |3경로×3cold lab navigation와 browser4검사 통과 |
| 외부 소비 |Next/pg없는React/Vite에5tarball 설치·build·두브라우저검사 통과 |
| 시작 / Docker |12시작 검사 및13실제 저장·A/B분리·재시작 검사 통과 |
| 추가 증거 검사 |시각 검증기10개 잘못된 증거를 거부; 최종 문서 반영 후 보안 음성·privacy receipt 별도 갱신 |

엄격한 `pnpm check:full`은 **exit2 / LOCAL_GATES_BLOCKED**입니다. [최종 전체 결과](evidence/qa/full-run/2026-11-18T09-30-21-703Z-81108322/index.json)의 SHA256은 `429fa1a525c2c5c60a082ebedd2cd22838c239a695fa030c5a27017b34daec58`입니다. 원본 전체 실행은 새 픽셀 승인 대기로 시각명령이 exit2였습니다. 동일 캡처의14개 테두리 렌더링 픽셀을 직접 열어 승인한 뒤 verify-review와10개 증거 거부 검사가 통과했습니다. [추가 검증](evidence/qa/post-full-visual.json)을 별도로 보존하며 원본 전체 결과를 통과로 고치지 않았습니다. 제품 완료로도 바꾸지 않았습니다. [QA57사례](evidence/qa/case-coverage.json), [최종 증거 목록](evidence/final/index.json)에서 파일과hash를 확인할 수 있습니다.

첫 전체 실행에서 Linux WebKit의 보고서 경로가 상대경로여서 소유경로 검증에 거부됐습니다. 원본 실패를 보존하고 경로만 절대경로로 수정한 뒤47개 전체 사례와 최종19suite를 재실행했습니다. 초기 macOS WebKit의 잘못된 trusted pointer좌표도 진단 증거로 남겼습니다. 공개 동작의 한도를 낮추거나 assertion을 완화하지 않았습니다.47개 사례는 승인된30세션/네트워크/15분 한도를 유지하도록 독립spec4개씩 새DB로 격리합니다.

## 이미지와 관찰 범위

내장 생성 원본16개(캐릭터 기준2·표지2·배경12)와 공개 자산16개(표지2·배경12·파생portrait2),92개AVIF/WebP변형을 검증했습니다. 생성 모델을 도구가 노출하지 않은 항목은unknown입니다. 별도 유료API사용액은0USD이며 새 이미지를 추가 생성하지 않았습니다.

104화면과 새Docker화면을 에이전트가 열어 검수했습니다. 동일PNG해시만 이전 관찰을 승계하고, 다른 픽셀은 새로 확인했습니다. native200%는CSSzoom·DPR대체가 아닌 실제 전용Chrome확대UI로 검증했습니다. macOSChromium과digest고정LinuxWebKit의 글꼴 차이를 별도로 검수했습니다. 사람 평가·인터뷰·현장 성능 데이터는0건입니다. WebKit자동화는 실물Safari/iPhone검증이 아니며 axe통과도WCAG전체 인증이 아닙니다.

| 경로 | lab median LCP | CLS | TBT |
|---|---:|---:|---:|
| home | 943ms | 0.000000 | 40ms |
| introduction | 954ms | 0.000000 | 47ms |
| reader | 605ms | 0.000588 | 52ms |

측정 환경·원본 값·전송량·해제20회 증거는 성능 보고서에 있습니다. 이 결과는 실제 사용자의 성과나 전후 인과 개선을 뜻하지 않습니다.

## 남은 조건

- 관리형Standard소스검수는 수정 전 revision `3eda7775cf4026447452c812cc12c249da92e655`에서 한 문제를 확인했습니다. 세션 발급의 공유한도를 요청네트워크별로 분리하고, 검증된ingress의 명시적 운영 설정과 실제DB·HTTP검사로 수정했습니다. 실제 공개ingress는 아직 설정하거나 검증하지 않았습니다.
- 발견사항ID를 정정하는 과정에서 같은 문제가 두canonical ID로 남았습니다. 수락된 최종초안과 원본은 보존했으며 scan `b65e5088-f5df-4d19-b17f-9bd465d5dfd4`는 **미확정**입니다. 보안 스킬의 final-report.md는 “If both identities are active, leave the scan unsealed and report the conflict.”라고 요구합니다. 호스트의 원래ID조정 지원이 필요하며 재제출·강제완료·원본편집으로 우회하지 않습니다. 수정 후 재스캔·독립보안인증·발견사항0건으로 보고하지 않습니다.
- 공급자 접근403과 승인된 공개 대상·요금·DB/TLS/pooler·비밀값 저장 위치가 미확인입니다. 실제 배포·HTTPScookie·쓰기/새로고침/세션분리·preview rollback은 미수행입니다.

P06-T04와P09-T01은BLOCKED_EXTERNAL입니다. 이에 의존하는P07/P08과나머지공개작업은PENDING입니다. QA57항목의 범위별 집계는 `{'AUTOMATED_SCOPE_PASSED': 50, 'AGENT_REVIEWED': 4, 'PARTIAL': 1, 'BLOCKED_EXTERNAL': 2}`이며 부분·차단 항목을 통과로 계산하지 않습니다.

## 실행과 정리

호스트Node24.5.0/pnpm10.14.0, PostgreSQL17.12를 사용했습니다. QA이미지는Node24.22.3/Playwright1.65.1을digest로 고정했습니다. 전역설정·실제 모델설정·권한은 변경하지 않았습니다. 운영Docker이미지는비root로실행합니다.

최종 검사 후 임시testDB0건을 확인하고 소유receipt·label로 확인한 이번CI컨테이너·볼륨·환경파일만 종료했습니다. 기존 개발DB와3100미리보기는 보존했습니다. GitHub hostedworkflow는 실행하지 않았습니다. 실행·정지·복구는 [운영 가이드](docs/public/runbook.md), 정확한 재개 조건은 [RESUME](RESUME.md)에 있습니다. 공개용5문서만 로컬로 선별export했으며 비공개원문·전체문서묶음·비밀값·Git이력을 공개하지 않았습니다.
