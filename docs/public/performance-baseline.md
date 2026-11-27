# FirstScene 브라우저 성능 기준선

`pnpm perf:baseline`은 출시용 `pnpm test:perf`와 별도로 실행하는 진단 명령입니다. 홈, 오리지널 소개와 읽기, 탐색, 고전 소개와 읽기, 가장 긴 고전 읽기, 서재, 설정에서 Chromium 탐색을 측정합니다. 가장 긴 고전은 20편의 NFC 정규화 텍스트를 유니코드 코드 포인트 수로 비교해 결정하며 제목과 본문은 로그에 기록하지 않습니다.

## 실행

Docker를 준비한 뒤 검증할 커밋에서 production build와 이 체크아웃 소유의 임시 CI DB를 생성합니다.

```sh
pnpm install --frozen-lockfile
pnpm build
CI=true FIRSTSCENE_CI_DISPOSABLE=1 pnpm db:ci:up
CI=true FIRSTSCENE_CI_DISPOSABLE=1 node tools/database/ci-run.mjs pnpm db:prepare-test
CI=true FIRSTSCENE_CI_DISPOSABLE=1 node tools/database/ci-run.mjs pnpm perf:baseline -- --trace
CI=true FIRSTSCENE_CI_DISPOSABLE=1 pnpm db:ci:down
```

`--smoke`는 진단 명령을 검증하기 위해 세 경로에서 1회만 측정합니다. 일반 실행은 경로별로 다섯 번 측정합니다. `--trace`는 합성 상호작용의 DevTools trace를 같은 로컬 작업 경로에 저장합니다. 성공 여부와 관계없이 실제로 생성한 임시 CI DB를 정리합니다. 소유 조건은 [운영 가이드](runbook.md)의 절차를 따릅니다.

## 비교 조건

- 하나의 production build에서 고정 Chromium과 390×844, DPR 1, CPU 4배 제한, RTT 150ms의 DevTools 실험을 구성합니다. 실제 적용한 네트워크 처리량과 도구 버전을 보고서에 기록합니다.
- 측정하지 않는 홈 탐색을 한 번 수행한 뒤 경로마다 새 프로필로 cold를 측정합니다. warm은 같은 브라우저 문맥에서 쿠키와 로컬·세션 저장소를 비우고 HTTP 캐시를 유지한 채 즉시 다시 불러옵니다. 브라우저 캐시에서 데이터가 온 것으로 관측한 건수도 기록합니다.
- load 및 제목 렌더링 뒤 1,200ms 동안 도착한 자료를 포함합니다. 요청별 시간, 압축 전후 크기, 전송 크기, 선택된 이미지 경로, LCP의 네 구성 시간, CLS, 이벤트 시간, 긴 태스크와 프레임 간격을 보존합니다. Lighthouse TBT는 새 cold 프로필의 별도 측정에서 수집합니다. [LCP 구성 시간](https://web.dev/articles/optimize-lcp) · [Lighthouse TBT](https://developer.chrome.com/docs/lighthouse/performance/lighthouse-total-blocking-time)
- React 커밋은 고정 버전의 DevTools 연동 콜백에서 기록한 시각입니다. 컴포넌트별 렌더 시간은 profiling build가 필요합니다. Event Timing은 노출된 합성 이벤트의 처리 시간을 나타냅니다. 현장 백분위나 실제 기기의 INP를 산출하지 않습니다. [React Performance Tracks](https://react.dev/reference/dev-tools/react-performance-tracks) · [Event Timing](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceEventTiming)

## 증거

`artifacts/private/performance-baseline/` 아래에 다음 파일을 생성합니다.

| 파일 | 기록 |
| --- | --- |
| `index.json` | 측정 대상 커밋, build ID, 실행 범위와 각 파일 SHA-256 |
| `baseline.json` | 경로별 원자료와 중앙값·최대값, 계측 OFF/ON 검색 쌍과 합성 상호작용 시각 |
| `waterfall.html` | 각 경로와 캐시 조건에서 LCP 순서상 중앙에 위치한 실행의 요청 |
| `journey.trace.json` | `--trace`를 붙였을 때 생성되는 로컬 합성 세션의 DevTools 자료 |

검색과 설정 반영, 표지 전환의 시작·업데이트·준비·종료, 활성 독서 위치, 장면 효과의 종료와 350ms 인위적 디코드 지연에서의 취소, 저장 큐·서버 확인·완독 도장의 시점을 기록합니다. 스크립트가 수집한 시각과 브라우저 수명 주기를 보고서에서 식별할 수 있습니다. 도착하지 않은 선택적 브라우저 이벤트의 빈 배열과 지원하지 않는 API의 `null`을 함께 확인합니다. 공개 자료에는 검토한 집계만 사용합니다.

### 전후 비교 양식

| 항목 | 기준 | 변경 후 |
| --- | --- | --- |
| 커밋 및 build ID | | |
| 경로, 캐시, 브라우저, 뷰포트, CPU·네트워크 조건 | | |
| 실행 수와 원자료 해시 | | |
| LCP, CLS, TBT, 전송량의 중앙값·최대값 | | |
| 상호작용, React 커밋, 프레임 구간과 계측 비용 | | |
| 수치 편차와 재현 조건 | | |

비교 환경을 맞추고 각 실행의 분산을 확인합니다. 경로별 신규 예산은 노이즈 범위를 검토한 뒤 별도로 결정합니다.
