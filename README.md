# FirstScene

문장을 중심에 둔 Cinematic Reading Platform입니다. 완결된 단편 두 편을 일반 읽기 또는 절제된 장면 연출과 함께 읽을 수 있습니다. 각 작품은6씬·36문단으로 구성되며, 실제 생성한16개 공개 이미지와92개AVIF/WebP 변형을 사용합니다.

## 실행

Node24와pnpm10을 사용합니다. 의존성은 exact pin과lockfile로 고정합니다.

```sh
pnpm install --frozen-lockfile
pnpm db:up
pnpm db:migrate
pnpm build
node tools/start-web.mjs --port 3100
```

로컬 주소는 `http://127.0.0.1:3100`입니다. 최초 `db:up`이 프로젝트 전용 PostgreSQL과 비공개 환경 파일을 준비합니다. 환경 파일이나 원시 이미지를 커밋하지 마세요. 상세 정지·백업·복구 절차는 [운영 가이드](docs/public/runbook.md)를 참고하세요.

## 구현한 기능

- 작품 탐색, 소개,12씬·72문단의 서버 렌더링 본문, JavaScript 없는 읽기
- 일반/연출 모드, OS reduced-motion 반영, 테마·글자 크기·목차·위치 복원
- 브라우저별 익명 세션, 진도·북마크·설정 저장, 오프라인 재시도와 충돌 처리
- 사용자의 명시적 완독 기록, 기록 삭제와 다른 탭의 삭제 상태 반영
- 선택형 연출 평가: 세션·작품별 한국 시간 자정에 초기화되는 하루5회 제한
- Next와DB 의존성이 없는5개 공개 패키지의 외부React/Vite 소비 예제

계정이나 기기 간 동기화 기능은 없습니다. 익명 세션의 접근 유효기간은 발급 후30일이며 정리 작업이 만료 데이터를 제거합니다. 마지막 문단에 도착하는 것과 완독 기록은 별개입니다.

## 검증과 한계

실제 PostgreSQL, production build, Chromium·WebKit, 접근성 자동 검사, 외부 패키지 소비, 이미지 해시, Docker 시작·저장·재시작 검사를 수행했습니다. 화면 검수는 에이전트가 수행했으며 사람의 사용성 평가는0건입니다. 성능 수치는 실험실 측정이고 현장 사용자 성과가 아닙니다. [구현 사례](docs/public/case-study.md)에서 결함 재현과 수정 근거를 확인할 수 있습니다.

피드백 일별 집계는 사용자 승인에 따라 Asia/Seoul자정 기준으로 구현했습니다. 실제200%브라우저 확대와 키보드 검수를 완료하고100%로 복원했습니다. 관리형 소스 보안 감사는 발견사항 ID충돌로 최종 확정하지 못했으며 공개 배포도 미완료입니다. `LOCAL_PRODUCT_READY`와 `PUBLIC_RELEASE_READY`를 선언하지 않았습니다. 공개 서비스URL은 없습니다. 현재 검증 상태는 [릴리스 보고서](RELEASE_REPORT.md)에 기록합니다.

```sh
pnpm check:full -- --collect  # 실제 결과 수집; 출시 판정 아님
pnpm check:full              # 엄격한 로컬 완료 gate
```

CI는 별도의 임시 DB와 무작위 비밀번호를 사용하며 운영 DB·유료 이미지 API·자동 공개 배포를 사용하지 않습니다. 내부 계획 자료와 비공개 원문은 공개 문서 묶음에 포함하지 않습니다. 로컬 Git 이력 전체를 공개 저장소로 올릴 수 있다는 뜻은 아닙니다.
