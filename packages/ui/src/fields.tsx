"use client";
import { useId } from "react";
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
