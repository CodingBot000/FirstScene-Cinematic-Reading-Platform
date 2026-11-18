# 세션 발급 한도의 접속 출처 경계

소스 검수에서 신규 세션의30회/15분 한도가 모든 출처가 공유하는 global-fallback key에 연결된 것을 확인했습니다. 공개 모드에서는 한 출처가 다른 출처의 저장 시작까지 막을 수 있습니다. 현재 공개 배포나 실제 공격을 관측한 결과는 아니며, 코드 경로에서 확인한 문제입니다.

기존30회/15분 한도를 접속 출처별로 유지합니다. 로컬HTTP루프백은 하나의 loopback 출처를 사용합니다. 공개 모드는 승인된 실제 Vercel ingress를 확인한 운영자가 FIRSTSCENE_TRUSTED_INGRESS=vercel을 지정하고, 런타임의 VERCEL=1·production/preview환경·deploymentID가 제공된 경우에만 보호된 x-vercel-forwarded-for 주소를 사용합니다. 누락·잘못된주소·복수주소·다른플랫폼은 새 발급을 거부하며 글로벌/클라이언트XFF로 대체하지 않습니다. 주소 자체는DB나로그에 저장하지 않고 기존HMAC bucket에 반영합니다.

이 코드는 계정·공급자설정·현재.env에서 신뢰 옵션을 활성화하지 않습니다. 공개 배포 전 실제 ingress의 header보호와환경정보를 검증해야 합니다. Vercel외부 플랫폼은 검증된 adapter가 추가되기 전까지 공개 세션을 발급하지 않습니다. 유효한 기존 세션 재사용은 새 발급 한도를 소비하지 않습니다.

[Vercel 요청 헤더](https://vercel.com/docs/headers/request-headers)는 플랫폼의 주소 헤더와 프록시 처리 규칙을 설명하며, [시스템 환경 변수](https://vercel.com/docs/environment-variables/system-environment-variables)는 런타임 metadata의 제공 조건을 설명합니다. 이 자료를 확인해 명시적 ingress opt-in과 metadata 확인을 함께 요구하도록 구현했습니다. 외부 ingress의 실제 검증은 아직 수행하지 않았습니다.
