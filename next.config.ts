import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The font files that shared links' preview pictures are drawn with.
  outputFileTracingIncludes: {
    "/share/**": ["./src/assets/**"],
    "/r/**": ["./src/assets/**"],
  },
};

export default nextConfig;
