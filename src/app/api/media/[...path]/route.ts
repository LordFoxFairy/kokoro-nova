import { promises as fs } from 'node:fs'
import path from 'node:path'
import { MEDIA_DIR } from '@/server/store'

export const dynamic = 'force-dynamic'

const CONTENT_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
}

/**
 * Serves generated artifacts.
 *
 * All media access goes through this route rather than `public/` so the
 * storage adapter can move to S3/MinIO with signed URLs without changing any
 * artifact URL already stored in a document.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params
  const relative = segments.join('/')

  // Reject textual traversal before touching the filesystem.
  const absolute = path.resolve(MEDIA_DIR, relative)
  if (!absolute.startsWith(path.resolve(MEDIA_DIR) + path.sep)) {
    return new Response('Forbidden', { status: 403 })
  }

  try {
    // Resolving the text is not enough: a symlink *inside* the media directory
    // still points wherever it likes, and the textual check waves it through.
    // Compare real path to real path — the root itself is often a symlink, so
    // it has to be dereferenced too, and hand the resolved path to the reader.
    const root = await fs.realpath(MEDIA_DIR)
    const resolved = await fs.realpath(absolute)
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      return new Response('Forbidden', { status: 403 })
    }

    const file = await fs.readFile(resolved)
    const type = CONTENT_TYPES[path.extname(resolved).toLowerCase()] ?? 'application/octet-stream'
    return new Response(new Uint8Array(file), {
      headers: {
        'Content-Type': type,
        'Content-Length': String(file.byteLength),
        // Artifact URLs are content-addressed by job id, so they never change.
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Accept-Ranges': 'bytes',
        // This route serves user-uploaded bytes. An SVG opened as a document
        // runs its own script in this origin, so every response is sandboxed
        // into a unique origin and denied any subresource it might reach for.
        // `nosniff` stops a mislabelled file being re-interpreted as HTML.
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
