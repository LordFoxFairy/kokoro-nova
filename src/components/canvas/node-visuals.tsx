'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import type { NodeType } from '@/domain/nodes'
import {
  IconAssetLibrary,
  IconAudio,
  IconComposite,
  IconDirector,
  IconEffect,
  IconImage,
  IconScript,
  IconStyle,
  IconText,
  IconVideo,
} from '../icons'

export const NODE_ICON: Record<NodeType, (props: { size?: number; className?: string }) => ReactNode> = {
  text: IconText,
  image: IconImage,
  video: IconVideo,
  videoComposite: IconComposite,
  director: IconDirector,
  audio: IconAudio,
  script: IconScript,
  scriptLegacy: IconScript,
  style: IconStyle,
  effect: IconEffect,
  assetLibrary: IconAssetLibrary,
}

/** Placeholder shown while a media node has no artifact yet. */
export function MediaPlaceholder({
  kind,
  label = '待确认后生成',
}: {
  kind: 'image' | 'video' | 'audio'
  label?: string
}) {
  const Icon = kind === 'image' ? IconImage : kind === 'video' ? IconVideo : IconAudio
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl bg-ink-100 text-ink-300">
      <Icon size={30} />
      <span className="text-[11px] text-ink-400">{label}</span>
    </div>
  )
}

/**
 * Artifact preview. Video artifacts render a real <video> element so playback,
 * scrubbing and duration all come from the browser rather than a fake overlay.
 */
export function ArtifactPreview({
  url,
  kind,
  poster,
  alt,
  controls,
  className,
}: {
  url: string
  kind: 'image' | 'video' | 'audio' | 'text'
  poster?: string | null
  alt: string
  controls?: boolean
  className?: string
}) {
  if (kind === 'video') {
    // A mock run without an encoder falls back to a still; render it as an image.
    if (url.endsWith('.svg')) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={url} alt={alt} className={className ?? 'h-full w-full rounded-xl object-cover'} />
    }
    return (
      <video
        src={url}
        poster={poster ?? undefined}
        controls={controls}
        playsInline
        preload="metadata"
        className={className ?? 'h-full w-full rounded-xl object-cover'}
      />
    )
  }

  if (kind === 'audio') {
    return (
      <div className="flex h-full w-full flex-col justify-center gap-2 rounded-xl bg-ink-50 p-3">
        <audio src={url} controls className="w-full" />
      </div>
    )
  }

  if (kind === 'text') {
    return (
      <div className="h-full w-full overflow-auto rounded-xl bg-ink-50 p-3 text-[12px] leading-relaxed text-ink-600">
        <a href={url} target="_blank" rel="noreferrer" className="text-accent-ink underline">
          查看文本产物
        </a>
      </div>
    )
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={className ?? 'h-full w-full rounded-xl object-cover'} />
}

/** Suggestion rows shown inside an empty generator node. */
export function TrySuggestions({ items }: { items: { icon: ReactNode; label: string; onClick: () => void }[] }) {
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const cancel = () => {
      if (pending.current) clearTimeout(pending.current)
      pending.current = null
    }
    window.addEventListener('libtv:cancel-node-suggestion', cancel)
    return () => {
      cancel()
      window.removeEventListener('libtv:cancel-node-suggestion', cancel)
    }
  }, [])

  return (
    <div className="space-y-1.5">
      <div className="text-[11px] text-ink-400">尝试：</div>
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          onClick={() => {
            if (pending.current) clearTimeout(pending.current)
            // A node double click emits two `click` events before `dblclick`.
            // Defer starter activation long enough for the latter to cancel it.
            pending.current = setTimeout(() => {
              pending.current = null
              item.onClick()
            }, 220)
          }}
          onDoubleClick={(event) => {
            event.preventDefault()
            if (pending.current) clearTimeout(pending.current)
            pending.current = null
          }}
          className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-[12px] text-ink-700 transition-colors hover:bg-ink-50"
        >
          <span className="text-ink-500">{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>
  )
}
