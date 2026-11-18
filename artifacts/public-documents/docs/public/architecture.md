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
