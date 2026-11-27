import type { NextConfig } from "next";

const immutable = {
  key: "Cache-Control",
  value: "public, max-age=31536000, immutable",
};
const config: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/assets/:path*",
        headers: [{ key: "X-Content-Type-Options", value: "nosniff" }],
      },
      {
        source:
          "/assets/:asset([a-z0-9-]+\\.[a-f0-9]{8}\\.[0-9]+\\.(?:avif|webp))",
        headers: [immutable],
      },
      {
        source:
          "/assets/classics/:asset(classic-[a-z0-9-]+\\.[a-f0-9]{12}(?:\\.[0-9]+)?\\.(?:avif|webp))",
        headers: [immutable],
      },
    ];
  },
};
export default config;
