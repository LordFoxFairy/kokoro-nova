'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createNode } from '@/domain/factory'
import { TRANSITIONS } from '@/domain/libraries'
import type { Artifact } from '@/domain/types'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useEditor } from '@/lib/editor-store'
import { nextFreeSpot } from '../canvas/WorkflowCanvas'
import { Dialog } from '../ui/Dialog'
import { EmptyState, Spinner } from '../ui/controls'
import { IconCut, IconDownload, IconPlus, IconText, IconTrash, IconVideo } from '../icons'

interface Clip {
  id: string
  artifactId: string
  nodeName: string
  url: string
  poster: string | null
  durationSeconds: number
  /** Trim window inside the source clip. */
  inPoint: number
  outPoint: number
  speed: number
  /** Constrained to the ids the compositor knows, since it is sent as-is. */
  transitionAfter: (typeof TRANSITIONS)[number]['id'] | null
}

interface Subtitle {
  id: string
  text: string
  start: number
  end: number
}

/** What POST /api/compose answers with once the render has finished. */
interface ComposeResponse {
  artifact: Artifact
  assetId: string
  subtitleMode: 'burned' | 'muxed' | 'none'
  notes: string[]
}

/** Seconds a freshly created subtitle covers, when the timeline has room. */
const DEFAULT_SUBTITLE_SECONDS = 2

/**
 * Video compositor.
 *
 * The empty timeline is a real state, not an error: opening the editor does not
 * auto-add the current card, and trim/split/speed/export stay disabled until a
 * clip is on the timeline.
 *
 * Both exports run the same server render; they only differ in what they do
 * with the file that comes back. `onExported` lets the surface that opened the
 * editor place the result itself — without it the composite is dropped onto the
 * canvas as a video node here.
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
  const workflow = useEditor((s) => s.document)
  const toast = useEditor((s) => s.toast)
  const commitWith = useEditor((s) => s.commitWith)

  const [clips, setClips] = useState<Clip[]>([])
  const [subtitles, setSubtitles] = useState<Subtitle[]>([])
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
  const [tab, setTab] = useState<'media' | 'transition' | 'subtitle'>('media')

  /** Render lifecycle. Elapsed seconds, not a percentage: the encoder runs in
   * one shot and inventing a progress bar for it would be a lie. */
  const [rendering, setRendering] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [failure, setFailure] = useState<string | null>(null)
  const [notes, setNotes] = useState<string[]>([])
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  // Reopening the editor must not greet the user with the previous run's
  // verdict; the timeline itself is deliberately kept.
  useEffect(() => {
    if (open) {
      setFailure(null)
      setNotes([])
    }
  }, [open])

  const availableVideos = useMemo(() => {
    const list: { artifact: Artifact; nodeName: string }[] = []
    for (const node of workflow.nodes) {
      for (const artifact of node.data.artifacts ?? []) {
        if (artifact.kind === 'video') list.push({ artifact, nodeName: node.name })
      }
    }
    return list
  }, [workflow.nodes])

  const selected = clips.find((c) => c.id === selectedClipId) ?? null
  const totalDuration = clips.reduce((sum, c) => sum + (c.outPoint - c.inPoint) / c.speed, 0)
  const empty = clips.length === 0
  const exportsDisabled = empty || rendering

  const addClip = (artifact: Artifact, nodeName: string) => {
    const duration = artifact.durationSeconds ?? 5
    setClips((prev) => [
      ...prev,
      {
        id: `clip-${artifact.id}-${prev.length}`,
        artifactId: artifact.id,
        nodeName,
        url: artifact.url,
        poster: artifact.thumbnailUrl,
        durationSeconds: duration,
        inPoint: 0,
        outPoint: duration,
        speed: 1,
        transitionAfter: null,
      },
    ])
  }

  const updateSelected = (patch: Partial<Clip>) => {
    if (!selected) return
    setClips((prev) => prev.map((c) => (c.id === selected.id ? { ...c, ...patch } : c)))
  }

  const splitSelected = () => {
    if (!selected) return
    const mid = (selected.inPoint + selected.outPoint) / 2
    setClips((prev) => {
      const index = prev.findIndex((c) => c.id === selected.id)
      if (index === -1) return prev
      const left = { ...selected, outPoint: mid }
      const right = { ...selected, id: `${selected.id}-b`, inPoint: mid }
      return [...prev.slice(0, index), left, right, ...prev.slice(index + 1)]
    })
  }

  const addSubtitle = () => {
    setSubtitles((prev) => {
      // Anchored after the previous line and clipped to the timeline, because
      // the server rejects a subtitle addressing a frame that will not exist.
      const start = Math.min(prev.length > 0 ? prev[prev.length - 1].end : 0, Math.max(0, totalDuration - 0.5))
      const end = Math.min(start + DEFAULT_SUBTITLE_SECONDS, totalDuration)
      if (end - start < 0.1) return prev
      return [...prev, { id: `sub-${prev.length}`, text: '新字幕', start, end }]
    })
  }

  /**
   * Render the timeline server-side. Returns null on failure, having already
   * put the reason on screen — both callers need the same handling.
   */
  const runCompose = async (): Promise<ComposeResponse | null> => {
    if (exportsDisabled) return null
    setRendering(true)
    setFailure(null)
    setNotes([])
    setElapsed(0)

    const startedAt = Date.now()
    const ticker = window.setInterval(() => {
      if (aliveRef.current) setElapsed((Date.now() - startedAt) / 1000)
    }, 250)

    try {
      const result = await api.post<ComposeResponse>('/api/compose', {
        clips: clips.map((c) => ({
          url: c.url,
          inPoint: c.inPoint,
          outPoint: c.outPoint,
          speed: c.speed,
          transitionAfter: c.transitionAfter,
        })),
        subtitles: subtitles.map((s) => ({ text: s.text, start: s.start, end: s.end })),
      })
      if (aliveRef.current) setNotes(result.notes)
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : '合成失败'
      if (aliveRef.current) setFailure(message)
      toast(message, 'error')
      return null
    } finally {
      window.clearInterval(ticker)
      if (aliveRef.current) setRendering(false)
    }
  }

  const exportToLocal = async () => {
    const result = await runCompose()
    if (!result) return
    // Same-origin media route, so the anchor's `download` hint is honoured and
    // the browser saves the file instead of navigating to it.
    const link = window.document.createElement('a')
    link.href = result.artifact.url
    link.download = `合成视频-${result.artifact.id.slice(-6)}.mp4`
    window.document.body.appendChild(link)
    link.click()
    link.remove()
    toast('已导出到本地', 'success')
  }

  const exportToCanvas = async () => {
    const result = await runCompose()
    if (!result) return

    if (onExported) {
      onExported(result.artifact)
    } else {
      const committed = await commitWith((doc) => {
        const node = createNode('video', nextFreeSpot(doc.nodes), doc.nodes, { name: '合成视频' })
        node.data.artifacts = [result.artifact]
        return [{ op: 'addNode', node }]
      }, '导出合成视频到画布')
      // `commitWith` already reported why it failed; closing on top of that
      // would hide the timeline the user still needs.
      if (!committed) return
    }

    toast('已导出到画布，创建了视频合成节点', 'success')
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} variant="panel" width={1040} hideHeader testId="clip-editor">
      <div className="flex items-center justify-between border-b border-ink-100 px-6 py-3.5">
        <h2 className="text-[15px] font-semibold text-ink-900">视频合成</h2>
        <div className="flex items-center gap-2">
          {rendering ? (
            <span
              data-testid="compose-progress"
              className="flex items-center gap-1.5 text-[12px] text-ink-500"
            >
              <Spinner size={13} /> 正在合成 {elapsed.toFixed(0)}s
            </span>
          ) : (
            <span className="text-[12px] text-ink-400">总时长 {totalDuration.toFixed(1)}s</span>
          )}
          <button
            type="button"
            disabled={exportsDisabled}
            data-testid="export-to-local"
            onClick={() => void exportToLocal()}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] transition-colors',
              exportsDisabled
                ? 'cursor-not-allowed bg-ink-100 text-ink-300'
                : 'bg-ink-100 text-ink-700 hover:bg-ink-200',
            )}
          >
            <IconDownload size={13} /> 导出到本地
          </button>
          <button
            type="button"
            disabled={exportsDisabled}
            data-testid="export-to-canvas"
            onClick={() => void exportToCanvas()}
            className={cn(
              'rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors',
              exportsDisabled
                ? 'cursor-not-allowed bg-ink-100 text-ink-300'
                : 'bg-ink-900 text-white hover:opacity-85',
            )}
          >
            导出到画布
          </button>
        </div>
      </div>

      {failure && (
        <div
          data-testid="compose-error"
          className="border-b border-ink-100 bg-danger/8 px-6 py-2 text-[12px] text-danger"
        >
          {failure}
        </div>
      )}
      {notes.length > 0 && (
        <div
          data-testid="compose-notes"
          className="border-b border-ink-100 bg-ink-50 px-6 py-2 text-[12px] text-ink-500"
        >
          {notes.join('；')}
        </div>
      )}

      <div className="flex h-[460px]">
        {/* Source library */}
        <div className="thin-scrollbar w-56 shrink-0 overflow-y-auto border-r border-ink-100 p-3">
          <div className="mb-2 text-[12px] font-medium text-ink-500">可用素材</div>
          {availableVideos.length === 0 ? (
            <EmptyState compact title="暂无已生成视频" description="先在画布上生成视频再进行合成。" />
          ) : (
            <div className="space-y-2">
              {availableVideos.map(({ artifact, nodeName }) => (
                <button
                  key={artifact.id}
                  type="button"
                  onClick={() => addClip(artifact, nodeName)}
                  className="group flex w-full items-center gap-2 rounded-lg p-1.5 text-left transition-colors hover:bg-ink-50"
                >
                  <span className="h-10 w-16 shrink-0 overflow-hidden rounded-md bg-ink-100">
                    {artifact.thumbnailUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={artifact.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] text-ink-700">{nodeName}</span>
                    <span className="block text-[10px] text-ink-400">{artifact.durationSeconds}s</span>
                  </span>
                  <IconPlus size={13} className="shrink-0 text-ink-300 group-hover:text-ink-600" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Preview + timeline */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-1 items-center justify-center bg-ink-900/95 p-4">
            {selected ? (
              <video
                key={selected.id}
                src={selected.url}
                poster={selected.poster ?? undefined}
                controls
                className="max-h-full max-w-full rounded-lg"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-ink-400">
                <IconVideo size={32} />
                <span className="text-[12px]">{empty ? '时间线为空' : '选择一个片段以预览'}</span>
              </div>
            )}
          </div>

          <div className="border-t border-ink-100 p-3">
            <div className="mb-2 flex items-center gap-1">
              <button
                type="button"
                disabled={!selected}
                data-testid="clip-split"
                onClick={splitSelected}
                className={cn(
                  'flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] transition-colors',
                  selected ? 'bg-ink-100 text-ink-700 hover:bg-ink-200' : 'cursor-not-allowed text-ink-300',
                )}
              >
                <IconCut size={13} /> 分割
              </button>
              <button
                type="button"
                disabled={!selected}
                onClick={() => selected && updateSelected({ speed: selected.speed === 1 ? 2 : 1 })}
                className={cn(
                  'rounded-lg px-2.5 py-1.5 text-[12px] transition-colors',
                  selected ? 'bg-ink-100 text-ink-700 hover:bg-ink-200' : 'cursor-not-allowed text-ink-300',
                )}
              >
                变速 {selected ? `${selected.speed}×` : ''}
              </button>
              <button
                type="button"
                disabled={!selected}
                onClick={() => {
                  if (!selected) return
                  setClips((prev) => prev.filter((c) => c.id !== selected.id))
                  setSelectedClipId(null)
                }}
                className={cn(
                  'rounded-lg px-2.5 py-1.5 text-[12px] transition-colors',
                  selected ? 'text-danger hover:bg-danger/8' : 'cursor-not-allowed text-ink-300',
                )}
              >
                <IconTrash size={13} />
              </button>
            </div>

            {/* Video track */}
            <div className="mb-2 flex h-14 items-center gap-1 rounded-lg bg-ink-50 p-1.5">
              {empty ? (
                <span className="w-full text-center text-[11px] text-ink-400">
                  从左侧添加素材以开始合成
                </span>
              ) : (
                clips.map((clip) => (
                  <button
                    key={clip.id}
                    type="button"
                    data-testid={`timeline-clip-${clip.id}`}
                    onClick={() => setSelectedClipId(clip.id)}
                    className={cn(
                      'h-full shrink-0 overflow-hidden rounded-md ring-2 transition-all',
                      clip.id === selectedClipId ? 'ring-accent' : 'ring-transparent',
                    )}
                    style={{ width: Math.max(48, ((clip.outPoint - clip.inPoint) / clip.speed) * 16) }}
                  >
                    {clip.poster ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={clip.poster} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center bg-ink-200" />
                    )}
                  </button>
                ))
              )}
            </div>

            {/* Subtitle track */}
            <div className="flex h-8 items-center gap-1 rounded-lg bg-ink-50 px-1.5">
              <IconText size={12} className="shrink-0 text-ink-400" />
              {subtitles.length === 0 ? (
                <span className="text-[11px] text-ink-400">字幕轨道为空</span>
              ) : (
                subtitles.map((s) => (
                  <span key={s.id} className="rounded bg-ink-200 px-2 py-0.5 text-[10px] text-ink-600">
                    {s.text}
                    {/* Timing is now load-bearing, so it is on screen. */}
                    <span className="ml-1 text-ink-400">
                      {s.start.toFixed(1)}–{s.end.toFixed(1)}s
                    </span>
                  </span>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Inspector */}
        <div className="w-56 shrink-0 border-l border-ink-100 p-3">
          <div className="mb-2 flex gap-1">
            {(['media', 'transition', 'subtitle'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  'flex-1 rounded-md py-1 text-[11px] transition-colors',
                  tab === t ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600',
                )}
              >
                {{ media: '属性', transition: '转场', subtitle: '字幕' }[t]}
              </button>
            ))}
          </div>

          {tab === 'media' &&
            (selected ? (
              <div className="space-y-3 text-[12px]">
                <div>
                  <div className="mb-1 text-ink-500">来源</div>
                  <div className="truncate text-ink-700">{selected.nodeName}</div>
                </div>
                <div>
                  <div className="mb-1 text-ink-500">裁切</div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={selected.outPoint}
                      step={0.1}
                      value={selected.inPoint}
                      onChange={(e) => updateSelected({ inPoint: Number(e.target.value) })}
                      className="w-full rounded-md border border-ink-200 px-1.5 py-1 outline-none"
                    />
                    <span className="text-ink-400">→</span>
                    <input
                      type="number"
                      min={selected.inPoint}
                      max={selected.durationSeconds}
                      step={0.1}
                      value={selected.outPoint}
                      onChange={(e) => updateSelected({ outPoint: Number(e.target.value) })}
                      className="w-full rounded-md border border-ink-200 px-1.5 py-1 outline-none"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-ink-400">未选择片段时属性不可编辑。</p>
            ))}

          {tab === 'transition' && (
            <div className="space-y-1.5">
              {TRANSITIONS.map((transition) => (
                <button
                  key={transition.id}
                  type="button"
                  disabled={!selected}
                  onClick={() => updateSelected({ transitionAfter: transition.id })}
                  className={cn(
                    'w-full rounded-lg px-2.5 py-2 text-left text-[12px] transition-colors',
                    !selected
                      ? 'cursor-not-allowed text-ink-300'
                      : selected.transitionAfter === transition.id
                        ? 'bg-accent-soft text-accent-ink'
                        : 'bg-ink-50 text-ink-700 hover:bg-ink-100',
                  )}
                >
                  {transition.label}
                </button>
              ))}
            </div>
          )}

          {tab === 'subtitle' && (
            <div className="space-y-2">
              <button
                type="button"
                disabled={empty}
                data-testid="add-subtitle"
                onClick={addSubtitle}
                className={cn(
                  'w-full rounded-lg border border-dashed py-2 text-[12px] transition-colors',
                  empty
                    ? 'cursor-not-allowed border-ink-100 text-ink-300'
                    : 'border-ink-200 text-ink-500 hover:border-ink-300',
                )}
              >
                新建字幕
              </button>
              {empty && <p className="text-[11px] text-ink-400">先添加片段，字幕才有可依附的时间线。</p>}
              {subtitles.map((subtitle, index) => (
                <input
                  key={subtitle.id}
                  value={subtitle.text}
                  onChange={(e) => {
                    const next = subtitles.slice()
                    next[index] = { ...subtitle, text: e.target.value }
                    setSubtitles(next)
                  }}
                  className="w-full rounded-md border border-ink-200 px-2 py-1.5 text-[12px] outline-none focus:border-accent"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  )
}
