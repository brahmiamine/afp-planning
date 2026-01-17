/** @type {import('next').NextConfig} */
const nextConfig = {
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

module.exports = nextConfig;
