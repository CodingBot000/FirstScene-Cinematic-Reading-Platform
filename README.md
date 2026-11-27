# FirstScene — Cinematic Reading Platform

문장 읽기를 중심에 두고, 장면의 분위기를 선택적으로 더하는 반응형 웹 독서 플랫폼입니다. **시네마틱 오리지널 단편 2편**, **원문 읽기 가능한 한국 고전 20편**, **공개 예정 콘셉트 34편**을 구분합니다. 콘셉트 목록은 완결 원고나 제공 중인 읽기 기능을 의미하지 않습니다.

## 제품 사용 흐름

- **랜딩:** 문장과 장면 이미지를 중심으로 한 시네마틱 인트로. 조건에 맞는 데스크톱에서는 선택적으로 WebGL2 분위기 효과를 사용하며, 그렇지 않으면 정적인 HTML/CSS 표지를 유지합니다.
- **탐색 `/discover`:** 오리지널 2편·읽을 수 있는 고전 20편·공개 예정 콘셉트 34편을 구분하고, 제목 검색, 상태·분위기·장르 필터와 URL 상태 동기화를 제공합니다. 읽을 수 있는 작품은 카드의 표지에서 작품 소개로 이어지고, 예정 콘셉트는 안내 UI를 엽니다. 데스크톱의 GSAP Flip은 필터 변경 시 카드 이동만 장식적으로 연출합니다.
- **시네마틱 읽기 `/read/[storyId]`:** 오리지널 완결 단편 2편, 총 12씬·72문단. 연출 읽기에서는 표지가 첫 장면으로 이어지고, 스크롤 방향에 맞춰 장면 이미지·제목·번호가 전환됩니다. 완독 효과는 서버 저장 뒤에 표시합니다. 일반 읽기·효과 줄이기에서는 전환 없이 본문과 상태를 표시합니다. 공개 본문은 JavaScript나 DB 연결 없이도 읽을 수 있습니다.
- **고전 읽기 `/read/classic-…`:** 한국 고전 20편의 전사본과 출처를 표시합니다. 작품 소개에서 읽기를 시작하면 기존 표지가 본문 머리로 이어집니다. 고전에는 작품별 장면 이미지와 완독 저장이 없습니다. 예전 `/classics/[id]` 주소는 새 읽기 경로로 이동합니다. [수록작·출처](docs/public/classic-sources.md)
- **개인 기록:** 브라우저별 익명 세션에서 진도·북마크·설정을 저장하고, 오프라인 재시도·충돌 처리와 명시적 완독/삭제를 지원합니다. 계정 및 기기 간 동기화는 제공하지 않습니다.

오리지널의 공개 이미지 16개와 AVIF·WebP 변형 92개를 사용합니다. 고전 20편의 표지도 카드, 작품 소개, 읽기 화면의 크기에 맞춰 AVIF·WebP로 제공합니다. 고전 본문에는 원저자와 전사 출처를 표시하며, 표지는 포트폴리오 제작 과정에서 만든 생성 삽화입니다.

## 기술 구성과 설계 판단

**Next.js 16 / React 19 / TypeScript / GSAP 3 / WebGL2 / PostgreSQL / pnpm / Docker / Playwright**

- `apps/web`: App Router, 동일 Origin API, 작품 탐색/읽기/상태 UI. `lib/discovery-model.ts`는 순수 필터 모델, `components/useDiscoveryQuery.ts`는 URL 동기화, `components/useCatalogFlip.ts`는 선택형 카드 이동 효과를 담당합니다.
- `components/CoverPortalLayer.tsx` + `lib/graphics/cover-portal.ts`: 조건부 WebGL2 로딩, DPR/프레임 상한, 비가시 상태 일시 중단, context loss/언마운트 정리. 읽기 핵심 경로와 분리합니다.
- `packages/reader-core`, `reader-react`, `story-schema`, `content-compiler`, `tokens`, `ui`, `server-data`: 순수 계산·렌더링·공개 UI·서버 영속성을 독립된 경계로 분리합니다. 공유 UI는 목적별 구현 파일로 나누되 외부 import 계약을 유지합니다.
- `features/reading-sync`: read-only DTO selector를 별도 파일로 분리했지만, 변경 처리·epoch·outbox·삭제 소유권은 하나의 상태 머신에 유지합니다.

[아키텍처](docs/public/architecture.md) · [Creative Frontend ADR](docs/public/adr-creative-showcase-2026-11.md) · [사례 연구](docs/public/case-study.md) · [운영 가이드](docs/public/runbook.md)

## 로컬 실행

Node.js 24 및 pnpm 10, Docker가 필요합니다. 의존성은 lockfile로 고정합니다.

```sh
pnpm install --frozen-lockfile
pnpm db:up
pnpm db:migrate
pnpm build
node tools/start-web.mjs --port 3100
```

로컬 주소: `http://127.0.0.1:3100`. `pnpm db:up`은 전용 PostgreSQL 및 비공개 환경 구성을 준비합니다. 비밀값이나 로컬 원본 자산을 커밋하지 마세요.

## 검증과 실제 한계

PR #9의 검증 기록은 2026-11-22 기준입니다. 표지·읽기 전환을 추가한 PR #23은 CI 19개와 Docker smoke 13개를 통과했습니다. 같은 파일 트리를 병합한 `main` `e75db43`의 실행에서는 WebKit 3건이 실패해 Docker 검사가 생략됐습니다. 운영 배포 날짜와 확인 범위도 릴리스 보고서에 기록했습니다. [릴리스 보고서](RELEASE_REPORT.md)

```sh
pnpm check:ci
pnpm check:full -- --collect
pnpm check:full
```

**CI 통과는 운영 배포·현장 품질 검증의 완료를 의미하지 않습니다.** 실기기 GPU/모바일 사용성, 사람 대상 사용성 평가, 관리형 보안 감사, 운영 DB 백업·복구, 공개 smoke·rollback 검증은 별도입니다. `LOCAL_PRODUCT_READY` 및 `PUBLIC_RELEASE_READY`는 선언하지 않았습니다. 운영 관측과 현재 코드의 검증 증거는 릴리스 보고서의 커밋과 실행 링크에서 확인할 수 있습니다.
