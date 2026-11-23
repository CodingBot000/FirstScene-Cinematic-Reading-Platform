import type { ClassicSummary } from "./classic-catalog";
export type ClassicManuscript = { title: string; author: string; text: string; sourceRevision: string; retrievedAt: string };
const manuscripts = {
  "classic-lucky-day": () => import("../../../content/classics/works/classic-lucky-day.json"),
  "classic-fiery-sonata": () => import("../../../content/classics/works/classic-fiery-sonata.json"),
  "classic-camellias": () => import("../../../content/classics/works/classic-camellias.json"),
  "classic-manmubang": () => import("../../../content/classics/works/classic-manmubang.json"),
  "classic-spring-spring": () => import("../../../content/classics/works/classic-spring-spring.json"),
  "classic-gold-bean-field": () => import("../../../content/classics/works/classic-gold-bean-field.json"),
  "classic-buckwheat-season": () => import("../../../content/classics/works/classic-buckwheat-season.json"),
  "classic-mountain-traveler": () => import("../../../content/classics/works/classic-mountain-traveler.json"),
  "classic-wings": () => import("../../../content/classics/works/classic-wings.json"),
  "classic-potatoes": () => import("../../../content/classics/works/classic-potatoes.json"),
  "classic-city-and-ghost": () => import("../../../content/classics/works/classic-city-and-ghost.json"),
  "classic-baettaragi": () => import("../../../content/classics/works/classic-baettaragi.json"),
  "classic-b-superintendent": () => import("../../../content/classics/works/classic-b-superintendent.json"),
  "classic-mister-bang": () => import("../../../content/classics/works/classic-mister-bang.json"),
  "classic-poor-wife": () => import("../../../content/classics/works/classic-poor-wife.json"),
  "classic-escape-letter": () => import("../../../content/classics/works/classic-escape-letter.json"),
  "classic-samryongi": () => import("../../../content/classics/works/classic-samryongi.json"),
  "classic-readymade-life": () => import("../../../content/classics/works/classic-readymade-life.json"),
  "classic-drinking-society": () => import("../../../content/classics/works/classic-drinking-society.json"),
  "classic-hometown": () => import("../../../content/classics/works/classic-hometown.json"),
};
export async function loadClassicManuscript(id: ClassicSummary["id"]): Promise<ClassicManuscript | null> {
  const loader = manuscripts[id as keyof typeof manuscripts];
  return loader ? (await loader()).default : null;
}
