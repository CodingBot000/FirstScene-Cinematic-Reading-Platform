# FirstScene 운영 가이드

## 로컬 시작과 정지

Node24/pnpm10과 실행 중인 Docker가 필요합니다. `pnpm install --frozen-lockfile`, `pnpm db:up`, `pnpm db:migrate`, `pnpm build` 순서로 실행한 뒤 `node tools/start-web.mjs --port 3100`으로 시작합니다. 서버는 종료한 터미널에서Ctrl-C로 정지합니다. 포트가 점유되어 있으면 기존 프로세스의 소유 프로젝트를 확인하고 다른 프로젝트를 종료하지 마세요.

`/health/live`는 프로세스, `/health/ready`는 실제 DB 접근 상태를 확인합니다. DB 장애에서도 공개 원고는 서버 렌더링됩니다. 잘못된 Origin·런타임 권한·필수 비밀값 설정은 시작 단계에서 종료됩니다. 서버에는 런타임 DB 역할만 전달합니다. 마이그레이션 소유자 연결을 앱 환경에 넣지 마세요.

DB 정지 시 `execution/local-database.json`의 소유한 컨테이너를 확인하여 해당 컨테이너만 `docker stop`합니다. 볼륨은 보존합니다. `pnpm db:up`으로 재시작합니다. `docker system prune`, 공용 DB 삭제 또는 볼륨 일괄 삭제를 사용하지 마세요.

## 데이터와 복구

2026-11-28 로컬 복구 훈련에서는 격리 PostgreSQL 17.12의 합성 세션·설정·영수증을 `pg_dump -Fc`로 백업했습니다. 별도 빈 DB에 `pg_restore --no-owner --exit-on-error`로 복원한 뒤 7개 테이블의 행 해시와 제한 역할을 쓰는 앱의 설정 조회를 확인했습니다. 운영 백업 복원과 운영 롤백은 별도 승인과 검증이 필요합니다. [복구 훈련과 증거](case-study.md#빌드와-복구를-확인하는-방법)

`.env.local`, `apps/web/.env.local`, `artifacts/private/`는 비공개이며 Git에 추가하지 않습니다. 비밀번호나 접속 URL은 로그에서 제외합니다. 공개 서비스는 Vercel에서 실행되며, Neon PostgreSQL 17을 운영 DB로 사용합니다. 애플리케이션은 제한된 런타임 역할로 접근합니다. 운영 백업의 보존 기한과 복구 작업은 데이터 소유자의 승인을 받습니다. 격리 환경에서 백업은 `pg_dump -Fc`로 비공개 경로에 저장하고 별도의 빈 DB에 복원합니다. [공개 서비스](https://firstscene-one.vercel.app)

마이그레이션은 advisory lock과checksum으로 순서 및 변경을 확인합니다. 배포 서버 시작에서 자동 실행하지 않습니다. 만료 데이터 정리는 운영자 작업으로 실행합니다. `pnpm db:cleanup`은 명시적으로 확인한 로컬 DB에서 만료 세션·receipt·rate bucket을 제한된 배치로 정리합니다. 발급 후30일 유효기간과 실제 정리 시점은 다릅니다. 기록 삭제는 서버204성공 후에만 완료로 표시됩니다. 실패 시 보류 중 변경과 복구 동작을 유지합니다.

## 임시 CI DB

```sh
CI=true FIRSTSCENE_CI_DISPOSABLE=1 pnpm db:ci:up
CI=true FIRSTSCENE_CI_DISPOSABLE=1 node tools/database/ci-run.mjs pnpm db:prepare-test
CI=true FIRSTSCENE_CI_DISPOSABLE=1 node tools/database/ci-run.mjs pnpm check:qa
CI=true FIRSTSCENE_CI_DISPOSABLE=1 pnpm db:ci:down
```

CI 서비스는 워크스페이스·UUID label, DB comment, 비공개 소유 receipt를 대조합니다. 종료 명령은 이 도구가 만든 컨테이너와 임시 볼륨만 제거합니다. 테스트는 추가 임시 DB를 만들고 마이그레이션·권한 분리를 검증한 뒤 자신이 만든 DB만 제거합니다. `FIRSTSCENE_CI_DISPOSABLE=1` 없이 운영/개발 URL을 CI에 전달하지 마세요.

macOS에서 WebKit의 trusted pointer 좌표가 잘못 전달되는 환경에는 명시적으로 Linux WebKit QA를 사용할 수 있습니다. `node tools/prepare-linux-webkit.mjs`로 고정된 공식 이미지를 준비한 뒤 위 명령에 `FIRSTSCENE_LINUX_WEBKIT=1`을 추가합니다. 소스는 읽기 전용으로 마운트되며 테스트 컨테이너만 소유 확인 후 정리합니다. Chromium은 호스트에서 실행합니다. 이 조합을 실물Safari/iPhone검증으로 표시하지 않습니다.

전체 브라우저 검사는 독립된 스펙 파일 4개마다 새 DB를 사용합니다. 승인된 네트워크당 15분 30세션 제한을 유지하며 실패, 생략, 불안정 사례를 통합 보고서에 남깁니다.

새 체크아웃에서 Linux WebKit의 특정 파일을 먼저 검사할 때는 테스트 출력의 마운트 지점을 준비합니다. 임시 CI DB를 준비한 뒤 다음 명령을 실행합니다.

```sh
pnpm build
pnpm storybook:build
node tools/prepare-linux-webkit.mjs
mkdir -p test-results
CI=true FIRSTSCENE_CI_DISPOSABLE=1 FIRSTSCENE_LINUX_WEBKIT=1 \
  node tools/database/ci-run.mjs pnpm test:e2e:webkit -- \
  tests/e2e/public.spec.ts tests/e2e/story-motion.spec.ts
```

## 검증과 배포

별도의 동일 조건 브라우저 기준선과 DevTools 진단은 [성능 기준선](performance-baseline.md)의 절차를 사용합니다.

GitHub Actions의 PR 및 `main` 검사는 `pnpm check:ci`로 빌드, 실제 DB와 브라우저 테스트, 재현 가능한 보안 검사, 성능 검사, 화면 수집을 실행합니다. `pnpm check:qa`는 전체 제품 자동 회귀와 새 화면 수집을 실행합니다. 검토한 이미지의 증거는 `pnpm test:visual -- --verify-review`로 확인합니다. `pnpm check:release`와 `pnpm check:full`은 동일한 엄격 검사이며, 관리형 감사와 수동 검수 등 출시 선행조건을 확인합니다.

Docker 이미지는 `pnpm container:build`로 만들고, 준비된 임시 CI DB에서 `pnpm container:smoke`로 검사합니다. 이미지는 비root 사용자로 실행하며 비밀값과 마이그레이션 소유자 환경은 포함하지 않습니다. Docker smoke의 로컬 재시작 증거는 공개 환경의rollback 증거를 대신하지 않습니다.

2026-11-28에 공개 `main` `45f1878`의 Vercel 운영 배포를 확인했습니다. 같은 커밋의 CI 19개와 Docker smoke 13건이 통과했고, 공개 도메인의 읽기 전용 경로 6곳이 HTTP 200을 반환했습니다. [main CI](https://github.com/CodingBot000/FirstScene-Cinematic-Reading-Platform/actions/runs/46074995204) · [운영 배포](https://vercel.com/miracle3days-projects/firstscene/BKopQQcjCk7KPSShWyvU7mf5pWFW)

`pnpm deploy:preflight`는 승인된 프로젝트의 요금, DB 호환성, TLS, 연결 풀, 최소 권한 및 비밀값 보관 증거를 검증해 영수증을 발행합니다. `pnpm deploy:smoke`는 배포 커밋과 영수증을 대조한 뒤 승인된 임시 세션의 저장과 격리를 확인합니다. 운영 롤백과 백업 복원은 해당 작업의 승인을 받습니다. [입력 형식과 명령](../15_COMMAND_CATALOG.md#cmd-deploy-preflight--remote-capability)

PR에서는 추적 파일의 비밀값, 클라이언트 번들, 인증 우회 여부와 API 부정 사례를 검사합니다. 비공개 입력으로 확인해야 하는 별도 검사는 일치하는 증거가 없으면 `DEFERRED_TO_RELEASE`로 기록합니다. 엄격 검사에는 로컬 비공개 입력 또는 정확한 소스에 대한 유효한 검증 증거가 필요합니다.

피드백은 사용자 승인에 따라 Asia/Seoul달력일(한국시간00:00초기화) 기준5회/작품/세션입니다. DB세션의timezone이나 사용자입력timestamp에 의존하지 않습니다. FEEDBACK_LIMIT429에는 다음한국자정까지의Retry-After가 있습니다. 자유입력·계정간공유·자동오프라인전송은 제공하지 않으며, 응답을 확인하지 못하면 현재 화면에서 같은operationId로 직접 다시 시도합니다.

공개 세션 발급에는 검증된 ingress가 필요합니다. 현재 adapter는 실제 Vercel runtime metadata와 FIRSTSCENE_TRUSTED_INGRESS=vercel의 명시적 운영 설정을 함께 확인하고, 보호된 주소 헤더를 HMAC rate bucket에만 사용합니다. 모르는 플랫폼·누락된 metadata·잘못된 주소에는 글로벌 fallback없이 발급을 거부합니다. 실제 공급자/헤더 검증 전에는 이 옵션을 설정하지 않습니다. 로컬 모드는 loopback출처30회/15분으로 검증합니다. [결정 근거](../decisions/session-network-boundary.md)에 조건을 기록했습니다.


## 2026-11-22 배포 전 확인 항목

기능 병합 커밋 `82a55454`의 GitHub Actions는 성공했습니다. 단, 이 증거만으로 공개 환경의 서비스 URL·권한·DB·실사용자 세션을 검증했다고 간주하지 않습니다. 운영 활성화 전 아래 조건을 별도로 확인해야 합니다.

1. **대상 확인:** 올바른 배포 프로젝트/팀, Git 연동 대상, 허용된 요금·결제 정책, 프로덕션 브랜치 `main` 확인
2. **환경 및 DB:** PostgreSQL 버전·TLS·연결 풀·런타임 최소 권한·마이그레이션 실행 주체·비밀값 관리 확인. 운영 DB 백업과 빈 DB 복원 검증 전 데이터 변경 금지
3. **출시 게이트:** `pnpm deploy:preflight`, 필요한 관리형 보안 검토, 프리뷰 환경의 인증·안전성·성능 확인
4. **배포 후:** `/health/live`, `/health/ready`, 탐색·읽기·익명 세션·진도/북마크·삭제, WebGL 미지원 및 reduced-motion fallback을 실제 URL에서 검증
5. **복귀:** 배포 artifact·환경 설정·데이터 schema 호환 범위를 기록하고 복귀 절차를 검증. 프로덕션 정합성을 확인한 뒤에만 완료 상태 갱신

운영 권한이 거부되거나 실제 대상이 확인되지 않으면 배포를 성공으로 기록하지 않습니다. GitHub Actions 성공, 배포 공급자 빌드 성공, 공개 접속 및 상태 변경 E2E 성공은 서로 다른 증거입니다.
