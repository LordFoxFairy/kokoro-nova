import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `next dev` and `next build` both default to `.next`. Building while a dev
  // server is up therefore rewrites the manifests that server is holding open,
  // and it answers 500 to everything until restarted — with no error that says
  // why. The production scripts set NEXT_DIST_DIR=.next-prod so the two never
  // share a directory; this was a documented "don't do that" that kept
  // happening, which means it needed a structural fix rather than a louder note.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // The workspace store writes generated artifacts under .data/, which is served
  // through an API route rather than the static folder so that the storage
  // adapter can be swapped for S3/MinIO during integration.
  experimental: {
    optimizePackageImports: ['@xyflow/react'],
  },
}

export default nextConfig
