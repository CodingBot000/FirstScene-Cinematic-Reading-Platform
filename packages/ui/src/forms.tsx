"use client";
import type { ReactNode } from "react";
import { useId } from "react";
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
export function ToggleGroup({
  value,
  onValueChange,
  options,
  label,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly { value: string; label: string; disabled?: boolean }[];
  label: string;
}) {
  const id = useId();
  return (
    <fieldset className="fs-fieldset">
      <legend>{label}</legend>
      <div className="fs-toggle-group">
        {options.map((option) => (
          <label key={option.value} className="fs-radio">
            <input
              type="radio"
              name={id}
              value={option.value}
              checked={value === option.value}
              onChange={() => onValueChange(option.value)}
              disabled={option.disabled}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  valueText,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  valueText?: string;
}) {
  const id = useId();
  return (
    <label className="fs-slider" htmlFor={id}>
      {label}
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={valueText}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output htmlFor={id}>{valueText ?? value}</output>
    </label>
  );
}
export function Progress({
  value,
  max = 1,
  label,
}: {
  value: number;
  max?: number;
  label: string;
}) {
  return (
    <progress
      className="fs-progress"
      value={Math.max(0, Math.min(max, value))}
      max={max}
      aria-label={label}
    />
  );
}
