# 15. Command Catalog

이 명령들은 Codex가 제품 개발에서 구현할 **계약**이다. 문서 ZIP만으로 pnpm 앱이 실행되는 것은 아니다. `CMD-DOCS`만 문서 검사용으로 현재 포함한다. 인자 대문자 자리표시는 실제 도구 결과/승인 파일을 사용하며 secret을 출력하지 않는다.

## CMD-ENV — environment probes
```sh
node --version; pnpm --version; git status --short; docker version
```
Record capability availability without secrets. Missing tools are explicit facts, not fabricated success.

## CMD-INSTALL — workspace install
```sh
pnpm install --frozen-lockfile
```
Reproducible install after initial lock is created; no canary or implicit major update.

## CMD-LINT — static style
```sh
pnpm lint
```
ESLint and format checks; failure nonzero.

## CMD-TYPE — type contracts
```sh
pnpm typecheck
```
TS strict all packages and applications.

## CMD-BOUNDARY — package isolation
```sh
pnpm check:boundaries
```
Check contracts/package-boundaries.json and no src deep imports.

## CMD-CONTENT — content compiler
```sh
pnpm content:check
```
Compile canonical Markdown; schema, semantic and fixture hash parity; bad fixtures must fail.

## CMD-UNIT — pure logic
```sh
pnpm test:unit
```
Vitest unit and component tests; no live paid endpoints.

## CMD-STORYBOOK — component showcase
```sh
pnpm storybook:build
```
Build Next-free React/Vite UI lab with all declared component states.

## CMD-DB-UP — local database
```sh
pnpm db:up
```
Start owned loopback container only, no volume deletion or other project actions.

## CMD-MIGRATE — schema migration
```sh
pnpm db:migrate
```
Owner connection, advisory lock and checksum tracking; fail on checksum drift.

## CMD-DB-TEST — database integration
```sh
pnpm test:db
```
Fresh isolated PostgreSQL namespace/DB, migration/CAS/quota/isolation/cleanup; never production reset.

## CMD-API — API contracts
```sh
pnpm test:api
```
OpenAPI responses, security and actual PostgreSQL persistence.

## CMD-BUILD — production build
```sh
pnpm build
```
Packages then web production output; public source/generated parity.

## CMD-DEV — development run
```sh
pnpm dev
```
Local server; startup prints safe URLs only.

## CMD-E2E — browser flows
```sh
pnpm test:e2e
```
Production build server and real DB, Chromium full journeys.

## CMD-WEBKIT — mobile browser
```sh
pnpm test:e2e:webkit
```
WebKit core reading/restore/bookmark/reduced journey.

## CMD-A11Y — accessibility
```sh
pnpm test:a11y
```
Axe plus automated keyboard/reduced/zoom checks; manual semantic review remains required.

## CMD-VISUAL — visual artifacts
```sh
pnpm test:visual
```
Capture stable viewport states; do not auto-approve new baselines.

## CMD-PERF — performance
```sh
pnpm test:perf
```
3 cold lab runs, environment/profile, median LCP/CLS/TBT and transfer budget; no field claims.

## CMD-PACK — independent consumption
```sh
pnpm pack:smoke
```
Tarball install into external temporary React/Vite consumer; no Next/pg.

## CMD-SECURITY — security
```sh
pnpm test:security
```
Ownership/CSRF/limits/XSS + secret/public-name scan; no false audit claims.

## CMD-ASSET-PLAN — generation queue
```sh
pnpm assets:plan
```
Validate asset dependency DAG, prompts and unfinished work. Zero generation calls.

## CMD-ASSET-IMPORT — import native result
```sh
pnpm assets:import -- --id ASSET_ID --file ACTUAL_PATH --provider codex-native
```
ASSET_ID and ACTUAL_PATH are runtime arguments from actual tool results, not literal strings to execute.

## CMD-ASSET-OPT — optimize approved assets
```sh
pnpm assets:optimize
```
Approved sources only; derive portraits, generate AVIF/WebP variants and manifest.

## CMD-ASSET-VERIFY — release asset audit
```sh
pnpm assets:verify -- --release
```
Require 16 approved real public assets and hashes, no temporary backgrounds.

## CMD-ASSET-API — optional paid adapter
```sh
pnpm assets:generate:api -- --budget-file AUTHORIZED_BUDGET_FILE
```
Default denied; explicit preauthorized finite budget and key needed. No paid call in CI.

## CMD-CI — PR 자동 검사
```sh
pnpm check:ci
```
새 DB와 프로덕션 빌드에서 재현할 수 있는 검사를 실행한다. 원시 비공개 입력을 사용할 수 없는 검사와 새 화면의 승인은 각각 보류로 기록한다. 재현 가능한 보안 검사와 화면 수집 자체의 실패는 CI 실패다.

## CMD-PRODUCT-QA — 독립 제품 QA
```sh
pnpm check:qa
pnpm test:visual -- --verify-review
```
로컬에서 전체 자동 회귀와 화면 수집을 실행한다. 새 화면을 열어 검토한 뒤 같은 캡처의 승인 근거를 검증한다. 수집 성공과 승인 결과를 각각 보존한다.

## CMD-RELEASE / CMD-FULL — 엄격한 로컬 출시 검사
```sh
pnpm check:release
```
`pnpm check:full`은 같은 엄격 검사다. 자동 검사와 함께 실제 확대·화면 승인·비공개 출처 검사·관리형 감사 및 필수 작업 상태를 확인한다. 공개 서비스의 실제 배포·smoke·복귀 검증은 P09에서 별도로 확인한다.

## CMD-STATE — execution ledger
```sh
pnpm check:state
```
Tasks DAG, DONE evidence/commit, progress reconciliation, no unsupported completion.

## CMD-CLEANUP — bounded maintenance
```sh
pnpm db:cleanup
```
Delete expired session/receipt/rate data in bounded batches, redacted counts only.

## CMD-DEPLOY-PREFLIGHT — remote capability
```sh
pnpm deploy:preflight
```
Read-only target/auth/cost/version checks. Never auto-create paid resources.

## CMD-DEPLOY-SMOKE — public validation
```sh
pnpm deploy:smoke -- --base-url VERIFIED_URL
```
Verify actual production session/TLS/DB/isolation/assets; same-origin headers correctly set.

## CMD-DOCS — package docs check
```sh
python tools/validate_package.py
```
This command is provided now. Checks documentation contracts/examples and reports scope separately from product tests.

## CMD-DB-PREPARE — isolated CI runtime role
```sh
pnpm db:prepare-test
```
Use DIRECT_DATABASE_URL only for isolated CI DB. Create dedicated non-owner runtime role with random masked password, apply migration, export DATABASE_URL/RATE_LIMIT_HMAC_SECRET through GITHUB_ENV without printing them. Fail if target is not an explicitly marked test DB.


## CMD-QA-COLLECT — 보완 전 전체 결과 수집
```sh
pnpm check:full -- --collect
```
모든 필수 suite를 실행하고 실제 종료 코드를 보존한다. 수집 자체가 완결된 경우에만 명령을 0으로 종료하며, 개별 테스트 실패를 성공으로 바꾸지 않는다. 결과는 `RESULTS_COLLECTED`, `releaseReady=false`로 기록한다. 미실행 suite나 누락된 보고서가 있으면 수집도 실패다. 엄격한 출시 판정은 옵션 없는 `CMD-FULL`이다.
