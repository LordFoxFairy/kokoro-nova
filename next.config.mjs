/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep development and production builds in separate directories. This is
  // especially important for the Docker image, where the runtime receives a
  // production-only filesystem.
  distDir: process.env.NEXT_DIST_DIR?.trim() || '.next',
  // The workspace store writes generated artifacts under .data/, which is
  // served through an API route rather than the static folder so that the
  // storage adapter can be swapped for S3/MinIO during integration.
  experimental: {
    optimizePackageImports: ['@xyflow/react'],
  },
}

export default nextConfig
