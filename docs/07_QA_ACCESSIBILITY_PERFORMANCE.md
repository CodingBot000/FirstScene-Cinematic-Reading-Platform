# 07. Testing · QA · Accessibility · Performance

## 1. 검증 계층과 증거
`contracts/qa-cases.yaml`의 QA ID를 작업별 evidence에 연결한다. 코드 수/테스트 개수를 목표로 삼지 않는다. 단위·DB·API·브라우저·시각·성능·배포는 다른 증거다. fixture API로 통과한 화면을 실제 PostgreSQL 통과라고 쓰지 않는다.

| 계층 | 필수 검사 |
|---|---|
| 정적 | lint, TS strict, imports boundary, secret scan, source/generated parity |
| 순수 단위 | active beat, reverse/jump, mood resolution, anchor fallback, text segmentation |
| 컴파일 | 정상 2작품, 악성 HTML/MDX, 중복ID, 잘못된 role/enum/hash |
| DB 통합 | fresh migration, 반복 적용, checksum 불일치, session A/B 격리, CAS conflict, receipts |
| API | 계약 응답, Origin/JSON/cookie, oversized body, 401/404/409/429/503 |
| E2E | 탐색→읽기→설정→저장→재진입→북마크→삭제, 실제 DB |
| 접근성 | axe, keyboard, reduced motion, zoom, 의미 텍스트/스크린리더 구조 |
| 시각 | 실제 4크기 screenshot 열람·rubric·수정 전후 |
| 성능 | production build, LCP/CLS lab, 상호작용 trace, 이미지/폰트/JS budget |
| 배포 | URL/HTTPS/DB write/reload/isolation/로그·rollback |

## 2. 자동화 도구
Vitest+Testing Library, Playwright, axe-core, Lighthouse CLI, ESLint, JSON Schema validator. Playwright는 role/label locator와 retrying assertion을 사용하고 이유 없는 sleep으로 통과를 맞추지 않는다 [S14]. 전체 E2E의 network가 fixture로 대체되지 않도록 실제 DB 모드를 별도 표시한다.

snapshot 자동 갱신으로 테스트를 녹색으로 만들지 않는다. 변경 전후 이미지를 검토하고 의도적 변경이면 이유를 기록한다. known failure를 skip/xfail해서 gate를 통과하지 않는다. flaky 테스트는 재시도 성공뿐 아니라 최초 실패 원인을 기록한다.

## 3. 브라우저·뷰포트
Chromium desktop 1440×1000 / 1024×768, Chromium mobile 390×844 / 320×740, WebKit 390×844 핵심 journey. JS disabled 일반 본문 확인. locale ko-KR, timezone Asia/Seoul. 기본, reduced-motion, slow network, offline after load, 이미지404, DB503, storage quota 오류를 분리한다. WebKit 자동화는 실물 iPhone 검증과 다르다고 명시한다.

## 4. 접근성 기준
WCAG 2.2 AA를 목표로 contrast 4.5:1(큰 글자3:1), focus visible, keyboard 운영, heading landmark, meaningful names, 오류 안내를 검사한다 [S09]. 2.3.3 animation disable은 AAA지만 별도 프로젝트 수용 기준으로 채택 [S10]. axe 결과 0만으로 완전 준수를 선언하지 않는다.

필수: skip link, 한 페이지 h1 하나, scene h2, 문단 순서, Dialog focus 복귀, Escape 닫기, 200% 확대·320px reflow 가로 넘침 없음, OS reduce 실시간 변경, 글자 효과 접근성 트리에 원문 한 번만, 링크·버튼 구분. 비주얼 연출을 설명하기 위해 aria-live로 본문을 계속 읽게 만들지 않는다.

## 5. 성능 목표와 측정법
Core Web Vitals의 good 기준 LCP≤2.5s, INP≤200ms, CLS≤0.1을 제품 목표로 삼는다 [S12]. 현장 p75/실제 사용자 데이터가 없으면 이 숫자를 달성했다고 주장하지 않는다. Lighthouse의 TBT를 INP로 표기하지 않는다.

로컬 gate: production build·동일 머신·브라우저·4×CPU slowdown·정의된 network profile에서 홈/소개/리더 각 3회 cold-run. 중앙 LCP≤2.5s, CLS≤0.1, TBT≤200ms를 목표로 보고하고 환경/편차를 함께 저장. 외부 네트워크가 원인이면 로컬 번들/이미지 문제와 분리한다. 실제 interaction script로 toolbar·mode·bookmark의 Event Timing을 측정하고 이를 “lab interaction latency”라고 표기한다.

예산: reader 초기 JS gzip≤300KiB(빌드 런타임 포함, first route), 첫 화면 전체 transfer≤1.4MiB, 첫 이미지960≤180KiB, 폰트 초기 transfer≤300KiB. 일반 읽기에 GSAP chunk 0 요청. reader animation 때 메인 스레드 50ms 초과 긴 작업의 반복 발생 없음, 누수 mount/unmount20회에서 listener/tween 누적0. FPS 60을 모든 기기에서 보장한다고 쓰지 않는다.

## 6. 저장·경합 필수 검증
동일 operationId 동일 payload 중복은 같은 결과; 다른 payload는409. expectedRevision 불일치409가 현재 state를 포함. 두 탭이 역순 응답받아도 오래된 ack가 현재 UI를 뒤로 돌리지 않는다. anchor는 뒤로 갈 수 있지만 furthestOrdinal/완독은 삭제 전까지 단조 증가. 오프라인 queue가 무한히 늘지 않고 reconnect 후 최종 상태가 수렴한다. session 삭제 후 예전 outbox를 재전송하지 않는다.

## 7. 시각 검수의 실행 절차
스크린샷 파일을 생성만 하지 말고 도구로 실제 열어 본다. 홈·소개·리더 calm/tension/climax·서재 empty/full·설정·이미지실패·모바일 북마크를 확인한다. docs02 rubric 점수+결함 위치+수정commit+재촬영 경로를 남긴다. 자동 screenshot diff는 의도/가독성을 판단하지 못하므로 육안 검토를 대체하지 않는다.

P0: 본문 안 보임/다른 사용자 데이터/secret leak/읽기 불가능. P1: 위치 저장 손실/필수 이미지 없음/모바일 가림/키보드 갇힘. P2: 일부 정렬/전환 미세 오류. P0/P1은0이어야 LOCAL_PRODUCT_READY. P2도 수용 기준 위반이면 수정한다. 사소한 미세차는 제한을 명시하며 새로운 기능 추가로 회피하지 않는다.

## 8. 최종 보고
실행한 명령, exit code, 날짜, commit SHA, OS/브라우저, DB 모드, artifact path/hash, 실패·재시도·미실행 이유를 남긴다. branch 수정 이후 오래된 PASS를 그대로 재사용하지 않는다. 테스트 수행과 결과 확인 담당은 agent인지 human인지 표시한다.
