'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import type {
  ShowcaseDetailResponse,
  ShowcaseEntryProjection,
  ShowcaseQuality,
} from '@/contracts/showcase'
export type { ShowcaseQuality } from '@/contracts/showcase'
import { client } from '@/lib/api'
import { cn } from '@/lib/cn'
import { Spinner } from '../ui/controls'
import {
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconExpand,
  IconPause,
  IconPlay,
  IconRefresh,
  IconShare,
  IconVolume,
  IconWorkflow,
} from '../icons'
import { PublicCanvasView } from './PublicCanvasView'

export type ShowcaseDetailState = 'loading' | 'refreshing' | 'ready' | 'stale-error' | 'error'

export function getShowcaseDetailState({
  loading,
  hasDetail,
  error,
}: {
  loading: boolean
  hasDetail: boolean
  error: string | null
}): ShowcaseDetailState {
  if (loading) return hasDetail ? 'refreshing' : 'loading'
  if (error) return hasDetail ? 'stale-error' : 'error'
  return hasDetail ? 'ready' : 'error'
}

export function formatShowcaseDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`
}

export function cyclePlaybackRate(rate: number): number {
  if (rate === 1) return 1.5
  if (rate === 1.5) return 2
  return 1
}

const QUALITY_OPTIONS: Array<{ value: ShowcaseQuality; label: string }> = [
  { value: 'auto', label: '自动' },
  { value: '480p', label: '480p 流畅' },
  { value: '720p', label: '720p 高清' },
]

export function ShowcaseDetailView({ snapshotId }: { snapshotId: string }) {
  const [detail, setDetail] = useState<ShowcaseDetailResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reloadToken, setReloadToken] = useState(0)
  const [mode, setMode] = useState<'detail' | 'player'>('detail')
  const [processOpen, setProcessOpen] = useState(false)
  const [likeGateOpen, setLikeGateOpen] = useState(false)
  const [shareLabel, setShareLabel] = useState('分享')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void client.showcase
      .detail(snapshotId)
      .then((next) => {
        if (!cancelled) setDetail(next)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : '作品加载失败，请稍后重试')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [snapshotId, reloadToken])

  const requestState = getShowcaseDetailState({ loading, hasDetail: Boolean(detail), error })

  if (loading && !detail) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#050505] text-white/60" data-testid="showcase-detail" role="status">
        <Spinner size={24} />
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[#050505] px-6 text-center text-white" data-testid="showcase-detail">
        <div className="text-[18px] font-semibold">作品暂时不可用</div>
        <p className="max-w-md text-[13px] text-white/50">{error ?? '这个作品可能已被作者下架，或者链接不再有效。'}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="showcase-detail-retry"
            onClick={() => setReloadToken((token) => token + 1)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-medium text-black disabled:opacity-50"
          >
            <IconRefresh size={14} className={loading ? 'animate-spin' : undefined} /> 重试
          </button>
          <Link href="/showcase" className="rounded-full border border-white/15 px-4 py-2 text-[13px] text-white/70 hover:bg-white/10">
            返回 TV Show
          </Link>
        </div>
      </div>
    )
  }

  if (mode === 'player') {
    return (
      <ShowcasePlayer
        detail={detail}
        onBack={() => setMode('detail')}
        onProcess={() => setProcessOpen(true)}
        processOpen={processOpen}
        onCloseProcess={() => setProcessOpen(false)}
      />
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050505] text-white" data-testid="showcase-detail" aria-busy={loading}>
      <HeroBackdrop entry={detail.entry} />

      <header className="absolute inset-x-0 top-0 z-10 flex items-start justify-between px-8 py-7 sm:px-10">
        <Link
          href="/showcase"
          data-testid="showcase-detail-back"
          className="inline-flex items-center gap-1.5 rounded-xl bg-black/45 px-4 py-2.5 text-[13px] text-white/90 backdrop-blur-md transition-colors hover:bg-black/65 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <IconChevronLeft size={15} /> 返回
        </Link>
        <div className="text-right text-[12px] text-white/62">
          <div>更新时间：{formatDate(detail.entry.publishedAt)}</div>
          {detail.entry.hasAiContent && <div className="mt-1 text-[11px] text-white/45">含 AI 生成内容</div>}
        </div>
      </header>

      <main className="relative z-[1] flex min-h-screen flex-col px-8 pb-8 pt-28 sm:px-10">
        <div className="flex min-h-0 flex-1 flex-col justify-between">
          <div className="max-w-[460px] pt-2">
            <div className="flex items-center gap-3">
              <Avatar entry={detail.entry} />
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[14px] font-medium text-white/90">
                  <span className="truncate">{detail.entry.author}</span>
                  {detail.entry.authorTier && <span className="rounded-full bg-white/12 px-2 py-0.5 text-[10px] text-white/72">{detail.entry.authorTier}</span>}
                </div>
                <div className="mt-1 text-[11px] text-white/42">公开作品 · {detail.entry.viewCount.toLocaleString('zh-CN')} 次浏览</div>
              </div>
            </div>
            <h1 className="mt-7 max-w-[560px] text-[clamp(26px,3.2vw,44px)] font-semibold leading-[1.08] tracking-[-0.03em] text-white">
              {detail.entry.title}
            </h1>
            {detail.entry.summary && <p className="mt-4 max-w-[440px] text-[13px] leading-relaxed text-white/58">{detail.entry.summary}</p>}
          </div>

          <div className="flex flex-col items-center gap-6 pb-5 pt-8">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                data-testid="showcase-watch"
                onClick={() => setMode('player')}
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-[13px] font-medium text-[#111] shadow-[0_8px_32px_rgba(0,0,0,.22)] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <IconPlay size={15} /> 立即观看
              </button>
              <button
                type="button"
                data-testid="showcase-process"
                onClick={() => setProcessOpen(true)}
                className="inline-flex items-center gap-2 rounded-full bg-black/48 px-5 py-3 text-[13px] text-white/90 ring-1 ring-white/12 backdrop-blur-md transition-colors hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <IconWorkflow size={15} /> 查看制作过程
              </button>
              <button
                type="button"
                data-testid="showcase-like"
                aria-label="喜欢作品，需要先登录"
                onClick={() => setLikeGateOpen(true)}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-black/48 text-[21px] text-white/90 ring-1 ring-white/12 backdrop-blur-md transition-colors hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                ♡
              </button>
              <button
                type="button"
                data-testid="showcase-share"
                aria-label="分享作品"
                onClick={() => {
                  void navigator.clipboard?.writeText(window.location.href).catch(() => undefined)
                  setShareLabel('已复制链接')
                  window.setTimeout(() => setShareLabel('分享'), 1800)
                }}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-black/48 text-white/90 ring-1 ring-white/12 backdrop-blur-md transition-colors hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <IconShare size={16} />
                <span className="sr-only">{shareLabel}</span>
              </button>
            </div>
            <div className="text-[11px] text-white/42">{detail.entry.likeCount.toLocaleString('zh-CN')} 人喜欢 · {detail.entry.category}</div>
          </div>
        </div>

        <RelatedRail entries={detail.related} currentId={detail.entry.id} />
      </main>

      {error && requestState === 'stale-error' && (
        <div className="absolute left-1/2 top-5 z-20 -translate-x-1/2 rounded-full bg-[#261b1b]/90 px-4 py-2 text-[11px] text-[#ffb6b6] ring-1 ring-[#ffb6b6]/20" role="alert">
          刷新失败，仍显示已发布作品
        </div>
      )}

      {processOpen && (
        <div className="fixed inset-0 z-50 bg-[#141414]" data-testid="showcase-process-overlay">
          <PublicCanvasView snapshotId={snapshotId} onClose={() => setProcessOpen(false)} />
        </div>
      )}

      <LoginGate open={likeGateOpen} onClose={() => setLikeGateOpen(false)} />
    </div>
  )
}

function HeroBackdrop({ entry }: { entry: ShowcaseEntryProjection }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" data-testid="showcase-detail-hero">
      {entry.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={entry.coverUrl} alt="" className="h-full w-full scale-[1.035] object-cover opacity-72" />
      ) : (
        <div className="h-full w-full bg-[radial-gradient(circle_at_72%_40%,#3d274f,#111_54%,#050505)]" />
      )}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,.82)_0%,rgba(0,0,0,.42)_38%,rgba(0,0,0,.18)_68%,rgba(0,0,0,.58)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(0,0,0,.96)_0%,rgba(0,0,0,.26)_31%,rgba(0,0,0,.3)_100%)]" />
      <div className="absolute inset-0 bg-black/10 backdrop-blur-[1.5px]" />
    </div>
  )
}

function Avatar({ entry }: { entry: ShowcaseEntryProjection }) {
  return entry.authorAvatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={entry.authorAvatarUrl} alt="" className="h-9 w-9 rounded-full object-cover ring-1 ring-white/30" />
  ) : (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#c8c8c8,#413f43)] text-[13px] font-semibold text-white ring-1 ring-white/30">
      {entry.author.slice(0, 1)}
    </span>
  )
}

function RelatedRail({ entries, currentId }: { entries: ShowcaseEntryProjection[]; currentId: string }) {
  const visible = entries.slice(0, 6)
  return (
    <section className="relative mx-auto w-full max-w-[1160px]" data-testid="showcase-related" aria-label="更多公开作品">
      <div className="mb-2 flex items-center justify-between px-1 text-[10px] uppercase tracking-[0.18em] text-white/32">
        <span>更多作品</span>
        <span>{visible.length} / {entries.length}</span>
      </div>
      <div className="flex items-stretch gap-3 overflow-hidden">
        {visible.map((entry) => (
          <div
            key={entry.id}
            data-testid={`showcase-related-card-${entry.id}`}
            className={cn(
              'group relative min-w-0 flex-1 overflow-hidden rounded-xl bg-black/50 ring-1 ring-white/10',
              entry.id === currentId ? 'ring-2 ring-white/90' : 'opacity-75 transition-opacity hover:opacity-100',
            )}
          >
            {entry.id === currentId ? (
              <div className="aspect-[16/7] overflow-hidden">
                <RelatedCardContent entry={entry} />
              </div>
            ) : (
              <Link href={`/showcase/${entry.snapshotId}`} aria-label={`打开 ${entry.title}`} className="block aspect-[16/7] overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                <RelatedCardContent entry={entry} />
              </Link>
            )}
            {entry.id === currentId && <span className="absolute right-2 top-2 rounded-full bg-white px-1.5 py-0.5 text-[9px] font-medium text-black">正在查看</span>}
          </div>
        ))}
      </div>
      <button type="button" aria-label="上一组作品" className="absolute -left-8 bottom-7 hidden text-white/70 hover:text-white sm:block"><IconChevronLeft size={17} /></button>
      <button type="button" aria-label="下一组作品" className="absolute -right-8 bottom-7 hidden text-white/70 hover:text-white sm:block"><IconChevronRight size={17} /></button>
    </section>
  )
}

function RelatedCardContent({ entry }: { entry: ShowcaseEntryProjection }) {
  return (
    <div className="relative h-full w-full">
              {entry.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={entry.coverUrl} alt={entry.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              ) : (
                <div className="h-full w-full bg-white/10" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
              <div className="absolute inset-x-2 bottom-2 truncate text-[10px] text-white/88">{entry.title}</div>
    </div>
  )
}

function ShowcasePlayer({
  detail,
  onBack,
  onProcess,
  processOpen,
  onCloseProcess,
}: {
  detail: ShowcaseDetailResponse
  onBack: () => void
  onProcess: () => void
  processOpen: boolean
  onCloseProcess: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const playerRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(detail.entry.media.durationSeconds)
  const [rate, setRate] = useState(1)
  const [quality, setQuality] = useState<ShowcaseQuality>('auto')
  const [qualityOpen, setQualityOpen] = useState(false)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !detail.entry.media.url) return
    void video.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    return () => video.pause()
  }, [detail.entry.id, detail.entry.media.url])

  const qualityLabel = useMemo(() => {
    if (quality === 'auto') return '自动'
    if (quality === 'original') return detail.entry.media.originalQualityLabel
    return quality === '480p' ? '480p 流畅' : '720p 高清'
  }, [detail.entry.media.originalQualityLabel, quality])

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      void video.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    } else {
      video.pause()
      setPlaying(false)
    }
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.()
    } else {
      void playerRef.current?.requestFullscreen?.()
    }
  }

  const setPlayerVolume = (nextVolume: number) => {
    const next = Math.min(1, Math.max(0, nextVolume))
    setVolume(next)
    setMuted(next === 0)
    if (videoRef.current) {
      videoRef.current.volume = next
      videoRef.current.muted = next === 0
    }
  }

  return (
    <div ref={playerRef} className="relative flex h-screen flex-col bg-black text-white" data-testid="showcase-player">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between bg-gradient-to-b from-black/65 to-transparent px-8 pb-16 pt-7 sm:px-10">
        <button
          type="button"
          data-testid="showcase-player-back"
          onClick={onBack}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2.5 text-[13px] text-white/90 backdrop-blur-md transition-colors hover:bg-white/18 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <IconChevronLeft size={15} /> 返回
        </button>
        <button
          type="button"
          data-testid="showcase-player-process"
          onClick={onProcess}
          className="pointer-events-auto rounded-full bg-white/10 px-4 py-2.5 text-[13px] text-white/90 backdrop-blur-md transition-colors hover:bg-white/18 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          查看制作过程 →
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-5 py-20 sm:px-12">
        {detail.entry.media.url ? (
          <video
            ref={videoRef}
            data-testid="showcase-player-video"
            src={detail.entry.media.url}
            poster={detail.entry.media.posterUrl ?? undefined}
            playsInline
            loop
            preload="metadata"
            aria-label={detail.entry.title}
            className="max-h-full max-w-full object-contain"
            onClick={togglePlay}
            onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || detail.entry.media.durationSeconds)}
            onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
          />
        ) : detail.entry.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={detail.entry.coverUrl} alt={detail.entry.title} className="max-h-full max-w-full object-contain" />
        ) : (
          <div className="text-[13px] text-white/48">媒体暂时不可用</div>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black via-black/88 to-transparent px-5 pb-5 pt-24 sm:px-8">
        <input
          type="range"
          min={0}
          max={Math.max(duration, 0.01)}
          step={0.01}
          value={Math.min(currentTime, duration)}
          data-testid="showcase-player-progress"
          aria-label="播放进度"
          onChange={(event) => {
            const next = Number(event.target.value)
            setCurrentTime(next)
            if (videoRef.current) videoRef.current.currentTime = next
          }}
          className="showcase-range h-1 w-full cursor-pointer accent-white"
        />
        <div className="mt-3 flex items-center gap-4 text-[12px] text-white/82">
          <button type="button" data-testid="showcase-player-toggle" aria-label={playing ? '暂停' : '播放'} onClick={togglePlay} className="rounded-md p-1 text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            {playing ? <IconPause size={16} /> : <IconPlay size={16} />}
          </button>
          <span className="tabular-nums">{formatShowcaseDuration(currentTime)} / {formatShowcaseDuration(duration)}</span>
          <span className="ml-auto" />
          <button
            type="button"
            data-testid="showcase-player-speed"
            aria-label="播放速度"
            onClick={() => {
              const next = cyclePlaybackRate(rate)
              setRate(next)
              if (videoRef.current) videoRef.current.playbackRate = next
            }}
            className="rounded-md px-2 py-1 tabular-nums hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {rate}x
          </button>
          <div className="relative">
            <button
              type="button"
              data-testid="showcase-player-quality"
              aria-expanded={qualityOpen}
              onClick={() => setQualityOpen((open) => !open)}
              className="rounded-md px-2 py-1 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {qualityLabel}
            </button>
            {qualityOpen && (
              <div className="absolute bottom-9 right-0 w-36 rounded-xl bg-[#1b1b1b]/95 p-1.5 text-[12px] shadow-2xl ring-1 ring-white/12" data-testid="showcase-player-quality-menu">
                {[...QUALITY_OPTIONS, { value: 'original' as const, label: detail.entry.media.originalQualityLabel }].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    data-testid={`showcase-quality-${option.value}`}
                    onClick={() => {
                      setQuality(option.value)
                      setQualityOpen(false)
                    }}
                    className={cn('flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left hover:bg-white/10', option.value === quality ? 'text-white' : 'text-white/58')}
                  >
                    {option.label}
                    {option.value === quality && <span>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            data-testid="showcase-player-volume"
            aria-label={muted ? '打开声音' : '静音'}
            onClick={() => {
              const nextMuted = !muted
              setMuted(nextMuted)
              if (videoRef.current) videoRef.current.muted = nextMuted
            }}
            className="rounded-md p-1 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <IconVolume size={17} />
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            aria-label="音量"
            onChange={(event) => setPlayerVolume(Number(event.target.value))}
            className="showcase-range hidden w-20 accent-white sm:block"
          />
          <button type="button" data-testid="showcase-player-fullscreen" aria-label="全屏" onClick={toggleFullscreen} className="rounded-md p-1 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            <IconExpand size={17} />
          </button>
        </div>
      </div>

      {processOpen && (
        <div className="fixed inset-0 z-50 bg-[#141414]" data-testid="showcase-process-overlay">
          <PublicCanvasView snapshotId={detail.entry.snapshotId} onClose={onCloseProcess} />
        </div>
      )}
    </div>
  )
}

function LoginGate({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-labelledby="showcase-login-title" data-testid="showcase-like-gate">
      <button type="button" aria-label="关闭登录弹层" onClick={onClose} className="absolute inset-0 bg-black/72 backdrop-blur-sm" />
      <div className="relative w-full max-w-[380px] rounded-2xl bg-[#1d1d1f] p-6 text-white shadow-2xl ring-1 ring-white/10">
        <button type="button" aria-label="关闭" onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1 text-white/45 hover:bg-white/10 hover:text-white"><IconClose size={16} /></button>
        <h2 id="showcase-login-title" className="text-[17px] font-semibold">登录后才能喜欢作品</h2>
        <p className="mt-3 text-[13px] leading-relaxed text-white/55">登录后可以收藏喜欢的作品，也能在自己的空间里继续创作。</p>
        <button type="button" onClick={onClose} className="mt-6 w-full rounded-xl bg-white px-4 py-2.5 text-[13px] font-medium text-black hover:bg-white/90">登录 / 注册</button>
      </div>
    </div>
  )
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
