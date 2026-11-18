# 의도적 실패 fixture
이 디렉터리는 정상 콘텐츠가 아니다. compiler/validator 테스트가 거절해야 한다. unknown-effect는 schema enum, duplicate-beat는 unique 의미 검사, missing-asset는 참조 검사, hash-tampered는 checksum, unsafe-story는 허용하지 않은 HTML로 거절한다. 테스트를 통과시키려고 이 fixture를 정상값으로 고치지 않는다.
