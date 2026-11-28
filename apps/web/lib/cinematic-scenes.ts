/**
 * The opening is a three-scene presentation, not the canonical story catalog.
 * Every scene owns its illustration, copy, and destination in DOM order.
 * This makes narrow-screen and JavaScript-disabled reading unambiguous.
 */
export type CinematicSceneDefinition = {
  id: "letter" | "station" | "archive";
  eyebrow: string;
  heading: string;
  accent: string;
  description: readonly [string, string];
  chapter: string;
  illustration: "post" | "tide" | "archive";
  artworkCaption: string;
  href: string;
  action: string;
};

export const cinematicScenes: readonly CinematicSceneDefinition[] = [
  {
    id: "letter",
    eyebrow: "FIRSTSCENE — AN INTERACTIVE READING SPACE",
    heading: "문장을 읽고,",
    accent: "장면에 머물다.",
    description: [
      "한 통의 편지에서 시작된 밤.",
      "이야기는 눈앞의 풍경이 됩니다.",
    ],
    chapter: "01 / 첫 번째 장면",
    illustration: "post",
    artworkCaption: "THE LAST POST OFFICE · NO. 01",
    href: "/read/post-office",
    action: "첫 장면 바로 읽기",
  },
  {
    id: "station",
    eyebrow: "TURN THE PAGE · ENTER ANOTHER WORLD",
    heading: "멈춰 선 역에도",
    accent: "도착하는 이야기가 있다.",
    description: [
      "수심 없는 역, 소리가 남겨진 도시.",
      "스크롤을 따라 다음 세계로 건너갑니다.",
    ],
    chapter: "02 / 두 번째 장면",
    illustration: "tide",
    artworkCaption: "THE TIDELESS STATION · NO. 02",
    href: "/read/tide-station",
    action: "두 번째 이야기 읽기",
  },
  {
    id: "archive",
    eyebrow: "공개 예정 컬렉션",
    heading: "아직 열리지 않은",
    accent: "서른네 개의 세계.",
    description: [
      "오리지널과 고전은 지금 읽을 수 있어요.",
      "공개 예정 작품은 전체 컬렉션에서 확인할 수 있어요.",
    ],
    chapter: "03 / 이어질 장면들",
    illustration: "archive",
    artworkCaption: "FIRSTSCENE · UPCOMING COLLECTION",
    href: "/discover",
    action: "전체 컬렉션 탐색",
  },
];

/** A single source of truth for the scroll rail's active scene. */
export function sceneIndexAtProgress(progress: number, count: number): number {
  if (count <= 0) return 0;
  if (!Number.isFinite(progress)) return 0;
  return Math.min(count - 1, Math.max(0, Math.floor(progress * count)));
}
