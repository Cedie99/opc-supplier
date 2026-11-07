import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Supplier documents can be up to 10 MB; leave room for multipart overhead.
      bodySizeLimit: "11mb",
    },
  },
};

export default nextConfig;
