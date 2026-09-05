'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { ComposeMediaUrlSchema, ComposeTaskResponseSchema, type ComposeTask } from '@/contracts/compose'
import {
  appendAudioTrack,
  appendClip,
  clipTimelineStart,
  compositeDuration,
  createSubtitle,
  emptyCompositeDocument,
  MIN_CLIP_SECONDS,
  moveClip,
  readCompositeDocument,
  removeClip,
  setAudioTrackTiming,
  setAudioTrackVolume,
  setClipSpeed,
  setClipTrim,
  setTransition,
  splitClip,
  toComposeRequest,
  type CompositeSource,
} from '@/domain/composite'
import { createNode } from '@/domain/factory'
import { TRANSITIONS } from '@/domain/libraries'
import type {
  Artifact,
  CompositeAudioTrack,
  CompositeClip,
  CompositeDocument,
  CompositeSubtitle,
  CompositeTransitionId,
  WorkflowDocument,
  WorkflowNode,
} from '@/domain/types'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useEditor } from '@/lib/editor-store'
import { nextFreeSpot } from '../canvas/WorkflowCanvas'
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconCut,
  IconDownload,
  IconExpand,
  IconPause,
  IconPlay,
  IconPlus,
  IconRefresh,
  IconRedo,
  IconSearch,
  IconText,
  IconTrash,
  IconUndo,
  IconVideo,
  IconZoomIn,
} from '../icons'
import { Spinner } from '../ui/controls'

type EditorTool = 'clip' | 'transition' | 'subtitle'
type SubtitleTab = 'subtitle' | 'text'
type TimelineFeedbackTone = 'info' | 'success' | 'error'

interface TimelineFeedback {
  tone: TimelineFeedbackTone
  message: string
}

interface TrimPreview {
  clipId: string
  inPoint: number
  outPoint: number
}

const PX_PER_SECOND = 40
const TIMELINE_HEIGHT = 255
const PLAYHEAD_STEP_SECONDS = 0.1
const PLAYHEAD_PAGE_STEP_SECONDS = 1
const DEFAULT_SOURCE_ASPECT_RATIO = '16 / 9'
const COMPOSE_TASK_STORAGE_KEY = 'libtv.compose.active-task'

const TRANSITION_UI: Record<CompositeTransitionId, { label: string; accent: string }> = {
  fade: { label: '淡入淡出', accent: 'from-amber-300/80 via-slate-500/70 to-cyan-800/80' },
  'to-black': { label: '黑场过渡', accent: 'from-slate-500 via-black to-slate-800' },
  'to-white': { label: '白场过渡', accent: 'from-slate-500 via-white to-slate-300' },
}

type SourceDimensions = Pick<Artifact, 'width' | 'height'>

function validDimension(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/** Use provider metadata rather than the size of the editor card. */
export function sourceAspectRatio(dimensions: SourceDimensions | null | undefined): string {
  if (!validDimension(dimensions?.width) || !validDimension(dimensions?.height)) {
    return DEFAULT_SOURCE_ASPECT_RATIO
  }
  return `${dimensions.width} / ${dimensions.height}`
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left)
  let b = Math.abs(right)
  while (b !== 0) {
    const remainder = a % b
    a = b
    b = remainder
  }
  return a || 1
}

export function sourceAspectRatioLabel(dimensions: SourceDimensions | null | undefined): string {
  if (!validDimension(dimensions?.width) || !validDimension(dimensions?.height)) return '16:9'
  if (!Number.isInteger(dimensions.width) || !Number.isInteger(dimensions.height)) {
    return `${dimensions.width}:${dimensions.height}`
  }
  const divisor = greatestCommonDivisor(dimensions.width, dimensions.height)
  return `${dimensions.width / divisor}:${dimensions.height / divisor}`
}

export function collectSources(document: WorkflowDocument): CompositeSource[] {
  const seen = new Set<string>()
  const result: CompositeSource[] = []
  for (const node of document.nodes) {
    for (const artifact of node.data.artifacts ?? []) {
      if ((artifact.kind !== 'video' && artifact.kind !== 'audio') || seen.has(artifact.id)) continue
      seen.add(artifact.id)
      const nodeType = artifact.kind === 'video'
        ? node.type === 'videoComposite' ? 'videoComposite' : 'video'
        : undefined
      result.push({
        artifact,
        nodeId: node.id,
        nodeName: node.name,
        ...(nodeType ? { nodeType } : {}),
      })
    }
  }
  return result
}

export function isExcludedCompositeSource(source: CompositeSource): boolean {
  return source.nodeType === 'videoComposite'
}

/**
 * The compositor only accepts deterministic local media. This mirrors
 * the Zod request boundary before a user can place a source on the timeline;
 * the server still realpath-checks and probes the file at render time.
 */
export function isComposableMediaSource(source: CompositeSource): boolean {
  const artifact = source.artifact
  return (
    !isExcludedCompositeSource(source) &&
    (artifact.kind === 'video' || artifact.kind === 'audio') &&
    typeof artifact.durationSeconds === 'number' &&
    Number.isFinite(artifact.durationSeconds) &&
    artifact.durationSeconds >= MIN_CLIP_SECONDS &&
    ComposeMediaUrlSchema.safeParse(artifact.url).success
  )
}

function compositeNodeOf(document: WorkflowDocument): WorkflowNode | null {
  return document.nodes.find((node) => node.type === 'videoComposite') ?? null
}

function clipSeconds(clip: CompositeClip) {
  return (clip.outPoint - clip.inPoint) / clip.speed
}

export type TrimEdge = 'in' | 'out'

/** Convert a timeline drag into source-space trim points. */
export function trimPointsForDrag(
  clip: CompositeClip,
  edge: TrimEdge,
  deltaPixels: number,
  pixelsPerSecond: number,
): Pick<CompositeClip, 'inPoint' | 'outPoint'> {
  if (!Number.isFinite(deltaPixels) || !Number.isFinite(pixelsPerSecond) || pixelsPerSecond <= 0) {
    return { inPoint: clip.inPoint, outPoint: clip.outPoint }
  }
  const sourceDelta = (deltaPixels / pixelsPerSecond) * clip.speed
  if (edge === 'in') {
    return {
      inPoint: Math.max(0, Math.min(clip.outPoint - MIN_CLIP_SECONDS, clip.inPoint + sourceDelta)),
      outPoint: clip.outPoint,
    }
  }
  return {
    inPoint: clip.inPoint,
    outPoint: Math.max(clip.inPoint + MIN_CLIP_SECONDS, Math.min(clip.durationSeconds, clip.outPoint + sourceDelta)),
  }
}

export function playheadValueForKey(current: number, key: string, total: number): number | null {
  const maximum = Number.isFinite(total) ? Math.max(0, total) : 0
  const value = Number.isFinite(current) ? Math.max(0, Math.min(maximum, current)) : 0
  let next: number
  switch (key) {
    case 'Home':
      next = 0
      break
    case 'End':
      next = maximum
      break
    case 'ArrowLeft':
    case 'ArrowDown':
      next = value - PLAYHEAD_STEP_SECONDS
      break
    case 'ArrowRight':
    case 'ArrowUp':
      next = value + PLAYHEAD_STEP_SECONDS
      break
    case 'PageDown':
      next = value - PLAYHEAD_PAGE_STEP_SECONDS
      break
    case 'PageUp':
      next = value + PLAYHEAD_PAGE_STEP_SECONDS
      break
    default:
      return null
  }
  return Number(Math.max(0, Math.min(maximum, next)).toFixed(3))
}

function timeLabel(seconds: number) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0)
  return String(Math.floor(safe / 60)).padStart(2, '0') + ':' + String(Math.floor(safe % 60)).padStart(2, '0')
}

function cleanExtra(extra: Record<string, unknown> | undefined) {
  const next = { ...(extra ?? {}) }
  delete next.timeline
  delete next.transitions
  delete next.subtitles
  return next
}

function activeClipAt(document: CompositeDocument, playhead: number) {
  for (let index = 0; index < document.clips.length; index += 1) {
    const clip = document.clips[index]
    const start = clipTimelineStart(document, index)
    if (playhead < start + clipSeconds(clip) || index === document.clips.length - 1) {
      return { clip, start }
    }
  }
  return null
}

export function splitValidationMessage(
  document: CompositeDocument,
  clipId: string | null,
  playheadSeconds: number,
): string | null {
  if (!clipId) return '请先选择一个片段后再分割。'
  const index = document.clips.findIndex((clip) => clip.id === clipId)
  if (index === -1) return '所选片段已不存在，请重新选择后再分割。'
  if (!Number.isFinite(playheadSeconds)) return '播放头位置无效，请重新定位后再分割。'

  const clip = document.clips[index]
  const start = clipTimelineStart(document, index)
  const end = start + clipSeconds(clip)
  if (playheadSeconds === start) {
    return '播放头位于所选片段起点，当前边界不支持分割；请将播放头移到片段内部。'
  }
  if (playheadSeconds < start) {
    return '播放头不在所选片段内部（位于片段之前），请移到片段内部后再分割。'
  }
  if (playheadSeconds === end) {
    return '播放头位于所选片段终点，当前边界不支持分割；请将播放头移到片段内部。'
  }
  if (playheadSeconds > end) {
    return '播放头不在所选片段内部（位于片段之后），请移到片段内部后再分割。'
  }
  if (clip.outPoint - clip.inPoint <= MIN_CLIP_SECONDS * 2) {
    return '所选片段太短，至少需要 0.1 秒源素材才能分割。'
  }
  return null
}

/**
 * The official compositor replaces the right two thirds of Storyboard rather
 * than opening a modal. Its timeline is a versioned canvas-node document, so
 * reload, undo and export all operate on the same state.
 */
export function ClipEditor({
  open,
  onClose,
  onExported,
}: {
  open: boolean
  onClose: () => void
  onExported?: (artifact: Artifact) => void
}) {
  const workflow = useEditor((state) => state.document)
  const commitWith = useEditor((state) => state.commitWith)
  const toast = useEditor((state) => state.toast)
  const undo = useEditor((state) => state.undo)
  const redo = useEditor((state) => state.redo)
  const undoLabel = useEditor((state) => state.undoStack.at(-1)?.label ?? null)
  const redoLabel = useEditor((state) => state.redoStack.at(-1)?.label ?? null)
  const allSources = useMemo(() => collectSources(workflow), [workflow])
  const sources = useMemo(
    () => allSources.filter(isComposableMediaSource),
    [allSources],
  )
  const excludedCompositeSources = useMemo(
    () => allSources.filter(isExcludedCompositeSource),
    [allSources],
  )
  const unavailableSources = useMemo(
    () => allSources.filter((source) => !isExcludedCompositeSource(source) && !isComposableMediaSource(source)),
    [allSources],
  )
  const videos = useMemo(() => sources.filter((source) => source.artifact.kind === 'video'), [sources])
  const audios = useMemo(() => sources.filter((source) => source.artifact.kind === 'audio'), [sources])
  const sourceByArtifactId = useMemo(
    () => new Map(allSources.map((source) => [source.artifact.id, source])),
    [allSources],
  )
  const compositeNode = useMemo(() => compositeNodeOf(workflow), [workflow])
  const persistedTimeline = useMemo(
    () => readCompositeDocument(compositeNode?.data.extra, allSources),
    [allSources, compositeNode?.data.extra],
  )

  const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null)
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null)
  const [tool, setTool] = useState<EditorTool>('clip')
  const [subtitleTab, setSubtitleTab] = useState<SubtitleTab>('subtitle')
  const [subtitleSearch, setSubtitleSearch] = useState('')
  const [subtitleDrafts, setSubtitleDrafts] = useState<Record<string, string>>({})
  const [playhead, setPlayhead] = useState(persistedTimeline.playheadSeconds)
  const [playing, setPlaying] = useState(false)
  const [trimPreview, setTrimPreview] = useState<TrimPreview | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [composeTask, setComposeTask] = useState<ComposeTask | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [failure, setFailure] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [timelineFeedback, setTimelineFeedback] = useState<TimelineFeedback | null>(null)
  const [notes, setNotes] = useState<string[]>([])
  const [trackViewportWidth, setTrackViewportWidth] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const playheadRef = useRef(playhead)
  const trackViewportRef = useRef<HTMLDivElement>(null)
  const exportRef = useRef<HTMLDivElement>(null)
  const aliveRef = useRef(true)

  /** Only active work and failures are resumable; successful/cancelled work is acknowledged once. */
  const rememberComposeTask = useCallback((task: ComposeTask) => {
    setComposeTask(task)
    if (task.status === 'queued' || task.status === 'rendering' || task.status === 'failed') {
      window.localStorage.setItem(COMPOSE_TASK_STORAGE_KEY, task.id)
    } else {
      window.localStorage.removeItem(COMPOSE_TASK_STORAGE_KEY)
    }
  }, [])

  const timeline = useMemo(() => {
    if (!trimPreview) return persistedTimeline
    return {
      ...persistedTimeline,
      clips: persistedTimeline.clips.map((clip) => clip.id === trimPreview.clipId
        ? { ...clip, inPoint: trimPreview.inPoint, outPoint: trimPreview.outPoint }
        : clip),
    }
  }, [persistedTimeline, trimPreview])

  const selectedClip = timeline.clips.find((clip) => clip.id === selectedClipId) ?? null
  const selectedClipIndex = selectedClip ? timeline.clips.findIndex((clip) => clip.id === selectedClip.id) : -1
  const selectedAudio = timeline.audioTracks.find((track) => track.id === selectedAudioId) ?? null
  const selectedSubtitle = timeline.subtitles.find((subtitle) => subtitle.id === selectedSubtitleId) ?? null
  const total = compositeDuration(timeline)
  const empty = timeline.clips.length === 0
  const pixelsPerSecond = PX_PER_SECOND * timeline.zoom
  const trackWidth = Math.max(trackViewportWidth, Math.ceil(total * pixelsPerSecond + 24))
  const active = useMemo(() => activeClipAt(timeline, playhead), [playhead, timeline])
  const activeClip = active?.clip ?? null
  const activeClipStart = active?.start ?? 0
  const activeSource = activeClip ? sourceByArtifactId.get(activeClip.artifactId) : undefined
  const activeAspectRatio = sourceAspectRatio(activeSource?.artifact)
  const splitHint = splitValidationMessage(timeline, selectedClipId, playhead)
  const activeSubtitle = timeline.subtitles.find(
    (subtitle) => subtitle.visible && playhead >= subtitle.start && playhead <= subtitle.end,
  )

  const persist = useCallback(
    (transform: (current: CompositeDocument) => CompositeDocument, label: string) =>
      commitWith((document) => {
        const latestSources = collectSources(document)
        const node = compositeNodeOf(document)
        const current = node ? readCompositeDocument(node.data.extra, latestSources) : emptyCompositeDocument()
        const next = transform(current)
        if (JSON.stringify(current) === JSON.stringify(next)) return []
        if (!node) {
          const created = createNode('videoComposite', nextFreeSpot(document.nodes), document.nodes, { name: '视频合成' })
          created.data.extra = { composite: next }
          return [{ op: 'addNode' as const, node: created }]
        }
        return [{
          op: 'updateNode' as const,
          nodeId: node.id,
          patch: { data: { ...node.data, extra: { ...cleanExtra(node.data.extra), composite: next } } },
        }]
      }, label),
    [commitWith],
  )

  const seek = useCallback(
    (seconds: number) => {
      const value = Number.isFinite(seconds) ? Math.max(0, Math.min(total, seconds)) : 0
      playheadRef.current = value
      setPlayhead(value)
      void persist((document) => ({ ...document, playheadSeconds: value }), '定位视频时间线')
    },
    [persist, total],
  )

  const close = useCallback(() => {
    setPlaying(false)
    setExportOpen(false)
    setTrimPreview(null)
    void persist(
      (document) => ({ ...document, playheadSeconds: Math.min(compositeDuration(document), playhead) }),
      '保存视频编辑位置',
    )
    onClose()
  }, [onClose, persist, playhead])

  /**
   * The shared editor history persists every compositor mutation on the
   * videoComposite node. Keep the acknowledgement local to this surface so a
   * timeline user knows whether their keyboard action was accepted instead of
   * having to infer it from a changed clip.
   */
  const applyHistory = useCallback(async (direction: 'undo' | 'redo') => {
    const label = direction === 'undo' ? undoLabel : redoLabel
    if (!label) {
      setTimelineFeedback({
        tone: 'info',
        message: direction === 'undo' ? '没有可撤销的视频时间线操作。' : '没有可重做的视频时间线操作。',
      })
      return
    }

    const beforeRevision = useEditor.getState().revision
    setTimelineFeedback({ tone: 'info', message: `${direction === 'undo' ? '正在撤销' : '正在重做'}：${label}…` })
    await (direction === 'undo' ? undo() : redo())
    if (!aliveRef.current) return

    const saved = useEditor.getState().revision !== beforeRevision
    setTimelineFeedback(saved
      ? { tone: 'success', message: `${direction === 'undo' ? '已撤销' : '已重做'}：${label}。` }
      : { tone: 'error', message: `${direction === 'undo' ? '撤销' : '重做'}失败，时间线未改变。` })
  }, [redo, redoLabel, undo, undoLabel])

  const observeComposeTask = useCallback(async (initial: ComposeTask): Promise<ComposeTask> => {
    let current = initial
    while (current.status === 'queued' || current.status === 'rendering') {
      if (!aliveRef.current) return current
      await new Promise((resolve) => window.setTimeout(resolve, 300))
      current = ComposeTaskResponseSchema.parse(
        await api.get<unknown>(`/api/compose/${encodeURIComponent(current.id)}`),
      ).task
      if (aliveRef.current) {
        rememberComposeTask(current)
        setRendering(current.status === 'queued' || current.status === 'rendering')
      }
    }

    if (!aliveRef.current) return current
    setRendering(false)
    setNotes(current.notes)
    if (current.status === 'succeeded') {
      setSuccess('合成完成，预览和导出结果已准备好')
    } else if (current.status === 'failed') {
      setFailure(current.failure ?? '合成失败')
    } else if (current.status === 'cancelled') {
      setSuccess('已取消合成，时间线保持不变。')
    }
    rememberComposeTask(current)
    return current
  }, [rememberComposeTask])

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const taskId = window.localStorage.getItem(COMPOSE_TASK_STORAGE_KEY)
    if (!taskId) return
    void (async () => {
      try {
        const task = ComposeTaskResponseSchema.parse(
          await api.get<unknown>(`/api/compose/${encodeURIComponent(taskId)}`),
        ).task
        if (!aliveRef.current) return
        rememberComposeTask(task)
        setRendering(task.status === 'queued' || task.status === 'rendering')
        setFailure(task.status === 'failed' ? task.failure : null)
        setSuccess(task.status === 'succeeded'
          ? '合成完成，预览和导出结果已准备好'
          : task.status === 'cancelled' ? '已取消合成，时间线保持不变。' : null)
        setNotes(task.notes)
        if (task.status === 'queued' || task.status === 'rendering') await observeComposeTask(task)
      } catch {
        window.localStorage.removeItem(COMPOSE_TASK_STORAGE_KEY)
      }
    })()
  }, [observeComposeTask, open, rememberComposeTask])

  useEffect(() => {
    const viewport = trackViewportRef.current
    if (!viewport) return
    const measure = () => setTrackViewportWidth(viewport.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [open])

  useEffect(() => {
    if (playhead > total) setPlayhead(total)
    if (selectedClipId && !timeline.clips.some((clip) => clip.id === selectedClipId)) setSelectedClipId(null)
    if (selectedAudioId && !timeline.audioTracks.some((track) => track.id === selectedAudioId)) setSelectedAudioId(null)
    if (selectedSubtitleId && !timeline.subtitles.some((subtitle) => subtitle.id === selectedSubtitleId)) {
      setSelectedSubtitleId(null)
    }
  }, [playhead, selectedAudioId, selectedClipId, selectedSubtitleId, timeline, total])

  useEffect(() => {
    if (!playing || total <= 0) return
    let frame = 0
    let previous = performance.now()
    const tick = (now: number) => {
      const delta = (now - previous) / 1000
      previous = now
      setPlayhead((current) => {
        if (current + delta >= total) {
          setPlaying(false)
          return total
        }
        return current + delta
      })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, total])

  useEffect(() => {
    playheadRef.current = playhead
  }, [playhead])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !activeClip) return
    video.playbackRate = activeClip.speed
    video.muted = timeline.sourceAudioMuted || activeClip.muted
    const sourceTime = activeClip.inPoint + Math.max(0, playheadRef.current - activeClipStart) * activeClip.speed
    video.currentTime = Math.min(activeClip.outPoint, sourceTime)
    if (playing) void video.play().catch(() => undefined)
    else video.pause()
  }, [activeClip, activeClipStart, playing, timeline.sourceAudioMuted])

  useEffect(() => {
    const video = videoRef.current
    if (playing || !video || !activeClip) return
    video.currentTime = Math.min(
      activeClip.outPoint,
      activeClip.inPoint + Math.max(0, playhead - activeClipStart) * activeClip.speed,
    )
  }, [activeClip, activeClipStart, playhead, playing])

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (exportOpen && !exportRef.current?.contains(event.target as Node)) setExportOpen(false)
    }
    window.addEventListener('pointerdown', outside, true)
    return () => window.removeEventListener('pointerdown', outside, true)
  }, [exportOpen])

  useEffect(() => {
    if (!open) return
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isEditingText = Boolean(target?.matches('input, textarea, [contenteditable="true"]'))
      const modifier = event.metaKey || event.ctrlKey
      if (modifier && event.key.toLowerCase() === 'z' && !isEditingText) {
        // Canvas shortcuts are attached on the bubbling phase. Capture the
        // command here so undo/redo always reports compositor-specific state.
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        void applyHistory(event.shiftKey ? 'redo' : 'undo')
        return
      }
      if (event.code === 'Space' && !target?.matches('input, textarea, [contenteditable="true"]')) {
        event.preventDefault()
        if (!empty) setPlaying((current) => !current)
      }
      if (event.key !== 'Escape') return
      event.stopPropagation()
      if (exportOpen) return setExportOpen(false)
      if (tool !== 'clip') return setTool('clip')
      close()
    }
    window.addEventListener('keydown', keyboard, true)
    return () => window.removeEventListener('keydown', keyboard, true)
  }, [applyHistory, close, empty, exportOpen, open, tool])

  const addSource = (source: CompositeSource) => {
    setFailure(null)
    setSuccess(null)
    if (isExcludedCompositeSource(source)) {
      setTimelineFeedback({
        tone: 'error',
        message: '当前合成已排除：当前 videoComposite 不是可添加的源素材，请改用其他视频。',
      })
      return
    }
    if (!isComposableMediaSource(source)) {
      setTimelineFeedback({
        tone: 'error',
        message: '该素材不是有效的本地媒体，无法添加到时间线。',
      })
      return
    }

    const isVideo = source.artifact.kind === 'video'
    const sourceLabel = source.nodeName || '源素材'
    setTimelineFeedback({
      tone: 'info',
      message: `正在将「${sourceLabel}」添加到${isVideo ? '时间线' : '音轨'}…`,
    })

    if (isVideo) {
      const preview = appendClip(timeline, source)
      setSelectedClipId(preview.clips.at(-1)?.id ?? null)
      setSelectedAudioId(null)
      void persist((document) => appendClip(document, source), '添加视频片段').then((saved) => {
        if (!aliveRef.current) return
        if (!saved) {
          setSelectedClipId(null)
          setTimelineFeedback({ tone: 'error', message: `添加「${sourceLabel}」失败，时间线未改变。` })
          return
        }
        const latestDocument = useEditor.getState().document
        const latestSources = collectSources(latestDocument)
        const latestTimeline = readCompositeDocument(compositeNodeOf(latestDocument)?.data.extra, latestSources)
        const latest = [...latestTimeline.clips].reverse().find((clip) => clip.artifactId === source.artifact.id)
        if (!latest) {
          setSelectedClipId(null)
          setTimelineFeedback({ tone: 'error', message: `添加「${sourceLabel}」失败，时间线未改变。` })
          return
        }
        setSelectedClipId(latest.id)
        setTimelineFeedback({ tone: 'success', message: `已将「${sourceLabel}」添加到时间线。` })
      }).catch(() => {
        if (!aliveRef.current) return
        setSelectedClipId(null)
        setTimelineFeedback({ tone: 'error', message: `添加「${sourceLabel}」失败，时间线未改变。` })
      })
    } else {
      const preview = appendAudioTrack(timeline, source)
      setSelectedAudioId(preview.audioTracks.at(-1)?.id ?? null)
      setSelectedClipId(null)
      void persist((document) => appendAudioTrack(document, source), '添加独立音轨').then((saved) => {
        if (!aliveRef.current) return
        if (!saved) {
          setSelectedAudioId(null)
          setTimelineFeedback({ tone: 'error', message: `添加「${sourceLabel}」失败，时间线未改变。` })
          return
        }
        const latestDocument = useEditor.getState().document
        const latestSources = collectSources(latestDocument)
        const latestTimeline = readCompositeDocument(compositeNodeOf(latestDocument)?.data.extra, latestSources)
        const latest = [...latestTimeline.audioTracks].reverse().find((track) => track.artifactId === source.artifact.id)
        if (!latest) {
          setSelectedAudioId(null)
          setTimelineFeedback({ tone: 'error', message: `添加「${sourceLabel}」失败，时间线未改变。` })
          return
        }
        setSelectedAudioId(latest.id)
        setTimelineFeedback({ tone: 'success', message: `已将「${sourceLabel}」添加到音轨。` })
      }).catch(() => {
        if (!aliveRef.current) return
        setSelectedAudioId(null)
        setTimelineFeedback({ tone: 'error', message: `添加「${sourceLabel}」失败，时间线未改变。` })
      })
    }
    setTool('clip')
  }

  const updateSubtitle = (id: string, patch: Partial<CompositeSubtitle>, label: string) => {
    void persist(
      (document) => ({
        ...document,
        subtitles: document.subtitles.map((subtitle) => subtitle.id === id ? { ...subtitle, ...patch } : subtitle),
      }),
      label,
    )
  }

  const trimSelectedAtPlayhead = (edge: 'in' | 'out') => {
    if (!selectedClip || selectedClipIndex < 0) return
    const clipStart = clipTimelineStart(timeline, selectedClipIndex)
    const localSeconds = Math.max(0, Math.min(clipSeconds(selectedClip), playhead - clipStart))
    const sourceSeconds = selectedClip.inPoint + localSeconds * selectedClip.speed
    void persist((document) => {
      const current = document.clips.find((clip) => clip.id === selectedClip.id)
      if (!current) return document
      return setClipTrim(
        document,
        selectedClip.id,
        edge === 'in' ? sourceSeconds : current.inPoint,
        edge === 'out' ? sourceSeconds : current.outPoint,
      )
    }, edge === 'in' ? '设置片段入点' : '设置片段出点')
  }

  const previewTrim = (clipId: string, edge: TrimEdge, deltaPixels: number) => {
    const clip = persistedTimeline.clips.find((item) => item.id === clipId)
    if (!clip) return
    const points = trimPointsForDrag(clip, edge, deltaPixels, pixelsPerSecond)
    setTrimPreview({ clipId, ...points })
  }

  const finishTrim = () => {
    const preview = trimPreview
    setTrimPreview(null)
    if (!preview) return
    void persist(
      (document) => setClipTrim(document, preview.clipId, preview.inPoint, preview.outPoint),
      '拖拽裁切视频片段',
    )
  }

  const nudgeTrim = (clipId: string, edge: TrimEdge, deltaSeconds: number) => {
    void persist((document) => {
      const current = document.clips.find((clip) => clip.id === clipId)
      if (!current) return document
      return setClipTrim(
        document,
        clipId,
        edge === 'in' ? current.inPoint + deltaSeconds * current.speed : current.inPoint,
        edge === 'out' ? current.outPoint + deltaSeconds * current.speed : current.outPoint,
      )
    }, '键盘调整片段裁切')
  }

  const splitSelected = () => {
    if (splitHint) {
      setFailure(null)
      setSuccess(null)
      setTimelineFeedback({ tone: 'error', message: splitHint })
      return
    }
    if (!selectedClipId) return

    setFailure(null)
    setSuccess(null)
    setTimelineFeedback({ tone: 'info', message: '正在分割所选片段…' })
    const splitTime = playhead
    void persist(
      (document) => splitClip(document, selectedClipId, splitTime),
      '分割视频片段',
    ).then((saved) => {
      if (!aliveRef.current) return
      setTimelineFeedback(saved
        ? { tone: 'success', message: `已在 ${timeLabel(splitTime)} 分割所选片段。` }
        : { tone: 'error', message: '分割失败，时间线未改变。' })
    }).catch(() => {
      if (aliveRef.current) setTimelineFeedback({ tone: 'error', message: '分割失败，时间线未改变。' })
    })
  }

  const compose = async () => {
    if (empty || rendering) return null
    setRendering(true)
    setFailure(null)
    setSuccess(null)
    setTimelineFeedback(null)
    setNotes([])
    setElapsed(0)
    const started = Date.now()
    const timer = window.setInterval(() => setElapsed((Date.now() - started) / 1000), 250)
    try {
      const task = ComposeTaskResponseSchema.parse(
        await api.post<unknown>('/api/compose', toComposeRequest(timeline)),
      ).task
      if (aliveRef.current) rememberComposeTask(task)
      const terminal = await observeComposeTask(task)
      if (terminal.status === 'succeeded' && terminal.artifact) return terminal
      if (terminal.status === 'failed') toast(terminal.failure ?? '合成失败', 'error')
      return null
    } catch (error) {
      const message = error instanceof Error ? error.message : '合成失败'
      if (aliveRef.current) setFailure(message)
      toast(message, 'error')
      return null
    } finally {
      window.clearInterval(timer)
      if (aliveRef.current) setRendering(false)
    }
  }

  const cancelCompose = async () => {
    if (!composeTask || (composeTask.status !== 'queued' && composeTask.status !== 'rendering')) return
    const task = ComposeTaskResponseSchema.parse(
      await api.post<unknown>(`/api/compose/${encodeURIComponent(composeTask.id)}`, { action: 'cancel' }),
    ).task
    if (!aliveRef.current) return
    rememberComposeTask(task)
    setRendering(false)
    setFailure(null)
    setSuccess('已取消合成，时间线保持不变。')
  }

  const retryCompose = async () => {
    if (!composeTask || composeTask.status !== 'failed' || rendering) return
    setFailure(null)
    setSuccess(null)
    setRendering(true)
    try {
      const task = ComposeTaskResponseSchema.parse(
        await api.post<unknown>(`/api/compose/${encodeURIComponent(composeTask.id)}`, { action: 'retry' }),
      ).task
      rememberComposeTask(task)
      await observeComposeTask(task)
    } catch (error) {
      const message = error instanceof Error ? error.message : '重试失败'
      setFailure(message)
      toast(message, 'error')
    } finally {
      if (aliveRef.current) setRendering(false)
    }
  }

  const exportLocal = async () => {
    setExportOpen(false)
    const response = await compose()
    if (!response) return
    const link = window.document.createElement('a')
    if (!response.artifact) return
    link.href = response.artifact.url
    link.download = '合成视频-' + response.artifact.id.slice(-6) + '.mp4'
    window.document.body.appendChild(link)
    link.click()
    link.remove()
    toast('已导出到本地', 'success')
  }

  const exportCanvas = async () => {
    setExportOpen(false)
    const response = await compose()
    if (!response) return
    const artifact = response.artifact
    if (!artifact) return
    if (onExported) onExported(artifact)
    else {
      const saved = await commitWith((document) => {
        const node = createNode('video', nextFreeSpot(document.nodes), document.nodes, { name: '合成视频' })
        node.data.artifacts = [artifact]
        return [{ op: 'addNode', node }]
      }, '导出合成视频到画布')
      if (!saved) return
    }
    toast('已导出到画布，创建了视频合成节点', 'success')
    onClose()
  }

  if (!open) return null

  return (
    <div
      data-testid="clip-editor"
      data-video-compositor="open"
      className="relative grid h-full gap-3 overflow-hidden px-4 pb-4 pt-[72px]"
      style={{ gridTemplateColumns: '33.38% minmax(0, 1fr)' }}
    >
      <SourceRail
        sources={videos}
        audios={audios}
        excludedSources={excludedCompositeSources}
        unavailableSources={unavailableSources}
        onAdd={addSource}
      />
      <section
        data-testid="clip-editor-workspace"
        className="relative flex min-w-0 flex-col overflow-hidden rounded-2xl bg-surface ring-1 ring-ink-100"
      >
        <header className="relative z-40 flex h-12 shrink-0 items-center border-b border-ink-100 px-3">
          <h2 className="text-[13px] font-semibold text-ink-900">视频合成</h2>
          <div className="ml-auto flex items-center gap-2">
            {rendering && (
              <span data-testid="compose-progress" className="flex items-center gap-1 text-[11px] text-ink-500">
                <Spinner size={12} /> {composeTask?.status === 'queued' ? '等待合成' : `正在合成 ${elapsed.toFixed(0)}s`}
              </span>
            )}
            {rendering && (
              <button type="button" data-testid="compose-cancel" onClick={() => void cancelCompose()} className="text-[11px] text-ink-600 hover:text-ink-900">
                取消
              </button>
            )}
            <div className="flex items-center gap-1 border-r border-ink-100 pr-2">
              <ToolButton
                testId="clip-undo"
                label={undoLabel ? `撤销：${undoLabel}` : '撤销'}
                disabled={!undoLabel || rendering}
                onClick={() => void applyHistory('undo')}
              ><IconUndo size={14} /></ToolButton>
              <ToolButton
                testId="clip-redo"
                label={redoLabel ? `重做：${redoLabel}` : '重做'}
                disabled={!redoLabel || rendering}
                onClick={() => void applyHistory('redo')}
              ><IconRedo size={14} /></ToolButton>
            </div>
            <div ref={exportRef} className="relative">
              <button
                type="button"
                data-testid="clip-export-trigger"
                aria-expanded={exportOpen}
                onClick={() => setExportOpen((value) => !value)}
                className="flex h-8 items-center gap-1 rounded-lg bg-ink-900 px-3 text-[12px] font-medium text-canvas"
              >
                导出 <IconChevronDown size={11} />
              </button>
              {exportOpen && (
                <div
                  role="menu"
                  data-testid="clip-export-menu"
                  className="absolute right-0 top-10 z-50 w-48 rounded-xl bg-surface p-2 shadow-[var(--shadow-panel)] ring-1 ring-ink-100"
                >
                  <div className="px-2 pb-1.5 pt-1 text-[12px] font-medium text-ink-700">导出位置</div>
                  <ExportOption
                    testId="export-to-local"
                    label="导出到本地"
                    icon={<IconDownload size={14} />}
                    disabled={empty || rendering}
                    onClick={() => void exportLocal()}
                  />
                  <ExportOption
                    testId="export-to-canvas"
                    label="导出到画布"
                    icon={<IconVideo size={14} />}
                    disabled={empty || rendering}
                    onClick={() => void exportCanvas()}
                  />
                </div>
              )}
            </div>
            <button
              type="button"
              data-testid="close-clip-editor"
              aria-label="关闭视频合成"
              onClick={close}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-600 hover:bg-ink-100"
            >
              <IconClose size={17} />
            </button>
          </div>
        </header>

        <div className="relative min-h-0 flex-1">
          <Preview
            active={active}
            aspectRatio={activeAspectRatio}
            subtitle={activeSubtitle}
            videoRef={videoRef}
            playing={playing}
          />
          {tool === 'clip' && (selectedClip || selectedAudio) && (
            <PropertiesPanel
              key={selectedClip?.id ?? selectedAudio?.id}
              clip={selectedClip}
              audio={selectedAudio}
              clipIndex={selectedClipIndex}
              clipCount={timeline.clips.length}
              onTrim={(patch) => selectedClip && void persist((document) => {
                const current = document.clips.find((clip) => clip.id === selectedClip.id)
                if (!current) return document
                return setClipTrim(
                  document,
                  selectedClip.id,
                  patch.inPoint ?? current.inPoint,
                  patch.outPoint ?? current.outPoint,
                )
              }, '裁切视频片段')}
              onSpeed={(speed) => selectedClip && void persist(
                (document) => setClipSpeed(document, selectedClip.id, speed),
                '设置片段速度',
              )}
              onMove={(delta) => selectedClip && void persist(
                (document) => moveClip(document, selectedClip.id, delta),
                '重排视频片段',
              )}
              onMute={() => void persist((document) => ({
                ...document,
                clips: document.clips.map((clip) =>
                  selectedClip && clip.id === selectedClip.id ? { ...clip, muted: !clip.muted } : clip),
                audioTracks: document.audioTracks.map((track) =>
                  selectedAudio && track.id === selectedAudio.id ? { ...track, muted: !track.muted } : track),
              }), '切换音频静音')}
              onVolume={(volume) => selectedAudio && void persist(
                (document) => setAudioTrackVolume(document, selectedAudio.id, volume),
                '设置音轨音量',
              )}
              onAudioTiming={(patch) => selectedAudio && void persist((document) => {
                const current = document.audioTracks.find((track) => track.id === selectedAudio.id)
                if (!current) return document
                return setAudioTrackTiming(
                  document,
                  selectedAudio.id,
                  patch.inPoint ?? current.inPoint,
                  patch.outPoint ?? current.outPoint,
                  patch.start ?? current.start,
                )
              }, '调整独立音轨')}
            />
          )}
          {tool === 'transition' && (
            <TransitionPanels
              clip={selectedClip}
              canApply={selectedClipIndex >= 0 && selectedClipIndex < timeline.clips.length - 1}
              onChoose={(type) => selectedClip && void persist(
                (document) => setTransition(document, selectedClip.id, type),
                '设置片段转场',
              )}
              onDuration={(duration) => selectedClip?.transitionAfter && void persist(
                (document) => setTransition(document, selectedClip.id, selectedClip.transitionAfter!.type, duration),
                '设置转场时长',
              )}
              onDelete={() => selectedClip && void persist(
                (document) => setTransition(document, selectedClip.id, null),
                '删除片段转场',
              )}
              onClose={() => setTool('clip')}
            />
          )}
          {tool === 'subtitle' && (
            <SubtitlePanel
              tab={subtitleTab}
              onTab={setSubtitleTab}
              search={subtitleSearch}
              onSearch={setSubtitleSearch}
              subtitles={timeline.subtitles}
              drafts={subtitleDrafts}
              selectedId={selectedSubtitleId}
              disabled={empty}
              onSelect={setSelectedSubtitleId}
              onAdd={() => {
                const preview = createSubtitle(timeline, playhead)
                setSelectedSubtitleId(preview.subtitles.at(-1)?.id ?? null)
                void persist((document) => createSubtitle(document, playhead), '新建字幕')
              }}
              onDraft={(id, value) => setSubtitleDrafts((current) => ({ ...current, [id]: value }))}
              onCommit={(id, value) => {
                updateSubtitle(id, { text: value }, '编辑字幕')
                setSubtitleDrafts((current) => {
                  const next = { ...current }
                  delete next[id]
                  return next
                })
              }}
              onToggle={(subtitle) => updateSubtitle(subtitle.id, { visible: !subtitle.visible }, '切换字幕显隐')}
              onDelete={(subtitle) => void persist((document) => ({
                ...document,
                subtitles: document.subtitles.filter((item) => item.id !== subtitle.id),
              }), '删除字幕')}
            />
          )}
          <TimelineFeedbackNotice feedback={timelineFeedback} />
          {failure && (
            <Notice testId="compose-error" danger className={timelineFeedback ? 'top-14' : undefined}>
              <span>{failure}</span>
              {composeTask?.status === 'failed' && (
                <button type="button" data-testid="compose-retry" onClick={() => void retryCompose()} className="ml-2 underline">
                  重试
                </button>
              )}
            </Notice>
          )}
          {success && !failure && (
            <Notice testId="compose-success" className={timelineFeedback ? 'top-14' : undefined}>
              {success}
            </Notice>
          )}
          {notes.length > 0 && !failure && (
            <Notice testId="compose-notes" className={timelineFeedback ? 'top-14' : undefined}>
              {notes.join('；')}
            </Notice>
          )}

          <TimelinePanel
            timeline={timeline}
            selectedClipId={selectedClipId}
            selectedAudioId={selectedAudioId}
            selectedSubtitleId={selectedSubtitleId}
            tool={tool}
            playhead={playhead}
            playing={playing}
            total={total}
            pixelsPerSecond={pixelsPerSecond}
            trackWidth={trackWidth}
            viewportRef={trackViewportRef}
            splitHint={splitHint ?? '播放头位于所选片段内部，可以分割。'}
            onTool={setTool}
            onPlay={() => !empty && setPlaying((value) => !value)}
            onSeek={seek}
            onSelectClip={(clip) => {
              setSelectedClipId(clip.id)
              setSelectedAudioId(null)
              setSelectedSubtitleId(null)
              setTool('clip')
            }}
            onSelectAudio={(track) => {
              setSelectedAudioId(track.id)
              setSelectedClipId(null)
              setSelectedSubtitleId(null)
              setTool('clip')
            }}
            onSelectSubtitle={(subtitle) => {
              setSelectedSubtitleId(subtitle.id)
              setTool('subtitle')
            }}
            onSplit={splitSelected}
            onTrimIn={() => trimSelectedAtPlayhead('in')}
            onTrimOut={() => trimSelectedAtPlayhead('out')}
            onTrimPreview={previewTrim}
            onTrimEnd={finishTrim}
            onTrimNudge={nudgeTrim}
            onReorder={(clipId, targetIndex) => void persist((document) => {
              let next = document
              let currentIndex = next.clips.findIndex((clip) => clip.id === clipId)
              while (currentIndex >= 0 && currentIndex < targetIndex) {
                next = moveClip(next, clipId, 1)
                currentIndex += 1
              }
              while (currentIndex > targetIndex) {
                next = moveClip(next, clipId, -1)
                currentIndex -= 1
              }
              return next
            }, '拖拽重排视频片段')}
            onDelete={() => {
              if (selectedClip) {
                void persist((document) => removeClip(document, selectedClip.id), '删除视频片段')
                setSelectedClipId(null)
              } else if (selectedAudio) {
                void persist((document) => ({
                  ...document,
                  audioTracks: document.audioTracks.filter((track) => track.id !== selectedAudio.id),
                }), '删除独立音轨')
                setSelectedAudioId(null)
              } else if (selectedSubtitle) {
                void persist((document) => ({
                  ...document,
                  subtitles: document.subtitles.filter((subtitle) => subtitle.id !== selectedSubtitle.id),
                }), '删除字幕')
                setSelectedSubtitleId(null)
              }
            }}
            onZoom={(zoom) => void persist((document) => ({ ...document, zoom }), '缩放视频时间线')}
            onFit={() => {
              const zoom = total > 0 && trackViewportWidth > 0
                ? Math.max(0.5, Math.min(3, trackViewportWidth / (total * PX_PER_SECOND)))
                : 1
              void persist((document) => ({ ...document, zoom }), '适配视频时间线')
            }}
            onDrop={(event) => {
              event.preventDefault()
              const source = allSources.find(
                (item) => item.artifact.id === event.dataTransfer.getData('application/x-nova-source'),
              )
              if (source) addSource(source)
              else setTimelineFeedback({ tone: 'error', message: '源素材已不存在，请刷新后重试。' })
            }}
          />
        </div>
      </section>
    </div>
  )
}

function SourceRail({
  sources,
  audios,
  excludedSources,
  unavailableSources,
  onAdd,
}: {
  sources: CompositeSource[]
  audios: CompositeSource[]
  excludedSources: CompositeSource[]
  unavailableSources: CompositeSource[]
  onAdd: (source: CompositeSource) => void
}) {
  const drag = (event: DragEvent, source: CompositeSource) => {
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData('application/x-nova-source', source.artifact.id)
  }
  return (
    <aside data-testid="clip-editor-source-rail" className="flex min-w-0 flex-col gap-3 overflow-hidden">
      <section aria-label="音频源素材" className="h-[150px] shrink-0 rounded-2xl bg-surface ring-1 ring-ink-100">
        <h3 className="px-4 py-3 text-[13px] font-semibold text-ink-900">音频</h3>
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-4">
          {audios.length === 0 ? (
            <div className="flex h-[82px] w-20 flex-col items-center justify-center rounded-xl bg-ink-50 text-ink-400">
              <span className="text-xl">♫</span><span className="text-[10px]">暂无音频</span>
            </div>
          ) : audios.map((source) => (
            <article
              key={source.artifact.id}
              data-testid={'clip-source-audio-' + source.artifact.id}
              draggable
              onDragStart={(event) => drag(event, source)}
              className="group relative flex h-[82px] w-32 shrink-0 flex-col justify-end rounded-xl bg-violet-500/10 p-2"
            >
              <span className="truncate text-[11px] text-ink-700">{source.nodeName}</span>
              <span className="text-[10px] text-ink-400">{source.artifact.durationSeconds ?? 0}s</span>
              <button
                type="button"
                aria-label="添加到音轨"
                onClick={() => onAdd(source)}
                className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink-900 text-canvas opacity-0 group-hover:opacity-100 focus:opacity-100"
              >
                <IconPlus size={12} />
              </button>
            </article>
          ))}
        </div>
      </section>
      <section aria-label="视频源素材" className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-surface ring-1 ring-ink-100">
        <header className="flex items-center px-4 py-3">
          <h3 className="text-[13px] font-semibold text-ink-900">视频</h3>
          <span className="ml-auto flex items-center gap-1 text-[11px] text-ink-400">
            片段 <IconChevronDown size={10} />
          </span>
        </header>
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {excludedSources.length > 0 && (
            <p
              data-testid="clip-source-exclusion"
              role="note"
              className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-800 ring-1 ring-amber-200"
            >
              当前合成已排除：{excludedSources.map((source) => source.nodeName).join('、')}不是可添加的源素材，请改用其他视频。
            </p>
          )}
          {unavailableSources.length > 0 && (
            <p
              data-testid="clip-source-invalid"
              role="note"
              className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-800 ring-1 ring-amber-200"
            >
              已隐藏 {unavailableSources.map((source) => source.nodeName).join('、')}：仅支持存在时长的 `/api/media/` 本地媒体。
            </p>
          )}
          {sources.length === 0 ? (
            <div className="flex h-40 items-center justify-center rounded-xl bg-ink-50 text-[11px] text-ink-400">
              暂无已生成视频
            </div>
          ) : (
            <div className="space-y-4">
              {sources.map((source) => (
                <article
                  key={source.artifact.id}
                  data-testid={'clip-source-video-' + source.artifact.id}
                  draggable
                  onDragStart={(event) => drag(event, source)}
                  className="group"
                >
                  <div className="mb-1.5 flex items-center gap-2 text-[11px] text-ink-400">
                    <span className="min-w-0 truncate">{source.nodeName}</span>
                    <span className="shrink-0 rounded bg-ink-50 px-1.5 py-0.5 text-[9px] text-ink-500">源素材</span>
                  </div>
                  <div
                    className="relative overflow-hidden rounded-xl bg-ink-50"
                    style={{ aspectRatio: sourceAspectRatio(source.artifact) }}
                  >
                    {source.artifact.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={source.artifact.thumbnailUrl}
                        alt={`${source.nodeName}，源素材，原比例 ${sourceAspectRatioLabel(source.artifact)}`}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-ink-300"><IconVideo size={24} /></div>
                    )}
                    <span className="absolute bottom-2 right-2 rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white">
                      {timeLabel(source.artifact.durationSeconds ?? 0)}
                    </span>
                    <button
                      type="button"
                      aria-label="添加到时间线"
                      onClick={() => onAdd(source)}
                      className="absolute inset-0 flex items-center justify-center text-white hover:bg-black/20 focus:bg-black/20"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/65 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                        <IconPlus size={17} />
                      </span>
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-ink-400">
                    <span className="rounded bg-ink-50 px-1.5 py-1">{source.artifact.modelId}</span>
                    <span>{source.artifact.durationSeconds ?? 0}秒</span>
                    <span data-testid={'clip-source-original-ratio-' + source.artifact.id}>
                      原比例 {sourceAspectRatioLabel(source.artifact)}
                    </span>
                    {validDimension(source.artifact.width) && validDimension(source.artifact.height) ? (
                      <span>源尺寸 {source.artifact.width} × {source.artifact.height}</span>
                    ) : <span>源尺寸未知</span>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </aside>
  )
}

function ExportOption({
  testId,
  label,
  icon,
  disabled,
  onClick,
}: {
  testId: string
  label: string
  icon: ReactNode
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[12px]',
        disabled ? 'cursor-not-allowed text-ink-300' : 'text-ink-700 hover:bg-ink-50',
      )}
    >
      {icon}{label}
    </button>
  )
}

function Preview({
  active,
  aspectRatio,
  subtitle,
  videoRef,
  playing,
}: {
  active: ReturnType<typeof activeClipAt>
  aspectRatio: string
  subtitle: CompositeSubtitle | undefined
  videoRef: RefObject<HTMLVideoElement | null>
  playing: boolean
}) {
  return (
    <div className="absolute inset-x-0 top-0 flex items-center justify-center px-8" style={{ bottom: TIMELINE_HEIGHT + 16 }}>
      {active ? (
        <div
          data-testid="clip-preview-frame"
          className="relative flex max-h-[360px] w-[min(68%,640px)] items-center justify-center overflow-hidden rounded-xl bg-black"
          style={{ aspectRatio }}
        >
          <video
            ref={videoRef}
            key={active.clip.id}
            src={active.clip.url}
            poster={active.clip.poster ?? undefined}
            aria-label="源素材预览"
            playsInline
            preload="metadata"
            className="h-full w-full object-contain"
          />
          {!playing && (
            <span className="pointer-events-none absolute flex h-12 w-12 items-center justify-center rounded-full bg-black/55 text-white">
              <IconPlay size={19} />
            </span>
          )}
          {subtitle && (
            <span className="absolute bottom-6 left-1/2 max-w-[85%] -translate-x-1/2 rounded bg-black/60 px-3 py-1.5 text-center text-[14px] text-white">
              {subtitle.text}
            </span>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 text-ink-300">
          <IconVideo size={28} /><span className="text-[11px]">从左侧添加或拖入片段</span>
        </div>
      )}
    </div>
  )
}

function TimelineFeedbackNotice({ feedback }: { feedback: TimelineFeedback | null }) {
  const danger = feedback?.tone === 'error'
  return (
    <div
      id="timeline-feedback"
      data-testid="clip-timeline-feedback"
      role={danger ? 'alert' : 'status'}
      aria-live={danger ? 'assertive' : 'polite'}
      aria-atomic="true"
      className={cn(
        'absolute left-4 right-4 top-3 z-30 rounded-lg px-3 py-2 text-[11px] ring-1',
        !feedback && 'sr-only',
        danger && 'bg-danger/10 text-danger ring-danger/20',
        feedback?.tone === 'success' && 'bg-success/10 text-success ring-success/20',
        feedback?.tone === 'info' && 'bg-ink-50 text-ink-500 ring-ink-100',
      )}
    >
      {feedback?.message ?? ''}
    </div>
  )
}

function Notice({
  testId,
  danger,
  className,
  children,
}: {
  testId: string
  danger?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div
      data-testid={testId}
      role={danger ? 'alert' : 'status'}
      aria-live={danger ? 'assertive' : 'polite'}
      aria-atomic="true"
      className={cn(
        'absolute left-4 right-4 top-3 z-30 rounded-lg px-3 py-2 text-[11px] ring-1',
        danger ? 'bg-danger/10 text-danger ring-danger/20' : 'bg-ink-50 text-ink-500 ring-ink-100',
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * Numeric timeline fields keep a local draft while typing, then commit one
 * canonical document mutation on blur. Controlled values mean an undo/reload
 * or another queued edit is reflected without leaving stale defaultValue text
 * in the properties panel.
 */
function NumberDraft({
  value,
  onCommit,
  min,
  max,
  step = 0.1,
  ariaLabel,
  className,
}: {
  value: number
  onCommit: (value: number) => void
  min?: number
  max?: number
  step?: number
  ariaLabel: string
  className?: string
}) {
  const [draft, setDraft] = useState(String(value))

  useEffect(() => {
    setDraft(String(value))
  }, [value])

  const commit = () => {
    const parsed = Number(draft)
    if (!Number.isFinite(parsed)) {
      setDraft(String(value))
      return
    }
    onCommit(parsed)
  }

  return (
    <input
      aria-label={ariaLabel}
      type="number"
      min={min}
      max={max}
      step={step}
      value={draft}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
      className={className}
    />
  )
}

function PropertiesPanel({
  clip,
  audio,
  clipIndex,
  clipCount,
  onTrim,
  onSpeed,
  onMove,
  onMute,
  onVolume,
  onAudioTiming,
}: {
  clip: CompositeClip | null
  audio: CompositeAudioTrack | null
  clipIndex: number
  clipCount: number
  onTrim: (patch: Partial<Pick<CompositeClip, 'inPoint' | 'outPoint'>>) => void
  onSpeed: (speed: number) => void
  onMove: (delta: -1 | 1) => void
  onMute: () => void
  onVolume: (volume: number) => void
  onAudioTiming: (patch: Partial<Pick<CompositeAudioTrack, 'inPoint' | 'outPoint' | 'start'>>) => void
}) {
  return (
    <aside className="absolute right-2 top-2 z-20 w-[300px] rounded-xl bg-surface shadow-[var(--shadow-panel)] ring-1 ring-ink-100">
      <header className="border-b border-ink-100 px-4 py-3 text-[13px] font-semibold">{clip ? '片段' : '音轨'}</header>
      <div className="space-y-4 p-4 text-[11px]">
        <div>
          <div className="mb-1 text-ink-400">来源</div>
          <div className="truncate text-ink-700">{clip?.nodeName ?? audio?.nodeName}</div>
        </div>
        {clip && (
          <>
            <div>
              <div className="mb-1 text-ink-400">裁切</div>
              <div className="flex items-center gap-1">
                <NumberDraft
                  ariaLabel="片段入点"
                  value={clip.inPoint}
                  step={0.1}
                  onCommit={(value) => onTrim({ inPoint: value })}
                  className="min-w-0 flex-1 rounded bg-ink-50 px-2 py-1.5 outline-none ring-1 ring-ink-100"
                />
                <span>→</span>
                <NumberDraft
                  ariaLabel="片段出点"
                  value={clip.outPoint}
                  step={0.1}
                  onCommit={(value) => onTrim({ outPoint: value })}
                  className="min-w-0 flex-1 rounded bg-ink-50 px-2 py-1.5 outline-none ring-1 ring-ink-100"
                />
              </div>
            </div>
            <div>
              <div className="mb-1 text-ink-400">速度</div>
              <div className="grid grid-cols-3 gap-1">
                {[0.5, 1, 2].map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    data-testid={'clip-speed-' + speed}
                    onClick={() => onSpeed(speed)}
                    className={cn(
                      'rounded py-1.5',
                      clip.speed === speed ? 'bg-ink-900 text-canvas' : 'bg-ink-50 text-ink-600',
                    )}
                  >
                    {speed}×
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                data-testid="clip-move-left"
                disabled={clipIndex <= 0}
                onClick={() => onMove(-1)}
                className="flex h-8 flex-1 items-center justify-center rounded bg-ink-50 disabled:text-ink-300"
              >
                <IconChevronLeft size={12} />左移
              </button>
              <button
                type="button"
                data-testid="clip-move-right"
                disabled={clipIndex < 0 || clipIndex >= clipCount - 1}
                onClick={() => onMove(1)}
                className="flex h-8 flex-1 items-center justify-center rounded bg-ink-50 disabled:text-ink-300"
              >
                右移<IconChevronRight size={12} />
              </button>
            </div>
          </>
        )}
        {audio && (
          <>
            <div>
              <div className="mb-1 text-ink-400">裁切</div>
              <div className="flex items-center gap-1">
                <NumberDraft
                  ariaLabel="音轨入点"
                  value={audio.inPoint}
                  min={0}
                  step={0.1}
                  onCommit={(value) => onAudioTiming({ inPoint: value })}
                  className="min-w-0 flex-1 rounded bg-ink-50 px-2 py-1.5 outline-none ring-1 ring-ink-100"
                />
                <span>→</span>
                <NumberDraft
                  ariaLabel="音轨出点"
                  value={audio.outPoint}
                  min={0.05}
                  step={0.1}
                  onCommit={(value) => onAudioTiming({ outPoint: value })}
                  className="min-w-0 flex-1 rounded bg-ink-50 px-2 py-1.5 outline-none ring-1 ring-ink-100"
                />
              </div>
            </div>
            <label>
              <span className="mb-1 block text-ink-400">时间线起点</span>
              <NumberDraft
                ariaLabel="音轨时间线起点"
                value={audio.start}
                min={0}
                step={0.1}
                onCommit={(value) => onAudioTiming({ start: value })}
                className="w-full rounded bg-ink-50 px-2 py-1.5 outline-none ring-1 ring-ink-100"
              />
            </label>
            <label>
              <span className="mb-1 block text-ink-400">音量 {Math.round(audio.volume * 100)}%</span>
              <input
                type="range"
                aria-label="音轨音量"
                min={0}
                max={2}
                step={0.05}
                value={audio.volume}
                onChange={(event) => onVolume(Number(event.currentTarget.value))}
                className="w-full"
              />
            </label>
          </>
        )}
        <button type="button" onClick={onMute} className="w-full rounded bg-ink-50 py-2 text-ink-600">
          {(clip?.muted ?? audio?.muted) ? '开启声音' : '静音'}
        </button>
      </div>
    </aside>
  )
}

function TransitionPanels({
  clip,
  canApply,
  onChoose,
  onDuration,
  onDelete,
  onClose,
}: {
  clip: CompositeClip | null
  canApply: boolean
  onChoose: (type: CompositeTransitionId) => void
  onDuration: (duration: number) => void
  onDelete: () => void
  onClose: () => void
}) {
  const selected = clip?.transitionAfter ?? null
  return (
    <div
      className="absolute inset-x-2 top-2 z-20 grid grid-cols-[minmax(0,1fr)_300px] gap-[78px]"
      style={{ bottom: TIMELINE_HEIGHT + 16 }}
    >
      <section data-testid="transition-library" className="rounded-xl bg-surface shadow-[var(--shadow-panel)] ring-1 ring-ink-100">
        <header className="flex h-11 items-center border-b border-ink-100 px-4">
          <h3 className="text-[13px] font-semibold">转场库</h3>
          <button type="button" aria-label="关闭转场库" onClick={onClose} className="ml-auto p-1.5 text-ink-500">
            <IconClose size={15} />
          </button>
        </header>
        <div className="p-4">
          <div className="mb-3 text-[11px] text-ink-400">基础转场</div>
          <div className="grid grid-cols-3 gap-4">
            {TRANSITIONS.map((transition) => (
              <button
                key={transition.id}
                type="button"
                disabled={!canApply}
                onClick={() => onChoose(transition.id)}
                className="min-w-0 text-left text-[11px] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <span className={cn(
                  'mb-2 block aspect-[1.45] rounded-lg bg-gradient-to-br ring-1',
                  TRANSITION_UI[transition.id].accent,
                  selected?.type === transition.id ? 'ring-accent' : 'ring-ink-100',
                )} />
                <span>{TRANSITION_UI[transition.id].label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
      <section data-testid="transition-properties" className="relative rounded-xl bg-surface shadow-[var(--shadow-panel)] ring-1 ring-ink-100">
        <header className="h-11 border-b border-ink-100 px-4 py-3 text-[13px] font-semibold">转场</header>
        <div className="space-y-4 p-4 text-[11px]">
          <div><div className="mb-1 text-ink-400">名称</div>
            <div className={selected ? 'text-ink-700' : 'text-ink-400'}>
              {selected ? TRANSITION_UI[selected.type].label : '未选择转场'}
            </div>
          </div>
          <div><div className="mb-1 text-ink-400">时长</div>
            {selected ? (
              <div className="flex items-center gap-2">
                <NumberDraft
                  ariaLabel="转场时长"
                  value={selected.durationSeconds}
                  min={0.08}
                  max={2}
                  step={0.1}
                  onCommit={onDuration}
                  className="w-24 rounded bg-ink-50 px-2 py-1.5 ring-1 ring-ink-100"
                /><span>秒</span>
              </div>
            ) : <div className="text-ink-400">-</div>}
          </div>
          <div className={cn(
            'h-24 rounded-lg bg-gradient-to-br',
            selected ? TRANSITION_UI[selected.type].accent : 'from-amber-600/60 to-slate-600/60',
          )} />
        </div>
        <button
          type="button"
          data-testid="delete-transition"
          disabled={!selected}
          onClick={onDelete}
          className="absolute bottom-3 right-3 rounded bg-ink-50 px-3 py-2 text-[11px] disabled:text-ink-300"
        >
          删除
        </button>
      </section>
    </div>
  )
}

function SubtitlePanel({
  tab,
  onTab,
  search,
  onSearch,
  subtitles,
  drafts,
  selectedId,
  disabled,
  onSelect,
  onAdd,
  onDraft,
  onCommit,
  onToggle,
  onDelete,
}: {
  tab: SubtitleTab
  onTab: (tab: SubtitleTab) => void
  search: string
  onSearch: (value: string) => void
  subtitles: CompositeSubtitle[]
  drafts: Record<string, string>
  selectedId: string | null
  disabled: boolean
  onSelect: (id: string) => void
  onAdd: () => void
  onDraft: (id: string, value: string) => void
  onCommit: (id: string, value: string) => void
  onToggle: (subtitle: CompositeSubtitle) => void
  onDelete: (subtitle: CompositeSubtitle) => void
}) {
  const visible = subtitles.filter((subtitle) => subtitle.text.toLowerCase().includes(search.trim().toLowerCase()))
  return (
    <section
      data-testid="subtitle-panel"
      className="absolute right-2 top-2 z-20 w-[300px] rounded-xl bg-surface shadow-[var(--shadow-panel)] ring-1 ring-ink-100"
      style={{ bottom: TIMELINE_HEIGHT + 16 }}
    >
      <div role="tablist" className="flex h-11 gap-5 border-b border-ink-100 px-4">
        {(['subtitle', 'text'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => onTab(value)}
            className={cn(
              'border-b-2 text-[12px]',
              tab === value ? 'border-ink-900 text-ink-900' : 'border-transparent text-ink-400',
            )}
          >
            {value === 'subtitle' ? '字幕' : '文本'}
          </button>
        ))}
      </div>
      {tab === 'subtitle' ? (
        <div className="flex h-[calc(100%_-_44px)] flex-col gap-2 p-4">
          <label className="flex h-8 items-center gap-2 rounded bg-ink-50 px-3 text-ink-400">
            <input
              value={search}
              onChange={(event) => onSearch(event.currentTarget.value)}
              placeholder="搜索字幕文本"
              className="min-w-0 flex-1 bg-transparent text-[11px] outline-none"
            /><IconSearch size={13} />
          </label>
          <button
            type="button"
            data-testid="add-subtitle"
            disabled={disabled}
            onClick={onAdd}
            className="flex h-8 items-center justify-center gap-1 rounded bg-ink-100 text-[11px] disabled:text-ink-300"
          >
            <IconPlus size={13} />新建字幕
          </button>
          <div className="thin-scrollbar mt-2 min-h-0 flex-1 overflow-y-auto">
            {visible.length === 0 ? <p className="pt-4 text-[11px] text-ink-400">暂无字幕</p> : (
              <div className="space-y-2">
                {visible.map((subtitle) => (
                  <div
                    key={subtitle.id}
                    className={cn(
                      'rounded p-2 ring-1',
                      subtitle.id === selectedId ? 'bg-accent-soft ring-accent/40' : 'bg-ink-50 ring-ink-100',
                    )}
                  >
                    <input
                      data-testid={'subtitle-text-' + subtitle.id}
                      value={drafts[subtitle.id] ?? subtitle.text}
                      onFocus={() => onSelect(subtitle.id)}
                      onChange={(event) => onDraft(subtitle.id, event.currentTarget.value)}
                      onBlur={(event) => onCommit(subtitle.id, event.currentTarget.value)}
                      className="w-full bg-transparent text-[11px] outline-none"
                    />
                    <div className="mt-2 flex gap-2 text-[10px] text-ink-400">
                      <span>{subtitle.start.toFixed(1)}–{subtitle.end.toFixed(1)}s</span>
                      <button type="button" onClick={() => onToggle(subtitle)} className="ml-auto">
                        {subtitle.visible ? '隐藏' : '显示'}
                      </button>
                      <button type="button" onClick={() => onDelete(subtitle)}>删除</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 p-4">
          {['标题', '正文', '注释', '片尾'].map((preset) => (
            <button key={preset} type="button" disabled={disabled} onClick={onAdd} className="rounded bg-ink-50 p-4 text-left text-[12px]">
              {preset}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function TimelinePanel({
  timeline,
  selectedClipId,
  selectedAudioId,
  selectedSubtitleId,
  tool,
  playhead,
  playing,
  total,
  pixelsPerSecond,
  trackWidth,
  viewportRef,
  splitHint,
  onTool,
  onPlay,
  onSeek,
  onSelectClip,
  onSelectAudio,
  onSelectSubtitle,
  onSplit,
  onTrimIn,
  onTrimOut,
  onTrimPreview,
  onTrimEnd,
  onTrimNudge,
  onReorder,
  onDelete,
  onZoom,
  onFit,
  onDrop,
}: {
  timeline: CompositeDocument
  selectedClipId: string | null
  selectedAudioId: string | null
  selectedSubtitleId: string | null
  tool: EditorTool
  playhead: number
  playing: boolean
  total: number
  pixelsPerSecond: number
  trackWidth: number
  viewportRef: RefObject<HTMLDivElement | null>
  splitHint: string
  onTool: (tool: EditorTool) => void
  onPlay: () => void
  onSeek: (value: number) => void
  onSelectClip: (clip: CompositeClip) => void
  onSelectAudio: (track: CompositeAudioTrack) => void
  onSelectSubtitle: (subtitle: CompositeSubtitle) => void
  onSplit: () => void
  onTrimIn: () => void
  onTrimOut: () => void
  onTrimPreview: (clipId: string, edge: TrimEdge, deltaPixels: number) => void
  onTrimEnd: () => void
  onTrimNudge: (clipId: string, edge: TrimEdge, deltaSeconds: number) => void
  onReorder: (clipId: string, targetIndex: number) => void
  onDelete: () => void
  onZoom: (zoom: number) => void
  onFit: () => void
  onDrop: (event: DragEvent) => void
}) {
  const selection = Boolean(selectedClipId || selectedAudioId || selectedSubtitleId)
  const trimDragRef = useRef<{ clipId: string; edge: TrimEdge; startX: number; pointerId: number } | null>(null)
  const seekAt = (event: MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    onSeek((event.clientX - bounds.left + event.currentTarget.scrollLeft) / pixelsPerSecond)
  }
  const beginTrim = (event: React.PointerEvent<HTMLSpanElement>, clipId: string, edge: TrimEdge) => {
    event.preventDefault()
    event.stopPropagation()
    trimDragRef.current = { clipId, edge, startX: event.clientX, pointerId: event.pointerId }
    event.currentTarget.setPointerCapture(event.pointerId)
    onTrimPreview(clipId, edge, 0)
  }
  const moveTrim = (event: React.PointerEvent<HTMLSpanElement>) => {
    const drag = trimDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    onTrimPreview(drag.clipId, drag.edge, event.clientX - drag.startX)
  }
  const endTrim = (event: React.PointerEvent<HTMLSpanElement>) => {
    const drag = trimDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.stopPropagation()
    trimDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    onTrimEnd()
  }
  const nudgeTrimFromKeyboard = (event: React.KeyboardEvent<HTMLSpanElement>, clipId: string, edge: TrimEdge) => {
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0
    if (!direction) return
    event.preventDefault()
    event.stopPropagation()
    onTrimNudge(clipId, edge, direction * 0.1)
  }
  return (
    <section
      data-testid="clip-timeline-panel"
      className="absolute bottom-2 left-2 right-2 z-30 overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-panel)] ring-1 ring-ink-100"
      style={{ height: TIMELINE_HEIGHT }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <div className="relative flex h-12 items-center border-b border-ink-100 px-3">
        <div className="flex gap-1">
          <ToolButton testId="clip-set-in" label="设置入点" disabled={!selectedClipId} onClick={onTrimIn}>Ⅰ</ToolButton>
          <ToolButton testId="clip-set-out" label="设置出点" disabled={!selectedClipId} onClick={onTrimOut}>Ⅰ</ToolButton>
          <ToolButton
            testId="clip-split"
            label="分割"
            describedBy="clip-split-hint"
            disabled={!selectedClipId}
            onClick={onSplit}
          ><IconCut size={14} /></ToolButton>
          <ToolButton
            testId="clip-tool-subtitle"
            label="字幕"
            active={tool === 'subtitle'}
            onClick={() => onTool('subtitle')}
          ><IconText size={15} /></ToolButton>
          <ToolButton
            testId="clip-tool-transition"
            label="转场"
            active={tool === 'transition'}
            onClick={() => onTool('transition')}
          ><span className="rounded border px-0.5 text-[8px]">▶</span></ToolButton>
        </div>
        <span id="clip-split-hint" className="sr-only">{splitHint}</span>
        <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center gap-3 text-[11px]">
          <span data-testid="clip-current-time" className="w-10 text-right tabular-nums">{timeLabel(playhead)}</span>
          <input
            data-testid="clip-playhead-slider"
            type="range"
            aria-label="播放头"
            aria-describedby="clip-playhead-help"
            aria-valuetext={`${timeLabel(playhead)} / ${timeLabel(total)}`}
            min={0}
            max={Math.max(0, total)}
            step={PLAYHEAD_STEP_SECONDS}
            value={Math.max(0, Math.min(total, playhead))}
            disabled={timeline.clips.length === 0}
            onChange={(event) => onSeek(Number(event.currentTarget.value))}
            onKeyDown={(event) => {
              const next = playheadValueForKey(playhead, event.key, total)
              if (next === null) return
              event.preventDefault()
              onSeek(next)
            }}
            className="pointer-events-auto w-24 accent-danger"
          />
          <button
            type="button"
            aria-label={playing ? '暂停' : '播放'}
            disabled={timeline.clips.length === 0}
            onClick={onPlay}
            className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-ink-100 disabled:text-ink-300"
          >
            {playing ? <IconPause size={14} /> : <IconPlay size={14} />}
          </button>
          <span data-testid="clip-total-time" className="w-10 tabular-nums">{timeLabel(total)}</span>
        </div>
        <span id="clip-playhead-help" className="sr-only">
          使用方向键以 0.1 秒移动播放头，PageUp 和 PageDown 以 1 秒移动，Home 和 End 跳到时间线边界。
        </span>
        <div className="ml-auto flex gap-1">
          <ToolButton label="全屏预览" disabled={timeline.clips.length === 0} onClick={() => void globalThis.document.documentElement.requestFullscreen?.()}><IconExpand size={14} /></ToolButton>
          <ToolButton label="回到开始" disabled={timeline.clips.length === 0} onClick={() => onSeek(0)}><IconRefresh size={13} /></ToolButton>
          <ToolButton label="删除所选" disabled={!selection} onClick={onDelete}><IconTrash size={13} /></ToolButton>
          <ToolButton label="缩小时间线" onClick={() => onZoom(Math.max(0.5, timeline.zoom - 0.25))}>−</ToolButton>
          <input
            type="range"
            aria-label="时间线缩放"
            min={0.5}
            max={3}
            step={0.25}
            value={timeline.zoom}
            onChange={(event) => onZoom(Number(event.currentTarget.value))}
            className="w-14"
          />
          <ToolButton label="放大时间线" onClick={() => onZoom(Math.min(3, timeline.zoom + 0.25))}><IconZoomIn size={14} /></ToolButton>
          <ToolButton label="适配时间线" onClick={onFit}>↗</ToolButton>
        </div>
      </div>
      <div className="flex h-[207px]">
        <div className="w-[78px] shrink-0 border-r border-ink-100 pt-7">
          <TrackLabel icon={<IconVideo size={14} />} label="视频" />
          {timeline.audioTracks.length > 0 && <TrackLabel icon="♫" label="音轨" />}
          {tool === 'subtitle' && <TrackLabel icon={<IconText size={14} />} label="字幕" />}
        </div>
        <div
          ref={viewportRef}
          data-testid="clip-track-viewport"
          className="thin-scrollbar min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
          onClick={seekAt}
        >
          <div className="relative h-full" style={{ width: trackWidth }}>
            <Ruler total={total} pixelsPerSecond={pixelsPerSecond} />
            <div className="absolute left-0 right-0 top-7 h-14 bg-ink-50/70">
              {timeline.clips.length === 0 ? (
                <div data-testid="clip-track-empty" className="flex h-full items-center justify-center text-[11px] text-ink-400">
                  将左侧片段拖入时间线
                </div>
              ) : timeline.clips.map((clip, index) => (
                <button
                  key={clip.id}
                  type="button"
                  data-testid={'timeline-clip-' + clip.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('application/x-nova-clip', clip.id)
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    const draggedId = event.dataTransfer.getData('application/x-nova-clip')
                    if (!draggedId || draggedId === clip.id) return
                    event.preventDefault()
                    event.stopPropagation()
                    onReorder(draggedId, index)
                  }}
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelectClip(clip)
                  }}
                  className={cn(
                    'group absolute top-1 h-12 overflow-hidden rounded ring-2',
                    clip.id === selectedClipId ? 'ring-accent' : 'ring-transparent',
                  )}
                  style={{
                    left: clipTimelineStart(timeline, index) * pixelsPerSecond,
                    width: Math.max(24, clipSeconds(clip) * pixelsPerSecond),
                  }}
                >
                  {clip.poster && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={clip.poster} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  )}
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 text-left text-[9px] text-white">
                    {clip.nodeName} · {clip.speed}×
                  </span>
                  {(['in', 'out'] as const).map((edge) => (
                    <span
                      key={edge}
                      role="slider"
                      tabIndex={0}
                      data-testid={`trim-handle-${edge}-${clip.id}`}
                      aria-label={`${clip.nodeName}${edge === 'in' ? '入点' : '出点'}`}
                      aria-valuemin={edge === 'in' ? 0 : clip.inPoint + MIN_CLIP_SECONDS}
                      aria-valuemax={edge === 'in' ? clip.outPoint - MIN_CLIP_SECONDS : clip.durationSeconds}
                      aria-valuenow={edge === 'in' ? clip.inPoint : clip.outPoint}
                      aria-valuetext={`${edge === 'in' ? '入点' : '出点'} ${timeLabel(edge === 'in' ? clip.inPoint : clip.outPoint)}`}
                      className={cn(
                        'absolute inset-y-0 z-10 w-2 cursor-ew-resize bg-white/70 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus:opacity-100 focus-visible:outline-2 focus-visible:outline-accent',
                        edge === 'in' ? 'left-0' : 'right-0',
                        clip.id === selectedClipId && 'opacity-100',
                      )}
                      onPointerDown={(event) => beginTrim(event, clip.id, edge)}
                      onPointerMove={moveTrim}
                      onPointerUp={endTrim}
                      onPointerCancel={endTrim}
                      onKeyDown={(event) => nudgeTrimFromKeyboard(event, clip.id, edge)}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <span className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-ink-500/70" />
                    </span>
                  ))}
                  {clip.transitionAfter && index < timeline.clips.length - 1 && (
                    <span className="absolute right-0 top-0 bg-accent px-1 text-[8px]">◆</span>
                  )}
                </button>
              ))}
            </div>
            {timeline.audioTracks.length > 0 && (
              <div className="absolute left-0 right-0 top-[88px] h-10 bg-ink-50/50">
                {timeline.audioTracks.map((track) => (
                  <button
                    key={track.id}
                    type="button"
                    data-testid={'timeline-audio-' + track.id}
                    onClick={(event) => {
                      event.stopPropagation()
                      onSelectAudio(track)
                    }}
                    className={cn(
                      'absolute top-1 h-8 truncate rounded bg-violet-500/20 px-2 text-[9px] ring-2',
                      track.id === selectedAudioId ? 'ring-accent' : 'ring-transparent',
                    )}
                    style={{
                      left: track.start * pixelsPerSecond,
                      width: Math.max(24, Math.min(total - track.start, track.outPoint - track.inPoint) * pixelsPerSecond),
                    }}
                  >
                    ♫ {track.nodeName}
                  </button>
                ))}
              </div>
            )}
            {tool === 'subtitle' && (
              <div
                data-testid="subtitle-track"
                className="absolute left-0 right-0 h-10 bg-ink-50/50"
                style={{ top: timeline.audioTracks.length > 0 ? 132 : 88 }}
              >
                {timeline.subtitles.map((subtitle) => (
                  <button
                    key={subtitle.id}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onSelectSubtitle(subtitle)
                    }}
                    className={cn(
                      'absolute top-1 h-8 truncate rounded bg-sky-500/20 px-2 text-[9px] ring-2',
                      subtitle.id === selectedSubtitleId ? 'ring-accent' : 'ring-transparent',
                    )}
                    style={{
                      left: subtitle.start * pixelsPerSecond,
                      width: Math.max(32, (subtitle.end - subtitle.start) * pixelsPerSecond),
                    }}
                  >
                    {subtitle.text}
                  </button>
                ))}
              </div>
            )}
            <div
              data-testid="clip-playhead"
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 top-5 z-30 w-px bg-danger"
              style={{ left: playhead * pixelsPerSecond }}
            ><span className="absolute -left-1 -top-1 h-2 w-2 rotate-45 bg-danger" /></div>
          </div>
        </div>
      </div>
    </section>
  )
}

function ToolButton({
  label,
  testId,
  describedBy,
  disabled,
  active,
  onClick = () => undefined,
  children,
}: {
  label: string
  testId?: string
  describedBy?: string
  disabled?: boolean
  active?: boolean
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-describedby={describedBy}
      title={label}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded text-ink-500 hover:bg-ink-50',
        active && 'bg-ink-100 text-ink-900',
        disabled && 'cursor-not-allowed text-ink-300 hover:bg-transparent',
      )}
    >
      {children}
    </button>
  )
}

function TrackLabel({ icon, label }: { icon: ReactNode; label: string }) {
  return <div className="flex h-11 items-center gap-1.5 px-3 text-[10px] text-ink-500">{icon}<span>{label}</span></div>
}

function Ruler({ total, pixelsPerSecond }: { total: number; pixelsPerSecond: number }) {
  const step = pixelsPerSecond >= 60 ? 1 : pixelsPerSecond >= 30 ? 2 : 5
  const marks = Array.from({ length: Math.floor(Math.max(10, Math.ceil(total)) / step) + 1 }, (_, index) => index * step)
  return (
    <div className="absolute inset-x-0 top-0 h-7 border-b border-ink-100 text-[9px] text-ink-400">
      {marks.map((second) => (
        <span key={second} className="absolute top-1" style={{ left: second * pixelsPerSecond }}>
          <span className="block h-1.5 w-px bg-ink-200" />{timeLabel(second)}
        </span>
      ))}
    </div>
  )
}
