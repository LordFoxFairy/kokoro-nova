'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useReactFlow, useStore, useStoreApi } from '@xyflow/react'
import { cn } from '@/lib/cn'
import {
  connectPresence,
  disconnectPresence,
  loadPresenceSelf,
  reportCursor,
  reportViewport,
  retryPresenceEditorLease,
  usePresence,
  type Participant,
  type PresenceSelf,
  type PresenceViewport,
} from '@/lib/presence-client'
import { IconCursor } from '../icons'

/**
 * Collaboration presence overlay.
 *
 * MOUNTING CONTRACT — someone else wires this in:
 *  - It must live inside the `ReactFlowProvider` (it reads the camera and
 *    drives it while following).
 *  - Its container must be the element the ReactFlow pane fills, i.e. the
 *    `<main>` column of the workspace. Remote cursors are placed with the same
 *    `transform` the pane uses, so a mismatched container offsets every cursor.
 *
 * Nothing here writes to the workflow document. Cursors, cameras and follow
 * targets are view state and stay out of `commit` / `applyMutations` entirely.
 */

/** How close the local camera must stay to the followed one to count as ours. */
const FOLLOW_EPSILON_PX = 0.5
const FOLLOW_EPSILON_ZOOM = 0.001

/* ------------------------------------------------------------------ *
 * Connection + camera plumbing
 * ------------------------------------------------------------------ */

/**
 * Open the presence stream for a canvas and keep the local cursor and camera
 * reported. Exported on its own for anyone who wants presence data without the
 * overlay chrome.
 */
export function usePresenceConnection(canvasId: string | null, self?: PresenceSelf) {
  const flow = useReactFlow()
  const storeApi = useStoreApi()
  const transform = useStore((s) => s.transform)

  // Generated once per mount when the caller does not supply one, so the
  // identity survives re-renders and canvas switches within a tab.
  const [fallbackSelf] = useState<PresenceSelf>(() => loadPresenceSelf())
  const me = self ?? fallbackSelf
  // Depend on the fields, never on the object. A caller passing an inline
  // `self={{ ... }}` would otherwise hand this effect a new identity every
  // render and tear the stream down and back up on each one.
  const { id: selfId, name: selfName, color: selfColor } = me

  useEffect(() => {
    if (!canvasId) return
    connectPresence(canvasId, { id: selfId, name: selfName, color: selfColor })
    // Seed the camera immediately: a reconnect otherwise reports the default
    // viewport until the user happens to pan, and anyone following them would
    // be yanked to the origin.
    const [x, y, zoom] = storeApi.getState().transform
    reportViewport({ x, y, zoom })
    return () => disconnectPresence()
  }, [canvasId, selfId, selfName, selfColor, storeApi])

  // Camera changes are cheap to report — the client coalesces them.
  useEffect(() => {
    if (!canvasId) return
    reportViewport({ x: transform[0], y: transform[1], zoom: transform[2] })
  }, [canvasId, transform])

  // One listener for every mousemove; the client turns the burst into at most
  // one request per throttle window, so this never becomes a request per frame.
  useEffect(() => {
    if (!canvasId) return

    // `screenToFlowPosition` reads the pane's bounding rect, which forces a
    // synchronous layout. Converting inside the event handler would do that
    // once per pointermove — on top of the drag and pan work the canvas is
    // already doing that frame — and the client's network throttle happens
    // *after* the conversion, so it does not protect against this. Keep only
    // the raw client point and convert once per animation frame, which is also
    // the moment the browser is happiest to hand out geometry.
    let pending: { x: number; y: number } | null = null
    let frame: number | null = null

    const cancelFrame = () => {
      if (frame === null) return
      cancelAnimationFrame(frame)
      frame = null
    }

    const onPointerMove = (event: PointerEvent) => {
      const target = event.target
      // Outside the pane (a panel, the top bar) the cursor is not on the
      // canvas, and a remote arrow floating over someone's sidebar is noise.
      if (!(target instanceof Element) || !target.closest('.react-flow')) {
        pending = null
        cancelFrame()
        reportCursor(null)
        return
      }
      pending = { x: event.clientX, y: event.clientY }
      if (frame !== null) return
      frame = requestAnimationFrame(() => {
        frame = null
        const point = pending
        if (point) reportCursor(flow.screenToFlowPosition(point))
      })
    }
    // A queued frame must not resurrect a cursor the user just took away.
    const onLeave = () => {
      pending = null
      cancelFrame()
      reportCursor(null)
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('blur', onLeave)
    document.addEventListener('pointerleave', onLeave)
    return () => {
      cancelFrame()
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('blur', onLeave)
      document.removeEventListener('pointerleave', onLeave)
    }
  }, [canvasId, flow])

  return me
}

/**
 * Follow mode camera.
 *
 * Applying the remote viewport and detecting a local pan are the same signal,
 * so they have to be told apart. The store subscription runs *after* the
 * transform actually changed, and `appliedRef` is written synchronously before
 * `setViewport`, so our own echo always matches and only a genuinely local
 * pan/zoom fails the comparison. Doing this in a `useEffect` keyed on the
 * transform instead would compare a fresh `appliedRef` against last render's
 * transform and break the follow on the first frame.
 */
function useFollowCamera() {
  const flow = useReactFlow()
  const storeApi = useStoreApi()
  const followingId = usePresence((s) => s.followingId)
  const breakFollow = usePresence((s) => s.breakFollow)
  const target = usePresence((s) =>
    s.followingId === null ? null : (s.participants.find((p) => p.id === s.followingId) ?? null),
  )
  const appliedRef = useRef<PresenceViewport | null>(null)

  useEffect(() => {
    if (!target) {
      appliedRef.current = null
      return
    }
    const { minZoom, maxZoom } = storeApi.getState()
    const next: PresenceViewport = {
      x: target.viewport.x,
      y: target.viewport.y,
      // Clamped to this canvas's own limits. Without it xyflow clamps silently,
      // the echoed transform never equals what we asked for, and the drift
      // check below would cancel the follow immediately.
      zoom: Math.min(maxZoom, Math.max(minZoom, target.viewport.zoom)),
    }
    appliedRef.current = next
    // Instant, never animated: a tween emits intermediate transforms that are
    // indistinguishable from a local pan.
    void flow.setViewport(next)
  }, [target, flow, storeApi])

  useEffect(() => {
    if (!followingId) return
    return storeApi.subscribe((state, previous) => {
      if (state.transform === previous.transform) return
      const applied = appliedRef.current
      if (!applied) return
      const [x, y, zoom] = state.transform
      const ours =
        Math.abs(x - applied.x) < FOLLOW_EPSILON_PX &&
        Math.abs(y - applied.y) < FOLLOW_EPSILON_PX &&
        Math.abs(zoom - applied.zoom) < FOLLOW_EPSILON_ZOOM
      // Any local pan or zoom is the escape hatch — no modifier, no button.
      if (!ours) breakFollow()
    })
  }, [followingId, storeApi, breakFollow])

  useEffect(() => {
    if (!followingId) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') breakFollow()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [followingId, breakFollow])
}

/* ------------------------------------------------------------------ *
 * Overlay
 * ------------------------------------------------------------------ */

export function PresenceLayer({ canvasId, self }: { canvasId: string | null; self?: PresenceSelf }) {
  usePresenceConnection(canvasId, self)
  useFollowCamera()

  if (!canvasId) return null
  return (
    <>
      <RemoteCursors />
      <PresenceAvatars />
      <FollowBanner />
      <EditorLeaseStatus />
    </>
  )
}

/**
 * A compact seat indicator makes the concurrency boundary visible without
 * turning a rejected collaborator into a disconnected spectator. They can
 * still follow remote camera/cursor state and explicitly retry after release.
 */
function EditorLeaseStatus() {
  const state = usePresence((s) => s.editorLeaseState)
  const message = usePresence((s) => s.editorLeaseMessage)

  if (state === 'idle') return null
  if (state === 'active') {
    return (
      <div
        data-testid="presence-lease-active"
        role="status"
        className="pointer-events-none absolute right-4 top-[62px] z-40 rounded-full bg-surface px-2.5 py-1.5 text-[11px] font-medium text-ink-500 shadow-[var(--shadow-float)]"
      >
        正在编辑
      </div>
    )
  }
  if (state === 'acquiring') {
    return (
      <div
        data-testid="presence-lease-acquiring"
        role="status"
        className="pointer-events-none absolute right-4 top-[62px] z-40 rounded-full bg-surface px-2.5 py-1.5 text-[11px] text-ink-400 shadow-[var(--shadow-float)]"
      >
        正在获取编辑权…
      </div>
    )
  }

  return (
    <div
      data-testid="presence-lease-blocked"
      role="status"
      className="pointer-events-auto absolute right-4 top-[62px] z-40 flex max-w-[360px] items-center gap-2 rounded-[10px] bg-ink-900 px-2.5 py-2 text-[11px] text-white shadow-[var(--shadow-panel)]"
    >
      <span className="min-w-0 leading-4">{message ?? '当前为跟随查看模式，编辑席位已被占用'}</span>
      <button
        type="button"
        data-testid="presence-lease-retry"
        onClick={() => void retryPresenceEditorLease()}
        className="shrink-0 rounded-md bg-white/15 px-2 py-1 font-medium transition-colors hover:bg-white/25"
      >
        获取编辑权
      </button>
    </div>
  )
}

function RemoteCursors() {
  const participants = usePresence((s) => s.participants)
  const transform = useStore((s) => s.transform)
  const [tx, ty, zoom] = transform

  const visible = participants.filter((p) => p.cursor !== null)
  if (visible.length === 0) return null

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden="true">
      {visible.map((participant) => {
        const cursor = participant.cursor
        if (!cursor) return null
        return (
          <div
            key={participant.id}
            data-testid={`presence-cursor-${participant.id}`}
            className="absolute left-0 top-0 flex items-start gap-1 transition-transform duration-75 ease-linear will-change-transform"
            style={{
              // Flow → pane pixels by hand rather than scaling a wrapper: the
              // arrow must stay the same size at every zoom level.
              transform: `translate3d(${tx + cursor.x * zoom - 4}px, ${ty + cursor.y * zoom - 3}px, 0)`,
            }}
          >
            <IconCursor size={20} fill={participant.color} stroke="#ffffff" strokeWidth={1.3} />
            <span
              className="mt-3 max-w-[140px] truncate rounded-full px-2 py-[3px] text-[11px] font-medium text-white shadow-[var(--shadow-float)]"
              style={{ background: participant.color }}
            >
              {participant.name}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** Up to this many faces; the rest collapse into a +N chip. */
const AVATAR_LIMIT = 5

function PresenceAvatars() {
  const participants = usePresence((s) => s.participants)
  const connected = usePresence((s) => s.connected)
  const followingId = usePresence((s) => s.followingId)
  const follow = usePresence((s) => s.follow)

  const shown = useMemo(() => participants.slice(0, AVATAR_LIMIT), [participants])
  const overflow = participants.length - shown.length

  if (!connected || participants.length === 0) return null

  return (
    <div
      data-testid="presence-avatars"
      className="chip-bar pointer-events-auto absolute left-1/2 top-[62px] z-40 flex -translate-x-1/2 items-center gap-1.5 bg-surface px-2 py-1.5"
    >
      <span className="pl-1 text-[11px] text-ink-400">{participants.length} 人在此</span>
      <span className="h-3.5 w-px bg-ink-200" />
      <div className="flex items-center -space-x-1.5">
        {shown.map((participant) => (
          <AvatarButton
            key={participant.id}
            participant={participant}
            following={participant.id === followingId}
            onClick={() => follow(participant.id === followingId ? null : participant.id)}
          />
        ))}
      </div>
      {overflow > 0 && <span className="pr-1 text-[11px] text-ink-400">+{overflow}</span>}
    </div>
  )
}

function AvatarButton({
  participant,
  following,
  onClick,
}: {
  participant: Participant
  following: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`presence-avatar-${participant.id}`}
      title={following ? `停止跟随 ${participant.name}` : `跟随 ${participant.name}`}
      aria-label={following ? `停止跟随 ${participant.name}` : `跟随 ${participant.name}`}
      aria-pressed={following}
      className={cn(
        'relative flex h-[26px] w-[26px] items-center justify-center rounded-full text-[11px] font-semibold text-white ring-2 transition-transform hover:z-10 hover:-translate-y-0.5',
        following ? 'ring-ink-900' : 'ring-white',
      )}
      style={{ background: participant.color }}
    >
      {/* One glyph reads fine for Chinese names and for a latin initial. */}
      {[...participant.name.trim()][0] ?? '?'}
    </button>
  )
}

function FollowBanner() {
  const breakFollow = usePresence((s) => s.breakFollow)
  const target = usePresence((s) =>
    s.followingId === null ? null : (s.participants.find((p) => p.id === s.followingId) ?? null),
  )

  if (!target) return null

  return (
    <div
      data-testid="presence-follow-banner"
      role="status"
      className="pointer-events-auto absolute left-1/2 top-[106px] z-40 flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-ink-900 py-1.5 pl-2 pr-1.5 text-[12px] text-white shadow-[var(--shadow-panel)]"
    >
      <span
        className="h-[18px] w-[18px] shrink-0 rounded-full ring-2 ring-white/30"
        style={{ background: target.color }}
      />
      <span className="max-w-[220px] truncate">
        正在跟随 <span className="font-semibold">{target.name}</span> 的视角
      </span>
      <button
        type="button"
        onClick={breakFollow}
        data-testid="presence-follow-cancel"
        className="flex items-center gap-1 rounded-full bg-white/15 py-1 pl-2.5 pr-1.5 transition-colors hover:bg-white/25"
      >
        取消
        <kbd className="rounded bg-white/20 px-1.5 py-px text-[10px] font-medium">Esc</kbd>
      </button>
    </div>
  )
}

export { usePresence }
