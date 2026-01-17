import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api.sportcorico.com',
        pathname: '/storage/logos/**',
      },
    ],
  },
};

export default nextConfig;
