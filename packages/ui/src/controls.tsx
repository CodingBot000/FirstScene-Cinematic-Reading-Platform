"use client";
import type { ComponentPropsWithRef, ReactNode } from "react";

export type ButtonProps = ComponentPropsWithRef<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  size?: "md" | "lg";
  loading?: boolean;
};
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  children,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={`fs-button fs-${variant} fs-${size} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {children}
      {loading ? <span aria-hidden="true"> …</span> : null}
    </button>
  );
}
export function IconButton({
  label,
  icon,
  pressed,
  ...props
}: Omit<ButtonProps, "children"> & {
  label: string;
  icon: ReactNode;
  pressed?: boolean;
}) {
  return (
    <span className="fs-icon-wrap">
      <Button
        {...props}
        className={`fs-icon-button ${props.className ?? ""}`}
        variant={props.variant ?? "ghost"}
        aria-label={label}
        aria-pressed={pressed}
      >
        {icon}
      </Button>
      <span className="fs-tooltip" aria-hidden="true">
        {label}
      </span>
    </span>
  );
}
