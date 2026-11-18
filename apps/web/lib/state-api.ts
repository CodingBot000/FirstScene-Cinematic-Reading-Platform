import "server-only";
import { createStateRepository } from "@firstscene/server-data";
import { dataPool, rateSecret } from "./api";
import { stories } from "./catalog";
let repository: ReturnType<typeof createStateRepository> | undefined;
export function stateRepository() {
  return (repository ??= createStateRepository(
    dataPool(),
    stories,
    rateSecret(),
  ));
}
