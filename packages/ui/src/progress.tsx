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
