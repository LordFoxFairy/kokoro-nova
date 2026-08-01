'use client'

import { useEffect, useRef, useState } from 'react'
import type { Asset, AssetNamespace } from '@/domain/types'
import { cn } from '@/lib/cn'
import { Dialog } from '../ui/Dialog'
import { ProgressBar, Spinner } from '../ui/controls'
import { IconCheck, IconClose, IconUpload, IconWarning } from '../icons'

/*
 * Presentational mirror of the server gate in src/server/assets.ts. A client
 * component cannot import that module (it reaches for node:fs), and the server
 * re-checks every byte anyway — these values only shape the picker filter and
 * the hint, they never decide anything.
 */
const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml,video/mp4,video/webm,audio/wav,audio/mpeg'
const MAX_FILES = 50
const MAX_MEGABYTES = 50

/** Uploads run one request per file so progress and cancel are per file; a few
 * at a time keeps the bar moving without queueing the whole batch on one socket. */
const CONCURRENCY = 3

type UploadPhase = 'queued' | 'uploading' | 'validating' | 'done' | 'error' | 'cancelled'

interface UploadItem {
  id: string
  name: string
  byteSize: number
  phase: UploadPhase
  /** 0..1, from the request body actually flushed to the socket. */
  progress: number
  error: string | null
  /**
   * Names this upload to the server before the server can name it back.
   * Aborting the request only stops this tab from listening — the handler on
   * the other end carries on staging and committing — so cancelling has to
   * address the rows explicitly, and until the response lands this token is the
   * only handle that exists. Minted per item, never reused.
   */
  token: string
}

interface UploadResponse {
  assets?: Asset[]
  rejected?: { name: string; reason: string }[]
  error?: string
}

type Outcome =
  | { status: 'done'; asset: Asset }
  | { status: 'rejected'; reason: string }
  | { status: 'cancelled' }

export interface UploadDropzoneProps {
  open: boolean
  onClose: () => void
  /** Uploads land where the user is looking, so the result is visible at once. */
  namespace: AssetNamespace
  folderId: string | null
  /** Fired per committed asset, as soon as its own request finishes. */
  onUploaded: (asset: Asset) => void
  /** Observes the raw picked batch, before any gate has run. */
  onPicked?: (files: File[]) => void
}

/**
 * 上传资产 — drop or pick local files and watch them land.
 *
 * Transport is XMLHttpRequest rather than fetch: fetch has no upload progress
 * event, and a 50MB file with no feedback reads as a frozen dialog.
 */
export function UploadDropzone({
  open,
  onClose,
  namespace,
  folderId,
  onUploaded,
  onPicked,
}: UploadDropzoneProps) {
  const [items, setItems] = useState<UploadItem[]>([])
  const [dragging, setDragging] = useState(false)

  const fileInput = useRef<HTMLInputElement>(null)
  const requests = useRef(new Map<string, XMLHttpRequest>())
  const cancelled = useRef(new Set<string>())
  const seq = useRef(0)
  // The unload listener is registered once and cannot see a render's closure.
  const latest = useRef<UploadItem[]>([])

  const active = items.some((item) => item.phase === 'queued' || item.phase === 'uploading' || item.phase === 'validating')

  // Reopening starts from a clean sheet, but only once nothing is in flight —
  // closing the dialog does not abort an upload, it just stops watching it.
  useEffect(() => {
    if (!open) return
    setItems((prev) =>
      prev.some((item) => item.phase === 'queued' || item.phase === 'uploading' || item.phase === 'validating')
        ? prev
        : [],
    )
  }, [open])

  useEffect(() => {
    latest.current = items
  }, [items])

  /*
   * On the way out, flush revocations the user already asked for — their own
   * request may not have left the tab yet.
   *
   * Only those. An upload sitting in 校验中 has transferred every byte and the
   * user never cancelled it; letting the server finish is the outcome they
   * wanted. Revoking it here would also make the result depend on how the tab
   * happened to leave: a soft in-app navigation raises no `pagehide`, so the
   * same upload would survive a link click but die on a refresh.
   */
  useEffect(() => {
    const onHide = () => {
      for (const item of latest.current) {
        if (item.phase !== 'uploading' && item.phase !== 'validating') continue
        if (cancelled.current.has(item.id)) revoke(item.token, true)
      }
    }
    window.addEventListener('pagehide', onHide)
    return () => window.removeEventListener('pagehide', onHide)
  }, [])

  const patch = (id: string, next: Partial<UploadItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...next } : item)))
  }

  const start = (picked: File[]) => {
    if (picked.length === 0) return
    onPicked?.(picked)

    const accepted = picked.slice(0, MAX_FILES)
    const overflow = picked.slice(MAX_FILES)

    const queued: { item: UploadItem; file: File }[] = accepted.map((file) => {
      seq.current += 1
      return {
        file,
        item: {
          id: `up_${seq.current}`,
          name: file.name,
          byteSize: file.size,
          phase: 'queued',
          progress: 0,
          error: null,
          token: mintToken(),
        },
      }
    })

    // The batch cap is the server's, but reporting it here beats sending files
    // that are guaranteed to come back rejected.
    const dropped: UploadItem[] = overflow.map((file) => {
      seq.current += 1
      return {
        id: `up_${seq.current}`,
        name: file.name,
        byteSize: file.size,
        phase: 'error',
        progress: 0,
        error: `一次最多上传 ${MAX_FILES} 个文件`,
        token: mintToken(),
      }
    })

    setItems((prev) => [...prev, ...queued.map((entry) => entry.item), ...dropped])
    void run(queued)
  }

  const run = async (queue: { item: UploadItem; file: File }[]) => {
    const pending = [...queue]
    const target = { namespace, folderId }

    const worker = async () => {
      for (let next = pending.shift(); next; next = pending.shift()) {
        const { item, file } = next
        if (cancelled.current.has(item.id)) {
          patch(item.id, { phase: 'cancelled' })
          continue
        }
        patch(item.id, { phase: 'uploading' })

        const outcome = await send(
          file,
          item.token,
          target,
          (ratio) => {
            // The last percent belongs to the server: bytes are on the wire but
            // nothing has validated them yet.
            patch(item.id, { progress: ratio, phase: ratio >= 1 ? 'validating' : 'uploading' })
          },
          (xhr) => requests.current.set(item.id, xhr),
        )
        requests.current.delete(item.id)

        if (outcome.status === 'cancelled') {
          patch(item.id, { phase: 'cancelled' })
          continue
        }
        if (outcome.status === 'rejected') {
          patch(item.id, { phase: 'error', error: outcome.reason })
          continue
        }
        patch(item.id, { phase: 'done', progress: 1, name: outcome.asset.name })
        onUploaded(outcome.asset)
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker))
  }

  const cancel = (item: UploadItem) => {
    cancelled.current.add(item.id)
    const xhr = requests.current.get(item.id)
    if (!xhr) {
      // Still queued: nothing reached the server, so the worker skipping it is
      // the entire cancellation.
      patch(item.id, { phase: 'cancelled' })
      return
    }
    // Both halves are needed and their order does not matter. `abort` only
    // stops this tab from listening; the revoke is what undoes — or forbids —
    // the commit the server may already be running.
    revoke(item.token)
    xhr.abort()
  }

  const cancelAll = () => {
    for (const item of items) {
      if (item.phase === 'queued' || item.phase === 'uploading' || item.phase === 'validating') cancel(item)
    }
  }

  const done = items.filter((item) => item.phase === 'done').length

  return (
    <Dialog open={open} onClose={onClose} title="上传资产" width={460} testId="upload-dropzone">
      <div
        data-testid="upload-drop-target"
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          start(Array.from(event.dataTransfer.files))
        }}
        className={cn(
          'flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-8 text-center transition-colors',
          dragging ? 'border-accent bg-accent-soft/50' : 'border-ink-200 bg-ink-50',
        )}
      >
        <span className={dragging ? 'text-accent' : 'text-ink-300'}>
          <IconUpload size={26} />
        </span>
        <div className="text-[13px] text-ink-600">拖放文件到这里</div>
        <button
          type="button"
          data-testid="upload-browse"
          onClick={() => fileInput.current?.click()}
          className="rounded-lg bg-ink-900 px-3.5 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-85"
        >
          选择文件
        </button>
        <div className="text-[11px] leading-relaxed text-ink-400">
          支持图片、视频、音频，一次最多 {MAX_FILES} 个，单个不超过 {MAX_MEGABYTES}MB
        </div>
      </div>

      {items.length > 0 && (
        <div className="thin-scrollbar mt-3 max-h-[240px] space-y-1.5 overflow-y-auto" data-testid="upload-list">
          {items.map((item) => (
            <UploadRow key={item.id} item={item} onCancel={() => cancel(item)} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-4">
        <div className="flex min-w-0 items-center gap-2 text-[12px] text-ink-400" data-testid="upload-summary">
          {active && <Spinner size={13} />}
          {items.length > 0 && <span className="tabular-nums">已完成 {done} / {items.length}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {active && (
            <button
              type="button"
              data-testid="upload-cancel-all"
              onClick={cancelAll}
              className="rounded-lg px-3 py-2 text-[13px] font-medium text-ink-600 transition-colors hover:bg-ink-50"
            >
              取消上传
            </button>
          )}
          <button
            type="button"
            data-testid="upload-close"
            onClick={onClose}
            className="rounded-lg bg-ink-900 px-3.5 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-85"
          >
            完成
          </button>
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        accept={ACCEPT}
        data-testid="asset-upload-input"
        onChange={(event) => {
          const picked = Array.from(event.target.files ?? [])
          // Reset so picking the same file twice still fires a change event.
          event.target.value = ''
          start(picked)
        }}
      />
    </Dialog>
  )
}

function UploadRow({ item, onCancel }: { item: UploadItem; onCancel: () => void }) {
  const busy = item.phase === 'queued' || item.phase === 'uploading' || item.phase === 'validating'

  return (
    <div
      data-testid="upload-row"
      className="rounded-lg border border-ink-100 px-2.5 py-2"
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[12px] text-ink-700" title={item.name}>
          {item.name}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-ink-400">{formatBytes(item.byteSize)}</span>
        {item.phase === 'done' && (
          <span className="shrink-0 text-success">
            <IconCheck size={14} />
          </span>
        )}
        {item.phase === 'error' && (
          <span className="shrink-0 text-danger">
            <IconWarning size={14} />
          </span>
        )}
        {busy && (
          <button
            type="button"
            aria-label={`取消上传 ${item.name}`}
            data-testid="upload-cancel"
            onClick={onCancel}
            className="shrink-0 rounded-md p-0.5 text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-700"
          >
            <IconClose size={13} />
          </button>
        )}
      </div>

      {busy && (
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex-1">
            <ProgressBar value={item.progress * 100} />
          </div>
          <span className="w-[52px] shrink-0 text-right text-[11px] tabular-nums text-ink-400">
            {item.phase === 'validating' ? '校验中' : `${Math.round(item.progress * 100)}%`}
          </span>
        </div>
      )}

      {item.phase === 'error' && item.error && (
        <div className="mt-1 text-[11px] text-danger" data-testid="upload-error">
          {item.error}
        </div>
      )}
      {item.phase === 'cancelled' && <div className="mt-1 text-[11px] text-ink-400">已取消</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Transport
 * ------------------------------------------------------------------ */

/**
 * 128 opaque bits. The token is a capability over exactly the rows one request
 * created, so it has to be unguessable — anything derived from a counter or the
 * clock would let one client revoke another's upload.
 */
function mintToken(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Tells the server to undo whatever it did under this token. Fire and forget:
 * the row is already reported as 已取消, and the only failure mode left — an
 * asset that survives — is recoverable from the library's own delete.
 */
function revoke(token: string, unloading = false) {
  void fetch(`/api/assets/upload?token=${encodeURIComponent(token)}`, {
    method: 'DELETE',
    // Lets the request outlive the document; pointless overhead otherwise.
    keepalive: unloading,
  }).catch(() => undefined)
}

function send(
  file: File,
  token: string,
  target: { namespace: AssetNamespace; folderId: string | null },
  onProgress: (ratio: number) => void,
  register: (xhr: XMLHttpRequest) => void,
): Promise<Outcome> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    register(xhr)
    xhr.open('POST', '/api/assets/upload')

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total)
    })
    xhr.addEventListener('abort', () => resolve({ status: 'cancelled' }))
    xhr.addEventListener('error', () => resolve({ status: 'rejected', reason: '网络中断，请重试' }))
    xhr.addEventListener('timeout', () => resolve({ status: 'rejected', reason: '上传超时，请重试' }))
    xhr.addEventListener('load', () => {
      const body = parse(xhr.responseText)
      if (xhr.status < 200 || xhr.status >= 300) {
        resolve({ status: 'rejected', reason: body?.error ?? `上传失败 (${xhr.status})` })
        return
      }
      const asset = body?.assets?.[0]
      if (asset) {
        resolve({ status: 'done', asset })
        return
      }
      // A 200 with no asset means the file was staged and then thrown out by the
      // content gate; the per-file reason travels in `rejected`.
      resolve({ status: 'rejected', reason: body?.rejected?.[0]?.reason ?? '文件未通过校验' })
    })

    const form = new FormData()
    form.append('files', file)
    form.append('namespace', target.namespace)
    form.append('uploadToken', token)
    if (target.folderId) form.append('folderId', target.folderId)
    xhr.send(form)
  })
}

function parse(text: string): UploadResponse | null {
  try {
    return text ? (JSON.parse(text) as UploadResponse) : null
  } catch {
    return null
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
