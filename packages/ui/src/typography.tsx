import type { HTMLAttributes, ReactNode } from "react";

export function Typography({
  as: Element = "p",
  variant = "ui",
  className = "",
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: "p" | "h1" | "h2" | "h3" | "span";
  variant?: "display" | "title" | "reading" | "ui" | "caption";
}) {
  return <Element {...props} className={`fs-type-${variant} ${className}`} />;
}
export function Tag({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent";
}) {
  return <span className={`fs-tag fs-tag-${tone}`}>{children}</span>;
}
