import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* TypeScript 5.9's CLI output is valid JSON locally, but Next's CLI
     parser is incompatible with this installed Next 16 toolchain. */
  experimental: {
    useTypeScriptCli: false,
  },
};

export default nextConfig;
