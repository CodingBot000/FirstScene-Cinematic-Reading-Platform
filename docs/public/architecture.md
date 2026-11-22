# FirstScene 아키텍처와 검증 경계

`apps/web`은 Next App Router와 동일 Origin API를 제공합니다. 공개 본문은 컴파일된JSON에서 렌더링하며 DB 인증과 분리됩니다. 요청별 nonce CSP를 사용하고 HTML은 공유 정적 캐시로 제공하지 않습니다. 이미지·CSS·JS에는 정적 자산 캐시를 사용합니다.

| 패키지 | 역할 | 경계 |
|---|---|---|
| tokens | 디자인 토큰·타입 | React·DOM·DB 없음 |
| story-schema | 원고와 렌더링 계약 | 실행 가능한HTML 없음 |
| ui | 접근 가능한 공유 컴포넌트 | Next·DB 없음 |
| reader-core | 활성 문단·복원·효과 계획 | 순수 계산, DOM 없음 |
| reader-react | 문서 흐름·앵커·GSAP 수명 관리 | 서버 데이터 의존 없음 |
| content-compiler | 제한 Markdown 검증과JSON 생성 | 비공개 build 도구 |
| server-data | SQL·세션·HTTP·입력 계약 | 비공개 서버 전용 |

진도는 현재 anchor와 furthest ordinal을 분리하며 완독은 명시적 CTA 뒤에만 기록합니다. 세션별 잠금과revision CAS, operation receipt가 동시 변경과 불확실한 응답의 재시도를 처리합니다. 오프라인 저장은 브라우저 안에 한정되며 새 세션으로 이전 epoch의 큐를 가져오지 않습니다.

## 추가 구현 결정

- 독립 CI PostgreSQL 컨테이너: 개발 DB를 CI 대상으로 재사용하는 대신 UUID label·comment·receipt를 대조하는 임시 DB를 만듭니다. Docker 의존과 초기 준비 비용이 있지만 소유 경계와 정리 범위가 명확합니다.
- Docker standalone: 공식 Node24 이미지를digest로 고정하고 비root 사용자로 실행합니다. 빌드/실행을 분리하며 앱 시작에서 마이그레이션을 실행하지 않습니다. 운영 환경별 DB/TLS·배포 확인은 별도입니다.
- 공통 순수 설정 검증: Origin/cookie 정책과 필수 환경을 호스트 도구·Next hook·컨테이너에서 공유합니다. DB 네트워크 접근은 시작 검증에서 하지 않아 공개 원고 제공과readiness를 분리합니다.
- 검사 결과와 완료 판정 분리: 전체 수집 명령은 실패를 보존하고 모든 suite의 실제 실행·보고서가 있을 때만 수집 성공입니다. 엄격한 검사에서도 사용자 결정·native 확대·관리형 감사가 미완료이면 로컬 품질 gate를 통과하지 않습니다. 최종 제품 완료에는 작업 원장까지 모두 완료되어야 합니다.
- 화면 증거의 재사용 제한: 새 render source/check fingerprint와 실제 이미지hash를 검증합니다. 이전 관찰을 옮길 수 있는 경우는 픽셀이 정확히 같은 이미지뿐이며 관찰 출처를 남깁니다. 새 픽셀은 자동 승인하지 않습니다.

공개용 문서는 이 디렉터리에서 선별합니다. 내부 계획 자료, 비공개 원문, 환경 파일, 세션 데이터, 로컬 Git이력을 문서 묶음에 넣지 않습니다.


## 2026-11 Creative Frontend 병합 구조

2026-11-22 기준 `main`의 기능 병합 커밋은 `82a55454ca961874c9dbc33edd46d1d7063f87b3`입니다. 기존 책임 경계를 유지하면서 아래 표시 계층만 추가·재구성했습니다.

```mermaid
flowchart LR
  U["사용자"] --> W["Next.js App Router"]
  W --> D["Discovery UI"]
  W --> R["SSR Reading UI"]
  W --> L["Landing UI"]
  D --> M["Pure discovery model"]
  D --> Q["URL state hook"]
  D -. "조건부 카드 전환" .-> F["GSAP Flip hook"]
  L -. "지원 장치에서만" .-> G["WebGL2 portal"]
  R --> C["Reader Core / React renderer"]
  W --> API["Same-origin API"]
  API --> S["server-data"]
  S --> DB[("PostgreSQL")]
  M --> PC["Preview catalog"]
  G -. "실패 시 정적 HTML/CSS" .-> L
```

| 실제 경로 | 책임 | 비의존 원칙 |
| --- | --- | --- |
| `apps/web/lib/discovery-model.ts` | 검색·필터·정규화·공개/예정 분리 | 브라우저 DOM·DB와 분리한 순수 로직 |
| `apps/web/components/useDiscoveryQuery.ts` | URL query와 사용자 선택 상태 동기화 | 검색 결과 계산을 소유하지 않음 |
| `apps/web/components/useCatalogFlip.ts` | 필터 변경 전/후 카드 위치 전환, 중단·정리 | 결과 집합이나 읽기 상태를 변경하지 않음 |
| `apps/web/components/preview/*` | 예정작 표지와 안내 UI 공유 | 미완성 콘셉트에 읽기 라우트 부여하지 않음 |
| `apps/web/components/CoverPortalLayer.tsx` | 데스크톱·motion 조건에 따른 선택적 로딩 | 서버 본문과 저장 기능에 영향 없음 |
| `apps/web/lib/graphics/cover-portal.ts` | WebGL2 shader·렌더 루프·GPU 자원 정리 | Canvas 미지원·context loss에도 정적 화면 유지 |
| `apps/web/features/reading-sync/selectors.ts` | 읽기 DTO의 read-only 투영 | 쓰기·outbox·epoch·삭제 전이는 기존 store에 유지 |

**레이아웃 회귀:** Flip 실행 중 viewport 변경 시 이전 위치 기반 transform이 남을 수 있어 실행 취소·배치 복원 처리를 보완하고 회귀 테스트를 추가했습니다. 화면 크기 변동은 일반 카드 배치를 훼손해서는 안 됩니다. 조건부 동적 import, reduced-motion fallback, 카드 텍스트 대비 유지, 렌더 수명 종료 시 정리는 단순 장식보다 우선하는 acceptance 조건입니다.

자세한 선택 이유와 버린 대안은 [ADR](adr-creative-showcase-2026-11.md), 제품 기능/검증 한계는 [릴리스 보고서](../../RELEASE_REPORT.md)를 참조합니다.

## 장면 삽화의 반응형 표시 정책

- 연출 읽기 모드에서 6개 장면의 본문 삽화는 화면 너비와 관계없이 각 장면 제목 앞에 배치합니다. 모바일의 장면별 이미지 구성을 데스크톱에서도 확인할 수 있도록 합니다.
- 너비 1024px 초과에서는 기존 좌측 sticky 장면 배경·인물 이미지를 유지하면서 오른쪽 본문에도 장면별 배경 삽화를 표시합니다. 인물 초상은 좌측 sticky에서만 표시하여 중복과 초기 이미지 요청을 줄입니다.
- 1024px 이하에서는 좌측 sticky 무대를 숨기고 본문 내부 삽화만 표시합니다. 일반 읽기 모드에서는 기존처럼 장식 이미지를 출력하지 않습니다.
- 화면 너비에 상관없이 현재 장면과 다음 장면에만 실제 배경 이미지 경로를 연결합니다. 그 밖의 장면에는 고정 비율의 fallback을 유지해 초기 이미지 요청을 제한합니다. 모바일 인물 초상도 현재·다음 장면에만 연결합니다. 첫 장면의 priority 이미지 외에는 기본적으로 lazy-loading을 사용합니다.
- 검증: `tests/e2e/reader-scene-images.spec.ts`에서 데스크톱/모바일의 두 완결 작품을 검사합니다. 회귀 결과는 PR CI에서 확인해야 합니다.
