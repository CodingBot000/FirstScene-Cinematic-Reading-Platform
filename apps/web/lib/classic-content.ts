import "server-only";
import index from "../../../content/classics/catalog.json";
import { classicLoaders } from "./classic-loaders.generated";
export const classicRecordById = (id: string) =>
  index.find((record) => record.id === id);

export type ClassicManuscript = {
  title: string;
  author: string;
  text: string;
  sourceRevision: string;
  retrievedAt: string;
};
export async function loadClassicManuscript(
  id: string,
): Promise<ClassicManuscript | null> {
  if (!Object.hasOwn(classicLoaders, id)) return null;
  return (await classicLoaders[id as keyof typeof classicLoaders]()).default;
}
