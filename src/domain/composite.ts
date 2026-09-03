import type {
  Artifact,
  CompositeAudioTrack,
  CompositeClip,
  CompositeDocument,
  CompositeSubtitle,
  CompositeTransitionId,
} from './types'

export interface CompositeSource {
  artifact: Artifact
  nodeId: string
  nodeName: string
}

export interface ComposeRequestDocument {
  clips: Array<{
    url: string
    inPoint: number
    outPoint: number
    speed: number
    muted: boolean
    transitionAfter: CompositeTransitionId | null
    transitionDurationSeconds: number | null
  }>
  audioTracks: Array<{
    url: string
    inPoint: number
    outPoint: number
    start: number
    volume: number
    muted: boolean
  }>
  subtitles: Array<{ text: string; start: number; end: number }>
}

export const COMPOSITE_DOCUMENT_VERSION = 1 as const
export const MIN_CLIP_SECONDS = 0.05
export const MIN_SPEED = 0.25
export const MAX_SPEED = 4
export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 3
export const DEFAULT_TRANSITION_SECONDS = 0.5
export const MIN_TRANSITION_SECONDS = 0.08
export const MAX_TRANSITION_SECONDS = 2
export const DEFAULT_SUBTITLE_SECONDS = 2

const TRANSITION_IDS = new Set<CompositeTransitionId>(['fade', 'to-black', 'to-white'])

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function nonEmptyString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function transitionType(value: unknown): CompositeTransitionId | null {
  return typeof value === 'string' && TRANSITION_IDS.has(value as CompositeTransitionId)
    ? (value as CompositeTransitionId)
    : null
}

export function emptyCompositeDocument(): CompositeDocument {
  return {
    version: COMPOSITE_DOCUMENT_VERSION,
    clips: [],
    audioTracks: [],
    subtitles: [],
    playheadSeconds: 0,
    zoom: 1,
    sourceAudioMuted: false,
  }
}

function sourceMap(sources: CompositeSource[]): Map<string, CompositeSource> {
  return new Map(sources.map((source) => [source.artifact.id, source]))
}

function normalizeClip(value: unknown, sources: Map<string, CompositeSource>, index: number): CompositeClip | null {
  const item = record(value)
  if (!item) return null
  const artifactId = nonEmptyString(item.artifactId, '')
  const source = sources.get(artifactId)
  const sourceDuration = Math.max(
    MIN_CLIP_SECONDS,
    finite(item.durationSeconds, source?.artifact.durationSeconds ?? MIN_CLIP_SECONDS),
  )
  const inPoint = clamp(finite(item.inPoint, 0), 0, Math.max(0, sourceDuration - MIN_CLIP_SECONDS))
  const outPoint = clamp(
    finite(item.outPoint, sourceDuration),
    inPoint + MIN_CLIP_SECONDS,
    sourceDuration,
  )

  const transition = record(item.transitionAfter)
  const type = transitionType(transition?.type)
  const persistedSpeed = finite(item.speed, 1)

  return {
    id: nonEmptyString(item.id, `clip-${artifactId || index + 1}-${index + 1}`),
    artifactId,
    nodeId: nonEmptyString(item.nodeId, source?.nodeId ?? ''),
    nodeName: nonEmptyString(item.nodeName, source?.nodeName ?? '视频片段'),
    url: nonEmptyString(item.url, source?.artifact.url ?? ''),
    poster: nullableString(item.poster) ?? source?.artifact.thumbnailUrl ?? null,
    durationSeconds: sourceDuration,
    inPoint,
    outPoint,
    // Persisted data outside the supported range is treated as corrupt rather
    // than as an intentional request to use an extreme boundary value.
    speed: persistedSpeed >= MIN_SPEED && persistedSpeed <= MAX_SPEED ? persistedSpeed : 1,
    muted: typeof item.muted === 'boolean' ? item.muted : false,
    transitionAfter: type
      ? {
          type,
          durationSeconds: clamp(
            finite(transition?.durationSeconds, DEFAULT_TRANSITION_SECONDS),
            MIN_TRANSITION_SECONDS,
            MAX_TRANSITION_SECONDS,
          ),
        }
      : null,
  }
}

function normalizeAudioTrack(
  value: unknown,
  sources: Map<string, CompositeSource>,
  index: number,
): CompositeAudioTrack | null {
  const item = record(value)
  if (!item) return null
  const artifactId = nonEmptyString(item.artifactId, '')
  const source = sources.get(artifactId)
  const sourceDuration = Math.max(
    MIN_CLIP_SECONDS,
    finite(item.durationSeconds, source?.artifact.durationSeconds ?? MIN_CLIP_SECONDS),
  )
  const inPoint = clamp(finite(item.inPoint, 0), 0, Math.max(0, sourceDuration - MIN_CLIP_SECONDS))
  const outPoint = clamp(
    finite(item.outPoint, sourceDuration),
    inPoint + MIN_CLIP_SECONDS,
    sourceDuration,
  )

  return {
    id: nonEmptyString(item.id, `audio-${artifactId || index + 1}-${index + 1}`),
    artifactId,
    nodeId: nonEmptyString(item.nodeId, source?.nodeId ?? ''),
    nodeName: nonEmptyString(item.nodeName, source?.nodeName ?? '音频'),
    url: nonEmptyString(item.url, source?.artifact.url ?? ''),
    poster: nullableString(item.poster) ?? source?.artifact.thumbnailUrl ?? null,
    durationSeconds: sourceDuration,
    inPoint,
    outPoint,
    start: Math.max(0, finite(item.start, 0)),
    volume: clamp(finite(item.volume, 1), 0, 2),
    muted: typeof item.muted === 'boolean' ? item.muted : false,
  }
}

function normalizeSubtitle(value: unknown, index: number, duration: number): CompositeSubtitle | null {
  const item = record(value)
  if (!item || duration <= 0) return null
  const start = clamp(finite(item.start, 0), 0, Math.max(0, duration - 0.1))
  const end = clamp(finite(item.end, Math.min(duration, start + DEFAULT_SUBTITLE_SECONDS)), start + 0.1, duration)
  return {
    id: nonEmptyString(item.id, `subtitle-${index + 1}`),
    text: typeof item.text === 'string' ? item.text : '新字幕',
    start,
    end,
    visible: typeof item.visible === 'boolean' ? item.visible : true,
  }
}

function legacyDocument(extra: Record<string, unknown>, sources: CompositeSource[]): CompositeDocument {
  const byArtifact = sourceMap(sources)
  const transitions = new Map<string, Record<string, unknown>>()
  if (Array.isArray(extra.transitions)) {
    for (const value of extra.transitions) {
      const item = record(value)
      const clipId = item && nonEmptyString(item.clipId ?? item.fromClipId, '')
      if (item && clipId) transitions.set(clipId, item)
    }
  }

  const clips: CompositeClip[] = []
  if (Array.isArray(extra.timeline)) {
    extra.timeline.forEach((value, index) => {
      const item = record(value)
      if (!item) return
      const artifactId = nonEmptyString(item.artifactId, '')
      const source = byArtifact.get(artifactId)
      if (!source || source.artifact.kind !== 'video') return
      const id = nonEmptyString(item.id, `clip-${artifactId}-${index + 1}`)
      const legacyTransition = transitions.get(id)
      const type = transitionType(legacyTransition?.type ?? legacyTransition?.id)
      const normalized = normalizeClip(
        {
          id,
          artifactId,
          nodeId: source.nodeId,
          nodeName: source.nodeName,
          url: source.artifact.url,
          poster: source.artifact.thumbnailUrl,
          durationSeconds: source.artifact.durationSeconds,
          inPoint: item.inPoint ?? item.start,
          outPoint: item.outPoint ?? item.end,
          speed: item.speed,
          muted: item.muted,
          transitionAfter: type
            ? { type, durationSeconds: legacyTransition?.durationSeconds ?? DEFAULT_TRANSITION_SECONDS }
            : null,
        },
        byArtifact,
        index,
      )
      if (normalized) clips.push(normalized)
    })
  }

  const partial: CompositeDocument = { ...emptyCompositeDocument(), clips }
  const duration = compositeDuration(partial)
  const subtitles = Array.isArray(extra.subtitles)
    ? extra.subtitles
        .map((value, index) => normalizeSubtitle(value, index, duration))
        .filter((value): value is CompositeSubtitle => value !== null)
    : []

  return { ...partial, subtitles }
}

/**
 * Parse the persisted editor state. Old fixtures used three untyped arrays;
 * they are migrated here so component code only ever sees the v1 document.
 */
export function readCompositeDocument(
  extra: Record<string, unknown> | undefined,
  sources: CompositeSource[],
): CompositeDocument {
  if (!extra) return emptyCompositeDocument()
  const raw = record(extra.composite)
  if (!raw || raw.version !== COMPOSITE_DOCUMENT_VERSION) return legacyDocument(extra, sources)

  const byArtifact = sourceMap(sources)
  const clips = Array.isArray(raw.clips)
    ? raw.clips
        .map((value, index) => normalizeClip(value, byArtifact, index))
        .filter((value): value is CompositeClip => value !== null)
    : []
  const audioTracks = Array.isArray(raw.audioTracks)
    ? raw.audioTracks
        .map((value, index) => normalizeAudioTrack(value, byArtifact, index))
        .filter((value): value is CompositeAudioTrack => value !== null)
    : []
  const base: CompositeDocument = {
    version: COMPOSITE_DOCUMENT_VERSION,
    clips,
    audioTracks,
    subtitles: [],
    playheadSeconds: 0,
    zoom: clamp(finite(raw.zoom, 1), MIN_ZOOM, MAX_ZOOM),
    sourceAudioMuted: typeof raw.sourceAudioMuted === 'boolean' ? raw.sourceAudioMuted : false,
  }
  const duration = compositeDuration(base)
  const fittedAudioTracks = audioTracks.map((track) => ({
    ...track,
    start: duration > 0 ? clamp(track.start, 0, Math.max(0, duration - MIN_CLIP_SECONDS)) : 0,
  }))
  const subtitles = Array.isArray(raw.subtitles)
    ? raw.subtitles
        .map((value, index) => normalizeSubtitle(value, index, duration))
        .filter((value): value is CompositeSubtitle => value !== null)
    : []

  return {
    ...base,
    audioTracks: fittedAudioTracks,
    subtitles,
    playheadSeconds: clamp(finite(raw.playheadSeconds, 0), 0, duration),
  }
}

function nextId(prefix: string, artifactId: string, ids: string[]): string {
  let sequence = 1
  let candidate = `${prefix}-${artifactId}-${sequence}`
  while (ids.includes(candidate)) {
    sequence += 1
    candidate = `${prefix}-${artifactId}-${sequence}`
  }
  return candidate
}

export function appendClip(document: CompositeDocument, source: CompositeSource): CompositeDocument {
  if (source.artifact.kind !== 'video') return document
  const durationSeconds = Math.max(MIN_CLIP_SECONDS, source.artifact.durationSeconds ?? 5)
  const clip: CompositeClip = {
    id: nextId('clip', source.artifact.id, document.clips.map((item) => item.id)),
    artifactId: source.artifact.id,
    nodeId: source.nodeId,
    nodeName: source.nodeName,
    url: source.artifact.url,
    poster: source.artifact.thumbnailUrl,
    durationSeconds,
    inPoint: 0,
    outPoint: durationSeconds,
    speed: 1,
    muted: false,
    transitionAfter: null,
  }
  return { ...document, clips: [...document.clips, clip] }
}

export function appendAudioTrack(document: CompositeDocument, source: CompositeSource): CompositeDocument {
  if (source.artifact.kind !== 'audio') return document
  const durationSeconds = Math.max(MIN_CLIP_SECONDS, source.artifact.durationSeconds ?? 5)
  const track: CompositeAudioTrack = {
    id: nextId('audio', source.artifact.id, document.audioTracks.map((item) => item.id)),
    artifactId: source.artifact.id,
    nodeId: source.nodeId,
    nodeName: source.nodeName,
    url: source.artifact.url,
    poster: source.artifact.thumbnailUrl,
    durationSeconds,
    inPoint: 0,
    outPoint: durationSeconds,
    start: 0,
    volume: 1,
    muted: false,
  }
  return { ...document, audioTracks: [...document.audioTracks, track] }
}

function clipDuration(clip: CompositeClip): number {
  return (clip.outPoint - clip.inPoint) / clip.speed
}

export function effectiveTransitionDuration(
  left: CompositeClip,
  right: CompositeClip,
): number {
  if (!left.transitionAfter) return 0
  return Math.min(
    left.transitionAfter.durationSeconds,
    clipDuration(left) * 0.4,
    clipDuration(right) * 0.4,
  )
}

export function compositeDuration(document: CompositeDocument): number {
  let duration = document.clips.reduce((sum, clip) => sum + clipDuration(clip), 0)
  for (let index = 0; index < document.clips.length - 1; index += 1) {
    duration -= effectiveTransitionDuration(document.clips[index], document.clips[index + 1])
  }
  return Math.max(0, duration)
}

function updateClip(
  document: CompositeDocument,
  clipId: string,
  mutate: (clip: CompositeClip) => CompositeClip,
): CompositeDocument {
  return {
    ...document,
    clips: document.clips.map((clip) => (clip.id === clipId ? mutate(clip) : clip)),
  }
}

export function setClipTrim(
  document: CompositeDocument,
  clipId: string,
  requestedInPoint: number,
  requestedOutPoint: number,
): CompositeDocument {
  return updateClip(document, clipId, (clip) => {
    const inPoint = clamp(finite(requestedInPoint, clip.inPoint), 0, Math.max(0, clip.durationSeconds - MIN_CLIP_SECONDS))
    const outPoint = clamp(
      finite(requestedOutPoint, clip.outPoint),
      inPoint + MIN_CLIP_SECONDS,
      clip.durationSeconds,
    )
    return { ...clip, inPoint, outPoint }
  })
}

export function setClipSpeed(document: CompositeDocument, clipId: string, requestedSpeed: number): CompositeDocument {
  return updateClip(document, clipId, (clip) => ({
    ...clip,
    speed: clamp(finite(requestedSpeed, clip.speed), MIN_SPEED, MAX_SPEED),
  }))
}

function updateAudioTrack(
  document: CompositeDocument,
  trackId: string,
  mutate: (track: CompositeAudioTrack) => CompositeAudioTrack,
): CompositeDocument {
  return {
    ...document,
    audioTracks: document.audioTracks.map((track) => track.id === trackId ? mutate(track) : track),
  }
}

export function setAudioTrackTiming(
  document: CompositeDocument,
  trackId: string,
  requestedInPoint: number,
  requestedOutPoint: number,
  requestedStart: number,
): CompositeDocument {
  const timelineDuration = compositeDuration(document)
  return updateAudioTrack(document, trackId, (track) => {
    const inPoint = clamp(finite(requestedInPoint, track.inPoint), 0, Math.max(0, track.durationSeconds - MIN_CLIP_SECONDS))
    const outPoint = clamp(
      finite(requestedOutPoint, track.outPoint),
      inPoint + MIN_CLIP_SECONDS,
      track.durationSeconds,
    )
    const start = timelineDuration > 0
      ? clamp(finite(requestedStart, track.start), 0, Math.max(0, timelineDuration - MIN_CLIP_SECONDS))
      : 0
    return { ...track, inPoint, outPoint, start }
  })
}

export function setAudioTrackVolume(
  document: CompositeDocument,
  trackId: string,
  requestedVolume: number,
): CompositeDocument {
  return updateAudioTrack(document, trackId, (track) => ({
    ...track,
    volume: clamp(finite(requestedVolume, track.volume), 0, 2),
  }))
}

export function setTransition(
  document: CompositeDocument,
  clipId: string,
  type: CompositeTransitionId | null,
  requestedDuration = DEFAULT_TRANSITION_SECONDS,
): CompositeDocument {
  return updateClip(document, clipId, (clip) => ({
    ...clip,
    transitionAfter: type
      ? {
          type,
          durationSeconds: clamp(
            finite(requestedDuration, DEFAULT_TRANSITION_SECONDS),
            MIN_TRANSITION_SECONDS,
            MAX_TRANSITION_SECONDS,
          ),
        }
      : null,
  }))
}

/** Timeline start for a clip, accounting for transition overlap before it. */
export function clipTimelineStart(document: CompositeDocument, clipIndex: number): number {
  let cursor = 0
  for (let index = 0; index < clipIndex; index += 1) {
    cursor += clipDuration(document.clips[index])
    cursor -= effectiveTransitionDuration(document.clips[index], document.clips[index + 1])
  }
  return cursor
}

export function splitClip(document: CompositeDocument, clipId: string, playheadSeconds: number): CompositeDocument {
  const index = document.clips.findIndex((clip) => clip.id === clipId)
  if (index === -1) return document
  const clip = document.clips[index]
  const start = clipTimelineStart(document, index)
  const visibleDuration = clipDuration(clip)
  const localSeconds = playheadSeconds > start && playheadSeconds < start + visibleDuration
    ? playheadSeconds - start
    : visibleDuration / 2
  const sourceSplit = clamp(
    clip.inPoint + localSeconds * clip.speed,
    clip.inPoint + MIN_CLIP_SECONDS,
    clip.outPoint - MIN_CLIP_SECONDS,
  )
  if (sourceSplit <= clip.inPoint || sourceSplit >= clip.outPoint) return document

  const rightBase = `${clip.id}-split`
  let suffix = 1
  let rightId = `${rightBase}-${suffix}`
  const ids = new Set(document.clips.map((item) => item.id))
  while (ids.has(rightId)) {
    suffix += 1
    rightId = `${rightBase}-${suffix}`
  }
  const left: CompositeClip = { ...clip, outPoint: sourceSplit, transitionAfter: null }
  const right: CompositeClip = { ...clip, id: rightId, inPoint: sourceSplit }

  return {
    ...document,
    clips: [...document.clips.slice(0, index), left, right, ...document.clips.slice(index + 1)],
  }
}

export function moveClip(document: CompositeDocument, clipId: string, delta: -1 | 1): CompositeDocument {
  const index = document.clips.findIndex((clip) => clip.id === clipId)
  const target = index + delta
  if (index === -1 || target < 0 || target >= document.clips.length) return document
  const clips = document.clips.slice()
  const [clip] = clips.splice(index, 1)
  clips.splice(target, 0, clip)
  return { ...document, clips }
}

function fitSubtitles(document: CompositeDocument): CompositeSubtitle[] {
  const duration = compositeDuration(document)
  if (duration <= 0) return []
  return document.subtitles.flatMap((subtitle) => {
    const start = clamp(subtitle.start, 0, Math.max(0, duration - 0.5))
    const end = clamp(subtitle.end, start + 0.1, duration)
    return end > start ? [{ ...subtitle, start, end }] : []
  })
}

export function removeClip(document: CompositeDocument, clipId: string): CompositeDocument {
  const next = { ...document, clips: document.clips.filter((clip) => clip.id !== clipId) }
  return {
    ...next,
    subtitles: fitSubtitles(next),
    playheadSeconds: Math.min(next.playheadSeconds, compositeDuration(next)),
  }
}

export function createSubtitle(
  document: CompositeDocument,
  playheadSeconds: number,
  text = '新字幕',
): CompositeDocument {
  const duration = compositeDuration(document)
  if (duration <= 0) return document
  const start = clamp(finite(playheadSeconds, 0), 0, Math.max(0, duration - 0.5))
  const end = Math.min(duration, start + DEFAULT_SUBTITLE_SECONDS)
  const ids = document.subtitles.map((subtitle) => subtitle.id)
  let sequence = 1
  while (ids.includes(`subtitle-${sequence}`)) sequence += 1
  return {
    ...document,
    subtitles: [
      ...document.subtitles,
      { id: `subtitle-${sequence}`, text, start, end, visible: true },
    ],
  }
}

export function toComposeRequest(document: CompositeDocument): ComposeRequestDocument {
  return {
    clips: document.clips.map((clip) => ({
      url: clip.url,
      inPoint: clip.inPoint,
      outPoint: clip.outPoint,
      speed: clip.speed,
      muted: document.sourceAudioMuted || clip.muted,
      transitionAfter: clip.transitionAfter?.type ?? null,
      transitionDurationSeconds: clip.transitionAfter?.durationSeconds ?? null,
    })),
    audioTracks: document.audioTracks.map((track) => ({
      url: track.url,
      inPoint: track.inPoint,
      outPoint: track.outPoint,
      start: track.start,
      volume: track.volume,
      muted: track.muted,
    })),
    subtitles: document.subtitles
      .filter((subtitle) => subtitle.visible && subtitle.text.trim().length > 0)
      .map(({ text, start, end }) => ({ text: text.trim(), start, end })),
  }
}
