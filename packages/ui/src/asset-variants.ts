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
  /^\/assets\/(?:classics\/)?[a-z0-9][a-z0-9._-]*\.(?:avif|webp)$/.test(path) &&
  !path.includes("..");
export function isAssetVariant(variant: AssetVariant) {
  return (
    typeof variant.path === "string" &&
    safePath(variant.path) &&
    (variant.format === "avif" || variant.format === "webp") &&
    variant.path.endsWith("." + variant.format) &&
    Number.isInteger(variant.width) &&
    variant.width > 0 &&
    Number.isInteger(variant.height) &&
    variant.height > 0
  );
}
