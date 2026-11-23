"use client";
import type { ReactNode } from "react";
import * as T from "@radix-ui/react-tabs";

export function Tabs({
  value,
  onValueChange,
  items,
}: {
  value: string;
  onValueChange: (value: string) => void;
  items: readonly {
    value: string;
    label: string;
    content: ReactNode;
    disabled?: boolean;
  }[];
}) {
  return (
    <T.Root value={value} onValueChange={onValueChange}>
      <T.List className="fs-tabs">
        {items.map((item) => (
          <T.Trigger
            key={item.value}
            value={item.value}
            disabled={item.disabled}
          >
            {item.label}
          </T.Trigger>
        ))}
      </T.List>
      {items.map((item) => (
        <T.Content key={item.value} value={item.value}>
          {item.content}
        </T.Content>
      ))}
    </T.Root>
  );
}
export { ToggleGroup, Slider } from "./fields.js";
export { Progress } from "./progress.js";
