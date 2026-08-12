/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: 'credly.co.rw' },
      { protocol: 'https', hostname: 'www.credly.co.rw' },
    ],
  },
};

module.exports = nextConfig;
