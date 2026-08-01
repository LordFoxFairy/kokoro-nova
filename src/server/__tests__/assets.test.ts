import { describe, expect, it } from 'vitest'

import {
  ALLOWED_UPLOAD_TYPES,
  MAX_UPLOAD_BYTES,
  isAllowedUploadType,
  normaliseMimeType,
  readImageSize,
  rejectionFor,
  sanitiseFilename,
  sniffMimeType,
} from '@/server/assets'

/** Minimal but structurally valid PNG header: signature + IHDR chunk. */
function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  const view = new DataView(bytes.buffer)
  view.setUint32(8, 13)
  bytes.set([0x49, 0x48, 0x44, 0x52], 12)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

/** JPEG with an APP0 segment before the SOF0 frame header, as a camera writes. */
function jpegHeader(width: number, height: number, marker = 0xc0): Uint8Array {
  const app0 = 16
  const bytes = new Uint8Array(2 + 2 + app0 + 2 + 9)
  const view = new DataView(bytes.buffer)
  bytes.set([0xff, 0xd8], 0)

  bytes.set([0xff, 0xe0], 2)
  view.setUint16(4, app0)

  let offset = 4 + app0
  bytes.set([0xff, marker], offset)
  view.setUint16(offset + 2, 11)
  bytes[offset + 4] = 8 // sample precision
  view.setUint16(offset + 5, height)
  view.setUint16(offset + 7, width)
  offset += 2 + 11
  return bytes
}

function bytesOf(text: string): Uint8Array {
  return new Uint8Array(Array.from(text, (char) => char.charCodeAt(0)))
}

describe('sanitiseFilename', () => {
  it('keeps a plain name and forces the extension the MIME type dictates', () => {
    expect(sanitiseFilename('cover.png', 'image/png')).toBe('cover.png')
    expect(sanitiseFilename('cover.jpeg', 'image/jpeg')).toBe('cover.jpg')
  })

  it('strips path separators so only the last segment survives', () => {
    expect(sanitiseFilename('a/b/c/shot.png', 'image/png')).toBe('shot.png')
    expect(sanitiseFilename('C:\\users\\me\\shot.png', 'image/png')).toBe('shot.png')
  })

  it('defuses traversal instead of resolving it', () => {
    expect(sanitiseFilename('../../etc/passwd', 'image/png')).toBe('passwd.png')
    expect(sanitiseFilename('..', 'image/png')).toBe('upload.png')
    expect(sanitiseFilename('../', 'image/png')).toBe('upload.png')
  })

  it('never trusts the extension the client sent', () => {
    // A payload declared as PNG cannot smuggle itself onto disk as an SVG.
    expect(sanitiseFilename('payload.svg', 'image/png')).toBe('payload.png')
    expect(sanitiseFilename('clip.mp4.exe', 'video/mp4')).toBe('clip.mp4.mp4')
  })

  it('drops characters that break a path or a URL', () => {
    expect(sanitiseFilename('my <shot>: "one"?.png', 'image/png')).toBe('my-shot-one.png')
    expect(sanitiseFilename('.hidden.png', 'image/png')).toBe('hidden.png')
    expect(sanitiseFilename('-rf.png', 'image/png')).toBe('rf.png')
  })

  it('caps the length while keeping the extension', () => {
    const name = sanitiseFilename(`${'a'.repeat(400)}.png`, 'image/png')
    expect(name).toHaveLength(64)
    expect(name.endsWith('.png')).toBe(true)
  })

  it('falls back when nothing usable is left', () => {
    expect(sanitiseFilename('', 'image/png')).toBe('upload.png')
    expect(sanitiseFilename('???.png', 'image/png')).toBe('upload.png')
  })

  it('keeps non-ASCII names, which the URL layer encodes', () => {
    expect(sanitiseFilename('封面图.png', 'image/png')).toBe('封面图.png')
  })
})

describe('MIME allowlist', () => {
  it('accepts exactly the documented types', () => {
    expect(Object.keys(ALLOWED_UPLOAD_TYPES).sort()).toEqual([
      'audio/mpeg',
      'audio/wav',
      'image/jpeg',
      'image/png',
      'image/svg+xml',
      'image/webp',
      'video/mp4',
      'video/webm',
    ])
  })

  it('rejects anything outside it', () => {
    expect(isAllowedUploadType('image/gif')).toBe(false)
    expect(isAllowedUploadType('application/pdf')).toBe(false)
    expect(isAllowedUploadType('text/html')).toBe(false)
    expect(isAllowedUploadType('')).toBe(false)
  })

  it('folds legacy spellings and parameters onto the canonical key', () => {
    expect(normaliseMimeType('IMAGE/JPG')).toBe('image/jpeg')
    expect(normaliseMimeType('audio/x-wav')).toBe('audio/wav')
    expect(normaliseMimeType('image/svg+xml; charset=utf-8')).toBe('image/svg+xml')
    expect(isAllowedUploadType('audio/mp3')).toBe(true)
  })
})

describe('rejectionFor', () => {
  const base = { name: 'a.png', type: 'image/png', size: 1024 }

  it('accepts a candidate inside every limit', () => {
    expect(rejectionFor(base)).toBeNull()
  })

  it('rejects an empty file', () => {
    expect(rejectionFor({ ...base, size: 0 })).toBe('文件为空')
  })

  it('rejects at exactly one byte over the cap and accepts the cap itself', () => {
    expect(rejectionFor({ ...base, size: MAX_UPLOAD_BYTES })).toBeNull()
    expect(rejectionFor({ ...base, size: MAX_UPLOAD_BYTES + 1 })).toBe('文件超过 50MB 上限')
  })

  it('rejects a type outside the allowlist before anything is written', () => {
    expect(rejectionFor({ ...base, type: 'image/gif' })).toBe('不接受的文件类型：image/gif')
    expect(rejectionFor({ ...base, type: '' })).toBe('不接受的文件类型')
  })
})

describe('sniffMimeType', () => {
  it('recognises the accepted binary containers', () => {
    expect(sniffMimeType(pngHeader(1, 1))).toBe('image/png')
    expect(sniffMimeType(jpegHeader(1, 1))).toBe('image/jpeg')
    expect(sniffMimeType(bytesOf('RIFF????WEBPVP8 '))).toBe('image/webp')
    expect(sniffMimeType(bytesOf('RIFF????WAVEfmt '))).toBe('audio/wav')
    expect(sniffMimeType(bytesOf('????ftypisom????'))).toBe('video/mp4')
    expect(sniffMimeType(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01]))).toBe('video/webm')
    expect(sniffMimeType(bytesOf('ID3\u0003'))).toBe('audio/mpeg')
  })

  it('recognises SVG behind a prolog', () => {
    expect(sniffMimeType(bytesOf('<?xml version="1.0"?>\n<svg xmlns="x"></svg>'))).toBe('image/svg+xml')
  })

  it('returns null for content it cannot place', () => {
    expect(sniffMimeType(bytesOf('GIF89a'))).toBeNull()
    expect(sniffMimeType(new Uint8Array(0))).toBeNull()
  })
})

describe('readImageSize', () => {
  it('reads PNG dimensions from IHDR', () => {
    expect(readImageSize(pngHeader(1920, 1080), 'image/png')).toEqual({ width: 1920, height: 1080 })
  })

  it('reads JPEG dimensions by walking to the frame header', () => {
    expect(readImageSize(jpegHeader(640, 480), 'image/jpeg')).toEqual({ width: 640, height: 480 })
  })

  it('reads progressive JPEG too', () => {
    // SOF2 is a different marker in the same range; both carry the frame header.
    expect(readImageSize(jpegHeader(800, 600, 0xc2), 'image/jpeg')).toEqual({ width: 800, height: 600 })
  })

  it('returns null for the types that are not probed', () => {
    expect(readImageSize(bytesOf('RIFF????WEBPVP8 '), 'image/webp')).toBeNull()
    expect(readImageSize(bytesOf('<svg width="10"></svg>'), 'image/svg+xml')).toBeNull()
    expect(readImageSize(bytesOf('????ftypisom????'), 'video/mp4')).toBeNull()
  })

  it('returns null rather than guessing on a truncated or mismatched header', () => {
    expect(readImageSize(pngHeader(10, 10).slice(0, 20), 'image/png')).toBeNull()
    expect(readImageSize(pngHeader(10, 10), 'image/jpeg')).toBeNull()
    expect(readImageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg')).toBeNull()
  })
})
