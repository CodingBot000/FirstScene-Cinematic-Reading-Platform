import { transportSchemas } from "./transport.generated";
import type * as Transport from "./transport.generated";
type Schema = {
  type?: string;
  properties?: Record<string, Schema>;
  required?: readonly string[];
  additionalProperties?: boolean;
  enum?: readonly unknown[];
  const?: unknown;
  format?: string;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  items?: Schema;
};
function valid(schema: Schema, value: unknown): boolean {
  if (schema.enum && !schema.enum.includes(value)) return false;
  if ("const" in schema && value !== schema.const) return false;
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return false;
    const object = value as Record<string, unknown>;
    if (schema.required?.some((key) => !(key in object))) return false;
    return Object.entries(object).every(([key, item]) =>
      schema.properties?.[key]
        ? valid(schema.properties[key], item)
        : schema.additionalProperties !== false,
    );
  }
  if (schema.type === "array")
    return (
      Array.isArray(value) && value.every((item) => valid(schema.items!, item))
    );
  if (schema.type === "string") {
    if (typeof value !== "string") return false;
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) return false;
    if (
      schema.format === "uuid" &&
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        value,
      )
    )
      return false;
    if (
      schema.format === "date-time" &&
      (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/i.test(
        value,
      ) ||
        !Number.isFinite(Date.parse(value)))
    )
      return false;
  } else if (schema.type === "integer" || schema.type === "number") {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      (schema.type === "integer" && !Number.isSafeInteger(value))
    )
      return false;
    if (schema.minimum !== undefined && value < schema.minimum) return false;
    if (schema.maximum !== undefined && value > schema.maximum) return false;
  } else if (schema.type === "boolean" && typeof value !== "boolean")
    return false;
  return true;
}
export type TransportTypes = {
  Me: Transport.Me;
  Session: Transport.Session;
  Preferences: Transport.Preferences;
  Progress: Transport.Progress;
  Bookmark: Transport.Bookmark;
  Error: Transport.Error;
  PreferencesWrite: Transport.PreferencesWrite;
  ProgressWrite: Transport.ProgressWrite;
  BookmarkWrite: Transport.BookmarkWrite;
  Mutation: Transport.Mutation;
  FeedbackWrite: Transport.FeedbackWrite;
  FeedbackAccepted: Transport.FeedbackAccepted;
};
export function isTransport<K extends keyof TransportTypes>(
  name: K,
  value: unknown,
): value is TransportTypes[K] {
  return valid(transportSchemas[name], value);
}
