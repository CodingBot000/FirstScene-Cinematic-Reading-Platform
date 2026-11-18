import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { apiSchema } from "./api-schema.js";
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats.default(ajv);
ajv.addSchema(apiSchema);
export type ApiSchemaName = keyof typeof apiSchema.$defs;
export class ApiError extends Error {
  retryAfter?: number;
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: {
      currentRevision?: number;
      currentProgress?: ProgressDto;
    },
  ) {
    super(message);
  }
}
export function assertApi(value: unknown, name: ApiSchemaName) {
  const check = ajv.getSchema(apiSchema.$id + "#/$defs/" + name);
  if (!check) throw new Error("API_SCHEMA_MISSING");
  if (!check(value))
    throw new ApiError(400, "INVALID_INPUT", "입력 내용을 확인해 주세요.");
}
export function assertApiResponse(value: unknown, name: ApiSchemaName) {
  try {
    assertApi(value, name);
  } catch {
    throw new ApiError(
      503,
      "INVALID_SERVER_STATE",
      "기록 상태를 안전하게 불러오지 못했어요.",
    );
  }
}
export function assertDeadline(deadline: number) {
  if (Date.now() >= deadline)
    throw new ApiError(
      503,
      "REQUEST_TIMEOUT",
      "요청 시간이 초과됐어요. 잠시 후 다시 시도해 주세요.",
    );
}
export type SessionContext = { id: string; epoch: string; expiresAt: string };
export type SessionDto = { epoch: string; expiresAt: string };
export type PreferencesDto = {
  mode: "plain" | "cinematic";
  effects: "full" | "reduced";
  fontSize: 18 | 20 | 22 | 24;
  theme: "light" | "dark";
  revision: number;
};
export type ProgressDto = {
  storyId: string;
  contentVersion: number;
  contentHash: string;
  sceneId: string;
  beatId: string;
  fraction: number;
  furthestOrdinal: number;
  completed: boolean;
  revision: number;
  updatedAt: string;
};
export type BookmarkDto = {
  storyId: string;
  targetId: string;
  contentVersion: number;
  createdAt: string;
};
export type MeDto = {
  session: SessionDto;
  preferences: PreferencesDto;
  progress: ProgressDto[];
  bookmarks: BookmarkDto[];
  serverPersistence: true;
};
export type MutationInput = { operationId: string };
export type PreferencesWrite = Omit<PreferencesDto, "revision"> &
  MutationInput & { expectedRevision: number };
export type ProgressWrite = MutationInput & {
  contentVersion: number;
  contentHash: string;
  sceneId: string;
  beatId: string;
  fraction: number;
  completed: boolean;
  expectedRevision: number;
};
export type BookmarkWrite = MutationInput & { contentVersion: number };

export type FeedbackWrite = MutationInput & {
  storyId: string;
  code: "helpful" | "distracting" | "too_fast" | "comfortable";
};
export type FeedbackAccepted = { accepted: true };
