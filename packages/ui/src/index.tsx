"use client";
import type {
  ComponentPropsWithRef,
  RefObject,
  Ref,
  HTMLAttributes,
  ReactNode,
  CSSProperties,
} from "react";
import { useId, useRef, useEffect } from "react";
import * as D from "@radix-ui/react-dialog";
import * as T from "@radix-ui/react-tabs";

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
export type AssetVariant = {
  path: string;
  format: "avif" | "webp";
  width: number;
  height: number;
  bytes?: number;
  sha256?: string;
};
export type AssetProps = {
  variants: readonly AssetVariant[];
  alt: string;
  decorative?: boolean;
  priority?: boolean;
  aspectRatio?: string;
  focalPoint?: { x: number; y: number };
  sizes?: string;
  className?: string;
};
const safePath = (path: string) =>
  /^\/assets\/[a-z0-9][a-z0-9._-]*\.(?:avif|webp)$/.test(path) &&
  !path.includes("..");
export function ResponsiveAsset({
  variants,
  alt,
  decorative = false,
  priority = false,
  aspectRatio = "16 / 10",
  focalPoint = { x: 0.5, y: 0.5 },
  sizes = "(max-width:640px) 100vw, 50vw",
  className = "",
}: AssetProps) {
  const safe = variants.filter(
    (v) =>
      safePath(v.path) &&
      Number.isInteger(v.width) &&
      v.width > 0 &&
      Number.isInteger(v.height) &&
      v.height > 0,
  );
  const fallback = safe
    .filter((v) => v.format === "webp")
    .sort((a, b) => a.width - b.width)
    .at(-1);
  const image = useRef<HTMLImageElement>(null);
  const markFailed = () => {
    image.current?.setAttribute("data-failed", "true");
  };
  return (
    <picture
      className={`fs-asset ${className}`}
      style={{ aspectRatio }}
      aria-hidden={decorative || undefined}
    >
      {["avif", "webp"].map((format) => (
        <source
          key={format}
          type={`image/${format}`}
          sizes={sizes}
          srcSet={
            safe
              .filter((v) => v.format === format)
              .map((v) => `${v.path} ${v.width}w`)
              .join(", ") || undefined
          }
        />
      ))}
      {fallback ? (
        <img
          ref={image}
          src={fallback.path}
          width={fallback.width}
          height={fallback.height}
          alt={decorative ? "" : alt}
          aria-hidden={decorative || undefined}
          sizes={sizes}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          style={{
            objectPosition: `${focalPoint.x * 100}% ${focalPoint.y * 100}%`,
          }}
          onError={markFailed}
        />
      ) : (
        <span
          className="fs-asset-fallback"
          role={decorative ? undefined : "img"}
          aria-label={decorative ? undefined : alt}
        >
          <span>이미지 준비 중</span>
        </span>
      )}
    </picture>
  );
}
export type StoryCardProps = {
  id: string;
  title: string;
  summary: string;
  cover: AssetProps;
  href: string;
  tags: readonly string[];
  progress?: number;
  action?: ReactNode;
};
export function StoryCard({
  id,
  title,
  summary,
  cover,
  href,
  tags,
  progress,
  action,
}: StoryCardProps) {
  return (
    <article className="fs-story-card" data-story={id}>
      <a href={href} className="fs-story-cover">
        <ResponsiveAsset {...cover} aspectRatio="3 / 4" />
      </a>
      <div className="fs-story-info">
        <h3 className="fs-type-title">
          <a href={href}>{title}</a>
        </h3>
        <p>{summary}</p>
        <div className="fs-tags">
          {tags.slice(0, 2).map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </div>
        {progress !== undefined ? (
          <Progress value={progress} label="최대로 읽은 진도" />
        ) : null}
        <a className="fs-text-link" href={href}>
          이야기 만나기 <span aria-hidden="true">↗</span>
        </a>
        {action}
      </div>
    </article>
  );
}
export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  trigger?: ReactNode;
  contentClassName?: string;
  onCloseAutoFocus?: (event: Event) => void;
  returnFocusTo?: RefObject<HTMLElement | null>;
};
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  trigger,
  contentClassName = "",
  onCloseAutoFocus,
  returnFocusTo,
}: DialogProps) {
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) returnFocus.current = document.activeElement as HTMLElement;
  }, [open]);
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <D.Trigger asChild>{trigger}</D.Trigger> : null}
      <D.Portal>
        <D.Overlay className="fs-dialog-overlay" />
        <D.Content
          className={`fs-dialog ${contentClassName}`}
          onCloseAutoFocus={(event) => {
            onCloseAutoFocus?.(event);
            if (event.defaultPrevented) return;
            const target = returnFocusTo?.current ?? returnFocus.current;
            if (target?.isConnected && target !== document.body) {
              event.preventDefault();
              target.focus({ preventScroll: true });
            }
          }}
        >
          <D.Title className="fs-type-title">{title}</D.Title>
          <D.Description
            className={description ? "fs-dialog-description" : "fs-sr-only"}
          >
            {description ?? title}
          </D.Description>
          {children}
          <D.Close asChild>
            <Button variant="secondary">닫기</Button>
          </D.Close>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
export function Sheet({
  side = "bottom",
  ...props
}: DialogProps & { side?: "bottom" | "right" }) {
  return <Dialog {...props} contentClassName={`fs-sheet fs-sheet-${side}`} />;
}
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
export function Toast({
  message,
  tone = "info",
  onDismiss,
}: {
  message: string;
  tone?: "info" | "error" | "success";
  onDismiss?: () => void;
}) {
  return (
    <div className={`fs-toast fs-toast-${tone}`} role="status">
      <p>{message}</p>
      {onDismiss ? (
        <Button variant="ghost" onClick={onDismiss}>
          알림 닫기
        </Button>
      ) : null}
    </div>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <section className="fs-empty">
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </section>
  );
}
export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <section className="fs-error">
      <h2>{title}</h2>
      <p>{message}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          다시 시도
        </Button>
      ) : null}
    </section>
  );
}
export function ReadingToolbar({
  title,
  sceneIndex,
  sceneCount,
  saveStatus,
  onBack,
  onSettings,
  onToc,
  settingsButtonRef,
  tocButtonRef,
}: {
  title: string;
  sceneIndex: number;
  sceneCount: number;
  saveStatus: string;
  onBack: () => void;
  onSettings: () => void;
  onToc: () => void;
  settingsButtonRef?: Ref<HTMLButtonElement>;
  tocButtonRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <header className="fs-reading-toolbar">
      <Button variant="ghost" onClick={onBack} aria-label="작품 소개로 돌아가기">
        ← <span className="fs-back-label">작품 소개</span>
      </Button>
      <span className="fs-toolbar-title">{title}</span>
      <span className="fs-scene-count">
        {sceneIndex}/{sceneCount}
      </span>
      <Button variant="ghost" ref={tocButtonRef} onClick={onToc}>
        목차
      </Button>
      <Button variant="ghost" ref={settingsButtonRef} onClick={onSettings}>
        설정
      </Button>
      <small className="fs-save-status">{saveStatus}</small>
    </header>
  );
}
export type ReaderSurfaceStyle = CSSProperties & {
  "--fs-reading-size"?: string;
};
