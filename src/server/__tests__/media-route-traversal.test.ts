import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * The media route hands back raw bytes from disk, so its containment check is a
 * security boundary. Resolving the requested text is not sufficient: a symlink
 * *inside* the media directory passes a textual `startsWith` and then reads
 * whatever it points at. These pin both halves.
 */

let workdir: string
let previousCwd: string
let route: typeof import('@/app/api/media/[...path]/route')
let mediaDir: string

/** The route takes its params as a promise, exactly as Next supplies them. */
function request(segments: string[]) {
  return route.GET(new Request('http://localhost/api/media/x'), {
    params: Promise.resolve({ path: segments }),
  })
}

beforeAll(async () => {
  previousCwd = process.cwd()
  workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-media-'))
  process.chdir(workdir)

  const store = await import('@/server/store')
  mediaDir = store.MEDIA_DIR
  await fs.mkdir(mediaDir, { recursive: true })
  route = await import('@/app/api/media/[...path]/route')

  await fs.writeFile(path.join(mediaDir, 'inside.txt'), 'legitimate', 'utf8')

  // The prize: a file the route must never serve.
  await fs.writeFile(path.join(workdir, 'secret.txt'), 'SECRET', 'utf8')
  await fs.symlink(path.join(workdir, 'secret.txt'), path.join(mediaDir, 'escape.txt'))

  await fs.mkdir(path.join(workdir, 'elsewhere'), { recursive: true })
  await fs.writeFile(path.join(workdir, 'elsewhere', 'other.txt'), 'ALSO SECRET', 'utf8')
  await fs.symlink(path.join(workdir, 'elsewhere'), path.join(mediaDir, 'linkdir'))
})

afterAll(async () => {
  process.chdir(previousCwd)
  await fs.rm(workdir, { recursive: true, force: true })
})

describe('media route containment', () => {
  it('serves a file that genuinely lives inside the media directory', async () => {
    const response = await request(['inside.txt'])
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('legitimate')
  })

  it('refuses textual traversal', async () => {
    for (const segments of [['..', 'secret.txt'], ['..', '..', 'etc', 'passwd'], ['a', '..', '..', 'secret.txt']]) {
      const response = await request(segments)
      expect(response.status, segments.join('/')).toBe(403)
    }
  })

  it('refuses a symlink that points outside, and never leaks its contents', async () => {
    const response = await request(['escape.txt'])
    expect(response.status).toBe(403)
    expect(await response.text()).not.toContain('SECRET')
  })

  it('refuses a file reached through a symlinked directory', async () => {
    const response = await request(['linkdir', 'other.txt'])
    expect(response.status).toBe(403)
    expect(await response.text()).not.toContain('SECRET')
  })

  it('404s a missing file rather than reporting it as forbidden', async () => {
    const response = await request(['nope.txt'])
    expect(response.status).toBe(404)
  })
})
