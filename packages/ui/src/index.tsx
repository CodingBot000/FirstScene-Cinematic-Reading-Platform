"use client";

export * from "./controls.js";
export * from "./typography.js";
export * from "./media.js";
export * from "./story-card.js";
export * from "./dialog.js";
export * from "./forms.js";
export * from "./feedback.js";

import type { CSSProperties } from "react";
export type ReaderSurfaceStyle = CSSProperties & {
  "--fs-reading-size"?: string;
};
