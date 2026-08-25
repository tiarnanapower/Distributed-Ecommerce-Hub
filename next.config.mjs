import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root: a lockfile further up the filesystem would
  // otherwise be inferred as the root and break file tracing on build.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  // Local development is commonly reached over 127.0.0.1 as well as localhost.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  eslint: {
    // Lint is run explicitly via `npm run lint` in CI; don't fail production builds on it.
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [
      // Connector logos in the integrations directory are loaded from public CDNs
      // during local development only. See docs/known-limitations.md.
      { protocol: 'https', hostname: 'cdn.simpleicons.org' },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
