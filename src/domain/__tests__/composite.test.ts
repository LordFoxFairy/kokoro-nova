import { describe, expect, it } from 'vitest'

import {
  appendAudioTrack,
  appendClip,
  compositeDuration,
  createSubtitle,
  createSubtitleFromPreset,
  emptyCompositeDocument,
  moveClip,
  readCompositeDocument,
  removeClip,
  setAudioTrackTiming,
  setAudioTrackVolume,
  setClipSpeed,
  setClipTrim,
  setTransition,
  seedCompositeDocument,
  splitClip,
  toComposeRequest,
  type CompositeSource,
} from '@/domain/composite'
import type { Artifact } from '@/domain/types'

function artifact(
  id: string,
  kind: Artifact['kind'],
  durationSeconds: number,
  url = `/api/media/${id}/source.${kind === 'audio' ? 'wav' : 'mp4'}`,
): Artifact {
  return {
    id,
    jobId: `job-${id}`,
    kind,
    url,
    thumbnailUrl: `/api/media/${id}/poster.svg`,
    width: kind === 'video' ? 1280 : null,
    height: kind === 'video' ? 720 : null,
    durationSeconds,
    createdAt: '2026-09-03T00:00:00.000Z',
    modelId: kind === 'video' ? 'seedance-2' : 'audio-gen-2',
    assetId: null,
  }
}

function source(id: string, kind: 'video' | 'audio' = 'video', duration = 10): CompositeSource {
  return {
    artifact: artifact(id, kind, duration),
    nodeId: `node-${id}`,
    nodeName: kind === 'video' ? `镜头 ${id}` : `音乐 ${id}`,
  }
}

describe('readCompositeDocument', () => {
  it('returns a stable empty versioned document for missing data', () => {
    expect(readCompositeDocument(undefined, [])).toEqual({
      version: 1,
      clips: [],
      audioTracks: [],
      subtitles: [],
      playheadSeconds: 0,
      zoom: 1,
      sourceAudioMuted: false,
    })
  })

  it('migrates the legacy timeline, transition and subtitle arrays', () => {
    const video = source('video-a', 'video', 12)
    const result = readCompositeDocument(
      {
        timeline: [{ id: 'legacy-clip', artifactId: 'video-a', start: 1, end: 9 }],
        transitions: [{ clipId: 'legacy-clip', type: 'to-black', durationSeconds: 0.7 }],
        subtitles: [{ id: 'legacy-sub', text: '旧字幕', start: 2, end: 4 }],
      },
      [video],
    )

    expect(result).toMatchObject({ version: 1, playheadSeconds: 0, zoom: 1 })
    expect(result.clips).toEqual([
      expect.objectContaining({
        id: 'legacy-clip',
        artifactId: 'video-a',
        nodeId: 'node-video-a',
        inPoint: 1,
        outPoint: 9,
        speed: 1,
        transitionAfter: { type: 'to-black', durationSeconds: 0.7 },
      }),
    ])
    expect(result.subtitles).toEqual([
      { id: 'legacy-sub', text: '旧字幕', start: 2, end: 4, visible: true },
    ])
  })

  it('repairs malformed persisted values instead of poisoning the editor', () => {
    const video = source('video-a', 'video', 10)
    const result = readCompositeDocument(
      {
        composite: {
          version: 1,
          clips: [
            {
              id: 'clip-a',
              artifactId: 'video-a',
              nodeId: 'node-video-a',
              nodeName: 'broken',
              url: video.artifact.url,
              poster: null,
              durationSeconds: 10,
              inPoint: -10,
              outPoint: 99,
              speed: 0,
              transitionAfter: { type: 'unknown', durationSeconds: 99 },
            },
          ],
          subtitles: [{ id: 'sub-a', text: '保留', start: -1, end: 99, visible: true }],
          audioTracks: [],
          playheadSeconds: 100,
          zoom: 20,
          sourceAudioMuted: 'no',
        },
      },
      [video],
    )

    expect(result.clips[0]).toMatchObject({ inPoint: 0, outPoint: 10, speed: 1, transitionAfter: null })
    expect(result.subtitles[0]).toMatchObject({ start: 0, end: 10 })
    expect(result.playheadSeconds).toBe(10)
    expect(result.zoom).toBe(3)
    expect(result.sourceAudioMuted).toBe(false)
  })
})

describe('composite timeline edits', () => {
  it('seeds a deterministic mixed-media document from local sources', () => {
    const firstVideo = source('video-a', 'video', 15)
    const secondVideo = source('video-b', 'video', 15)
    const audio = source('audio-bed', 'audio', 3)

    const document = seedCompositeDocument([firstVideo, secondVideo, audio])

    expect(document).toMatchObject({
      clips: [
        expect.objectContaining({
          artifactId: 'video-a',
          inPoint: 1.25,
          outPoint: 11.5,
          transitionAfter: { type: 'fade', durationSeconds: 0.75 },
        }),
        expect.objectContaining({ artifactId: 'video-b', inPoint: 2.25, outPoint: 13.25 }),
      ],
      audioTracks: [
        expect.objectContaining({
          artifactId: 'audio-bed',
          inPoint: 0.25,
          outPoint: 2.75,
          start: 1.5,
          volume: 0.65,
        }),
      ],
      subtitles: [{ id: 'subtitle-1', text: '雨夜城市', start: 4.5, end: 6.5, visible: true }],
      playheadSeconds: 3.25,
      zoom: 1.1,
    })
  })

  it('appends clips and audio with deterministic ids', () => {
    let document = emptyCompositeDocument()
    document = appendClip(document, source('video-a', 'video', 10))
    document = appendClip(document, source('video-a', 'video', 10))
    document = appendAudioTrack(document, source('audio-a', 'audio', 18))

    expect(document.clips.map((clip) => clip.id)).toEqual(['clip-video-a-1', 'clip-video-a-2'])
    expect(document.audioTracks).toEqual([
      expect.objectContaining({ id: 'audio-audio-a-1', start: 0, inPoint: 0, outPoint: 18, volume: 1, muted: false }),
    ])
  })

  it('measures speed and real transition overlap', () => {
    let document = appendClip(emptyCompositeDocument(), source('a', 'video', 10))
    document = appendClip(document, source('b', 'video', 8))
    document = setClipSpeed(document, document.clips[0].id, 2)
    document = setTransition(document, document.clips[0].id, 'fade', 0.75)

    expect(compositeDuration(document)).toBeCloseTo(12.25)
  })

  it('clamps trim and speed to valid source boundaries', () => {
    let document = appendClip(emptyCompositeDocument(), source('a', 'video', 10))
    const id = document.clips[0].id
    document = setClipTrim(document, id, -2, 50)
    document = setClipSpeed(document, id, 99)

    expect(document.clips[0]).toMatchObject({ inPoint: 0, outPoint: 10, speed: 4 })
    document = setClipTrim(document, id, 9.99, 9.991)
    expect(document.clips[0].outPoint - document.clips[0].inPoint).toBeGreaterThanOrEqual(0.05)
  })

  it('edits independent audio trim, placement and gain inside valid bounds', () => {
    let document = appendClip(emptyCompositeDocument(), source('a', 'video', 10))
    document = appendAudioTrack(document, source('music', 'audio', 20))
    const id = document.audioTracks[0].id

    document = setAudioTrackTiming(document, id, -2, 30, 99)
    document = setAudioTrackVolume(document, id, 9)

    expect(document.audioTracks[0]).toMatchObject({
      inPoint: 0,
      outPoint: 20,
      start: 9.95,
      volume: 2,
    })
  })

  it('splits at a timeline playhead and preserves source continuity', () => {
    let document = appendClip(emptyCompositeDocument(), source('a', 'video', 10))
    document = setClipSpeed(document, document.clips[0].id, 2)
    document = splitClip(document, document.clips[0].id, 2)

    expect(document.clips).toHaveLength(2)
    expect(document.clips[0]).toMatchObject({ inPoint: 0, outPoint: 4, transitionAfter: null })
    expect(document.clips[1]).toMatchObject({ inPoint: 4, outPoint: 10 })
    expect(compositeDuration(document)).toBeCloseTo(5)
  })

  it('does not split at the midpoint when the playhead is outside the selected clip', () => {
    let document = appendClip(emptyCompositeDocument(), source('a', 'video', 5))
    document = appendClip(document, source('b', 'video', 5))

    expect(splitClip(document, document.clips[0].id, 7)).toBe(document)
    expect(splitClip(document, document.clips[0].id, Number.NaN)).toBe(document)
  })

  it('rejects the current videoComposite as a source', () => {
    const document = emptyCompositeDocument()
    const currentComposite = { ...source('composite'), nodeType: 'videoComposite' as const }

    expect(appendClip(document, currentComposite)).toBe(document)
    expect(readCompositeDocument({ timeline: [{ artifactId: 'composite' }] }, [currentComposite])).toEqual(document)
  })

  it('keeps invalid trim values within a finite non-empty source range', () => {
    let document = appendClip(emptyCompositeDocument(), source('a', 'video', 10))
    const id = document.clips[0].id

    document = setClipTrim(document, id, Number.NaN, Number.POSITIVE_INFINITY)
    expect(document.clips[0]).toMatchObject({ inPoint: 0, outPoint: 10 })

    document = setClipTrim(document, id, 8, 2)
    expect(document.clips[0].outPoint - document.clips[0].inPoint).toBeGreaterThanOrEqual(0.05)
    expect(Number.isFinite(compositeDuration(document))).toBe(true)
  })

  it('gives each subtitle preset distinct deterministic content and timing', () => {
    const document = appendClip(emptyCompositeDocument(), source('a', 'video', 10))
    const presets = (['title', 'body', 'note', 'outro'] as const).map((preset) =>
      createSubtitleFromPreset(document, 1, preset).subtitles[0],
    )

    expect(presets.map((subtitle) => subtitle.text)).toEqual(['标题', '正文', '注释', '片尾'])
    expect(presets.map((subtitle) => subtitle.end - subtitle.start)).toEqual([2, 4, 1, 3])
  })

  it('reorders and removes clips while pruning unreachable subtitles', () => {
    let document = appendClip(emptyCompositeDocument(), source('a', 'video', 5))
    document = appendClip(document, source('b', 'video', 5))
    document = createSubtitle(document, 8, '尾字幕')
    const [a, b] = document.clips

    document = moveClip(document, b.id, -1)
    expect(document.clips.map((clip) => clip.artifactId)).toEqual(['b', 'a'])

    document = removeClip(document, a.id)
    expect(document.clips.map((clip) => clip.artifactId)).toEqual(['b'])
    expect(document.subtitles[0]).toMatchObject({ start: 4.5, end: 5 })
  })

  it('adds a subtitle around the playhead and keeps it in timeline bounds', () => {
    let document = appendClip(emptyCompositeDocument(), source('a', 'video', 5))
    document = createSubtitle(document, 4.8, '新字幕')

    expect(document.subtitles).toEqual([
      { id: 'subtitle-1', text: '新字幕', start: 4.5, end: 5, visible: true },
    ])
  })

  it('builds the exact compose request and excludes hidden subtitles', () => {
    let document = appendClip(emptyCompositeDocument(), source('a', 'video', 10))
    document = appendAudioTrack(document, source('music', 'audio', 20))
    document = setTransition(document, document.clips[0].id, 'to-white', 0.6)
    document = {
      ...createSubtitle(document, 1, '可见'),
      subtitles: [
        { id: 'visible', text: '可见', start: 1, end: 3, visible: true },
        { id: 'hidden', text: '隐藏', start: 3, end: 5, visible: false },
      ],
    }

    expect(toComposeRequest(document)).toEqual({
      clips: [
        {
          url: '/api/media/a/source.mp4',
          inPoint: 0,
          outPoint: 10,
          speed: 1,
          muted: false,
          transitionAfter: 'to-white',
          transitionDurationSeconds: 0.6,
        },
      ],
      audioTracks: [
        {
          url: '/api/media/music/source.wav',
          inPoint: 0,
          outPoint: 20,
          start: 0,
          volume: 1,
          muted: false,
        },
      ],
      subtitles: [{ text: '可见', start: 1, end: 3 }],
    })
  })
})
