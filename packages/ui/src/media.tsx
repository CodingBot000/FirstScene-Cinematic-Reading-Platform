"use client";
import { useRef } from "react";

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
