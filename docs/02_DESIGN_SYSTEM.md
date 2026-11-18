# 02. Design System · Typography · Components

## 1. 시각 방향: 책의 여백과 영화의 장면
범용 SaaS 대시보드나 과도한 네온 UI를 만들지 않는다. 홈은 따뜻한 종이색 바탕·큰 명조 제목·넓은 여백과 작품별 아트워크를 사용한다. 리더는 어두운 주변 배경과 **불투명 읽기 면**을 분리한다. 작품 mood가 바뀌어도 본문 가독성은 안정적이다. 장식은 1px 규칙선, 작은 챕터 번호, 절제된 색상으로 통일한다.

시각 디자인 대안을 설명만 하고 멈추지 않는다. P01에서 홈/리더 2개 레이아웃을 구현 가능한 내부 와이어로 비교해 **비대칭 표지+편집형 텍스트 홈, 좌측/상단 장면+우측/하단 본문 리더**를 선택한 근거를 남긴다. 사용자 선택 대기 없이 P03에서 실제 화면 검수로 보완한다.

## 2. 토큰 계층
`design/tokens.json`이 source of truth다. primitive → semantic → component 토큰을 생성한다. 패키지 `@firstscene/tokens`는 CSS custom properties, TypeScript readonly map, JSON을 export하며 React/Next를 import하지 않는다. story ID와 제품 문구는 토큰에 넣지 않는다. 다크/라이트/reader tone은 semantic map으로 처리한다.

- 색상: paper `#F5F1E8`, ink `#242522`, secondary `#5B5E57`, accent `#8B3F2F`, dark surface `#171C20`, dark text `#F4F0E8`.
- mood 주변 배경: calm `#16262B`, memory `#3C3029`, tension `#1C2037`, climax `#34212E`, relief `#24372D`.
- reading surface는 dark `#171C20` 또는 light `#F5F1E8`. 이미지 위 투명 글상자를 본문 기본값으로 쓰지 않는다.
- spacing: 4/8/12/16/24/32/48/64/96px. 컨트롤 radius 8px, 카드 16px, portrait 12px. 모든 요소를 둥근 pill로 만들지 않는다.
- line width: 본문 `max-inline-size: 34rem`, 한글 약 26~34자 한 줄 목표. `ch`는 한글 글자 수가 아니므로 실제 렌더 검수한다.

## 3. 타이포그래피
| 역할 | 폰트 계열 | desktop / mobile | weight / line-height |
|---|---|---|---|
| Display | Noto Serif KR 우선, serif fallback | clamp(36px, 4.5vw, 64px) / 36px | 600 / 1.2 |
| 작품 제목 | 같은 명조 | 36 / 28 | 600 / 1.35 |
| 본문 | Noto Serif KR 또는 시스템 serif | 기본 20 / 20 | 400 / 1.9 |
| UI·버튼 | Noto Sans KR 또는 시스템 sans | 15 / 15 | 500 / 1.45 |
| 보조 설명 | sans | 14 / 14 | 400 / 1.6 |
| 장면 번호 | sans, tabular-nums | 12 / 12 | 600 / 1.5 |

폰트 바이너리는 이 패키지에 포함하지 않는다. 개발 시 공식 배포처·라이선스·checksum을 확인해 OFL 등 허용 조건의 WOFF2만 사용하고 고지를 보존한다. 기본 실패 대응은 시스템 폰트이며 그 이유로 전체 개발을 멈추지 않는다. 2계열·각 2weight를 넘기지 않는다. 한국어 전체 폰트가 커지면 콘텐츠 사용 글자 기반 서브셋+시스템 fallback을 검증하고 public 폰트의 재배포 권한을 확인한다. 읽기 위치 측정은 `document.fonts.ready` 이후 재실행한다. font-display swap, fallback metrics·CLS 확인. 글자 크기 확대를 CSS transform으로 흉내내지 않는다.

한글 `word-break: keep-all; overflow-wrap: anywhere`를 기본으로 긴 토큰에만 줄바꿈 허용. 본문 양쪽 정렬, 과도한 자간, 강제 `<br>` 줄맞춤 금지. UI 문구와 본문을 같은 폰트 크기로 처리하지 않는다.

## 4. 공유 UI 공개 계약
`@firstscene/ui`의 component props는 [design/components.yaml](../design/components.yaml)에 정의한다. 최소 Button, IconButton, Typography, StoryCard, Tag, Dialog, Sheet, Tabs, ToggleGroup, Slider, Progress, Toast, EmptyState, ErrorState, ResponsiveAsset, ReadingToolbar를 제공한다.

Button은 native button, LinkButton은 `asChild` 또는 표준 anchor를 사용한다. `next/link`를 ui에 넣지 않고 앱에서 합성한다. Dialog/Sheet는 검증된 Radix primitive를 우선하고 제목·설명·focus trap·Escape·닫은 후 focus 반환을 구현한다. shadcn 소스를 사용할 경우 복사한 코드도 우리 소유 코드로 검토하고 라이선스를 보존한다. 무작정 기본 테마를 그대로 복제하지 않는다.

StoryCard의 입력은 제품 데이터 객체 전체가 아니라 `id,title,summary,cover,href,tags,progress?` view model이다. DB/쿠키/fetch를 모른다. `ResponsiveAsset`은 검증된 local variant 목록과 alt를 받고 원격 arbitrary URL을 받지 않는다. export는 `@firstscene/ui/button` 등 leaf import와 stylesheet를 제공한다.

## 5. 컴포넌트 공통 상태
default/hover/focus-visible/active/disabled/loading/error를 Storybook에 작성한다. 로딩 상태도 width를 유지하고 버튼이 중복 실행되지 않게 한다. “비활성”으로 오류를 숨기지 않는다. 포커스 outline 2px + offset 3px, 주요 터치 타겟 최소 44×44 CSS px. 접근성 요구의 세부 기준과 프로젝트의 더 엄격한 설계 목표를 구분한다.

색 대비는 일반 텍스트 4.5:1, 큰 글자 3:1 이상 [S09]. 토큰 검사만으로 이미지 위/투명도/중간 프레임 대비를 통과했다고 하지 않는다. 본문 패널을 불투명하게 두고 실제 브라우저에서 검사한다.

## 6. 인터랙션 어휘
- 작은 UI 상태 변화 120~180ms, dialog 180ms, 장면 crossfade 480ms, mood 600ms.
- text reveal 300ms + 최대 700ms 전체 stagger; 강조 한 beat 최대 120 grapheme; 작품당 최대 4개.
- 이동 6~12px 이하, scale 최대 1.02, 본문 회전/흔들림/점멸/커서 추적 없음.
- 스크롤은 사용자 소유. pin/snap/스크롤 가로채기/과도한 parallax는 v1 금지.
- `prefers-reduced-motion: reduce` 또는 앱 “효과 줄이기”에서는 위치/크기/글자 애니메이션 0ms, 정적 배경 변경만 수행한다. WCAG 2.3.3은 AAA 조항이며 프로젝트가 자발적으로 채택한 규칙이다 [S10].

## 7. 디자인 품질 gate
각 화면을 1440×1000, 1024×768, 390×844, 320×740에서 본다. 핵심 영역이 겹치지 않음, 제목 2~3줄 이하로 자연스럽게 줄바꿈, 본문 행간 일관, 카드 높이/이미지 비율 의도적 통일, 모바일 thumb reach, 빈 상태도 완성된 디자인이어야 한다.

비평 rubric은 시각적 위계/타이포그래피/색·대비/정렬·간격/인터랙션/모바일 각각 0~2점, 총 12점 중 10점 이상 및 어느 항목도 0점이 없어야 한다. 이는 AI/개발자 자체 검수이지 사용자 만족도 수치가 아니다. 점수마다 screenshot 경로와 관찰을 남기며 가짜 PASS를 금지한다.
