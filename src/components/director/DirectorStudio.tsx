'use client'

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/cn'
import { Dialog } from '../ui/Dialog'
import { Menu, useMenuAnchor, type MenuSection } from '../ui/Menu'
import {
  Chip,
  EmptyState,
  Field,
  InlineRename,
  SegmentedControl,
  Slider,
  Toggle,
} from '../ui/controls'
import {
  IconCharacter,
  IconCheck,
  IconChevronDown,
  IconCursor,
  IconDirector,
  IconGrid,
  IconLayers,
  IconLocate,
  IconPlus,
  IconTrash,
} from '../icons'
import {
  ACTOR_RADIUS,
  ASPECT_RATIOS,
  BODY,
  BOX_EDGES,
  BOX_FACES,
  NEAR_PLANE,
  POSE_BONES,
  POSE_CATEGORIES,
  POSE_PRESETS,
  PROP_KINDS,
  activeCamera,
  aspectValue,
  cameraToScreen,
  clamp,
  cloneScene,
  createActor,
  createCamera,
  createDefaultScene,
  createProp,
  createShot,
  frustumPolygon,
  groundGridSegments,
  normalizeAngle,
  poseLabel,
  poseSkeleton,
  projectBodyPoint,
  projectSegment,
  propCorners,
  propKindSize,
  resolveCamera,
  sceneBounds,
  snap,
  topDownToWorld,
  worldToCamera,
  worldToCameraView,
  worldToTopDown,
  type Actor,
  type AspectRatioId,
  type Camera,
  type CapturedShot,
  type DirectorScene,
  type GroundPoint,
  type JointId,
  type PoseCategory,
  type PoseId,
  type Prop,
  type PropKind,
  type SceneSelection,
  type TopDownView,
  type Viewport,
} from './scene'

/* ------------------------------------------------------------------ *
 * Public interface
 * ------------------------------------------------------------------ */

export interface DirectorStudioProps {
  /** The studio only mounts while true, so every open starts from a clean state. */
  open: boolean
  /** Called for the close button, the backdrop and Escape. Never saves. */
  onClose: () => void
  /**
   * Scene to edit. Cloned on open, so the caller's object is never mutated —
   * nothing is written back until `onSave` fires.
   */
  initialScene?: DirectorScene
  /** Previously captured shots, typically read back from `data.extra`. */
  initialShots?: CapturedShot[]
  /**
   * Persist hook. The caller decides where the blocking lives — usually
   * `node.data.extra` on the 导演 node that opened this studio.
   */
  onSave: (scene: DirectorScene, shots: CapturedShot[]) => void
}

/**
 * 导演台 — a full-screen shot-blocking editor.
 *
 * Two viewports share one scene: a top-down map for placing people and objects,
 * and a camera preview that runs the same projection a real lens would. What
 * the director frames here is what downstream image and video nodes receive.
 */
export function DirectorStudio({ open, onClose, initialScene, initialShots, onSave }: DirectorStudioProps) {
  return (
    <Dialog open={open} onClose={onClose} variant="panel" width={1360} hideHeader testId="director-studio">
      <StudioBody initialScene={initialScene} initialShots={initialShots} onClose={onClose} onSave={onSave} />
    </Dialog>
  )
}

/* ------------------------------------------------------------------ *
 * Studio body
 * ------------------------------------------------------------------ */

type ViewMode = 'split' | 'map' | 'lens'

const MOVE_STEP = 0.25
const MOVE_STEP_FINE = 0.05
const TURN_STEP = 10
const TURN_STEP_FINE = 2

function StudioBody({
  initialScene,
  initialShots,
  onClose,
  onSave,
}: Omit<DirectorStudioProps, 'open'>) {
  // Mounted fresh on every open, so a plain initialiser is the whole reset story.
  const [bootstrap] = useState(() => {
    const start = initialScene ? cloneScene(initialScene) : createDefaultScene()
    const working = activeCamera(start)
    return {
      scene: start,
      selection: working ? ({ kind: 'camera', id: working.id } as SceneSelection) : null,
    }
  })
  const [scene, setScene] = useState<DirectorScene>(bootstrap.scene)
  const [shots, setShots] = useState<CapturedShot[]>(() => (initialShots ? [...initialShots] : []))
  const [selection, setSelection] = useState<SceneSelection | null>(bootstrap.selection)
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const [showGuides, setShowGuides] = useState(true)
  const [snapToGrid, setSnapToGrid] = useState(true)
  const [renamingShot, setRenamingShot] = useState<string | null>(null)

  const camera = activeCamera(scene)
  const resolved = useMemo(() => (camera ? resolveCamera(scene, camera) : null), [scene, camera])

  /* --- scene mutation helpers --------------------------------------- */

  const patchCamera = useCallback((id: string, patch: Partial<Camera>) => {
    setScene((current) => ({
      ...current,
      cameras: current.cameras.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }))
  }, [])

  const patchActor = useCallback((id: string, patch: Partial<Actor>) => {
    setScene((current) => ({
      ...current,
      actors: current.actors.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }))
  }, [])

  const patchProp = useCallback((id: string, patch: Partial<Prop>) => {
    setScene((current) => ({
      ...current,
      props: current.props.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }))
  }, [])

  const moveObject = useCallback(
    (target: SceneSelection, ground: GroundPoint) => {
      const step = snapToGrid ? 0.25 : 0
      const x = snap(ground.x, step)
      const z = snap(ground.z, step)
      setScene((current) => {
        const apply = <T extends { id: string; position: { x: number; y: number; z: number } }>(list: T[]) =>
          list.map((item) => (item.id === target.id ? { ...item, position: { ...item.position, x, z } } : item))
        if (target.kind === 'camera') return { ...current, cameras: apply(current.cameras) }
        if (target.kind === 'actor') return { ...current, actors: apply(current.actors) }
        return { ...current, props: apply(current.props) }
      })
    },
    [snapToGrid],
  )

  const nudgeSelected = useCallback(
    (dx: number, dz: number) => {
      if (!selection) return
      setScene((current) => {
        const apply = <T extends { id: string; position: { x: number; y: number; z: number } }>(list: T[]) =>
          list.map((item) =>
            item.id === selection.id
              ? { ...item, position: { ...item.position, x: item.position.x + dx, z: item.position.z + dz } }
              : item,
          )
        if (selection.kind === 'camera') return { ...current, cameras: apply(current.cameras) }
        if (selection.kind === 'actor') return { ...current, actors: apply(current.actors) }
        return { ...current, props: apply(current.props) }
      })
    },
    [selection],
  )

  const turnSelected = useCallback(
    (delta: number) => {
      if (!selection) return
      setScene((current) => {
        const apply = <T extends { id: string; rotationY: number }>(list: T[]) =>
          list.map((item) =>
            item.id === selection.id ? { ...item, rotationY: normalizeAngle(item.rotationY + delta) } : item,
          )
        if (selection.kind === 'camera') {
          return {
            ...current,
            cameras: current.cameras.map((item) =>
              item.id === selection.id
                ? { ...item, rotationY: normalizeAngle(item.rotationY + delta), lookAtActorId: null }
                : item,
            ),
          }
        }
        if (selection.kind === 'actor') return { ...current, actors: apply(current.actors) }
        return { ...current, props: apply(current.props) }
      })
    },
    [selection],
  )

  const removeObject = useCallback((target: SceneSelection) => {
    setScene((current) => {
      if (target.kind === 'camera') {
        // The studio is meaningless without a lens, so the last one stays.
        if (current.cameras.length <= 1) return current
        const cameras = current.cameras.filter((item) => item.id !== target.id)
        return {
          ...current,
          cameras,
          activeCameraId: current.activeCameraId === target.id ? cameras[0].id : current.activeCameraId,
        }
      }
      if (target.kind === 'actor') {
        return {
          ...current,
          actors: current.actors.filter((item) => item.id !== target.id),
          // A dangling look-at would silently freeze a camera's aim.
          cameras: current.cameras.map((item) =>
            item.lookAtActorId === target.id ? { ...item, lookAtActorId: null } : item,
          ),
        }
      }
      return { ...current, props: current.props.filter((item) => item.id !== target.id) }
    })
    setSelection((current) => (current && current.id === target.id ? null : current))
  }, [])

  const removeSelected = useCallback(() => {
    if (selection) removeObject(selection)
  }, [selection, removeObject])

  /* --- adding ------------------------------------------------------- */

  const addCamera = () => {
    const source = resolved ?? camera
    const next = createCamera(
      nextName(scene.cameras, '机位'),
      source ? { x: source.position.x + 1.5, y: source.position.y, z: source.position.z - 0.8 } : { x: 0, y: 1.55, z: -5 },
      source?.rotationY ?? 0,
    )
    setScene((current) => ({ ...current, cameras: [...current.cameras, next] }))
    setSelection({ kind: 'camera', id: next.id })
  }

  const addActor = () => {
    const spot = openSpot(scene)
    const next = createActor(nextName(scene.actors, '角色'), { x: spot.x, y: 0, z: spot.z }, aimAtCamera(scene, spot))
    setScene((current) => ({ ...current, actors: [...current.actors, next] }))
    setSelection({ kind: 'actor', id: next.id })
  }

  const addProp = () => {
    const spot = openSpot(scene)
    const next = createProp(nextName(scene.props, '道具'), { x: spot.x, y: 0, z: spot.z }, 'box')
    setScene((current) => ({ ...current, props: [...current.props, next] }))
    setSelection({ kind: 'prop', id: next.id })
  }

  /* --- shots -------------------------------------------------------- */

  const captureShot = () => {
    if (!resolved) return
    const shot = createShot(nextName(shots, '镜头'), resolved)
    setShots((current) => [...current, shot])
  }

  const restoreShot = (shot: CapturedShot) => {
    setScene((current) => {
      const exists = current.cameras.some((item) => item.id === shot.camera.id)
      const restored = { ...shot.camera, position: { ...shot.camera.position } }
      return {
        ...current,
        cameras: exists
          ? current.cameras.map((item) => (item.id === restored.id ? restored : item))
          : [...current.cameras, restored],
        activeCameraId: restored.id,
      }
    })
    setSelection({ kind: 'camera', id: shot.camera.id })
  }

  /* --- keyboard ----------------------------------------------------- */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      // An open menu owns the keyboard; nudging the scene underneath it would
      // move something the user cannot see.
      if (window.document.querySelector('[data-testid="menu"]')) return
      if (!selection) return
      const step = event.shiftKey ? MOVE_STEP_FINE : MOVE_STEP
      const turn = event.shiftKey ? TURN_STEP_FINE : TURN_STEP
      let handled = true
      switch (event.key.toLowerCase()) {
        case 'w':
          nudgeSelected(0, step)
          break
        case 's':
          nudgeSelected(0, -step)
          break
        case 'a':
          nudgeSelected(-step, 0)
          break
        case 'd':
          nudgeSelected(step, 0)
          break
        case 'q':
          turnSelected(-turn)
          break
        case 'e':
          turnSelected(turn)
          break
        case 'delete':
        case 'backspace':
          removeSelected()
          break
        default:
          handled = false
      }
      if (handled) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selection, nudgeSelected, turnSelected, removeSelected])

  /* --- render ------------------------------------------------------- */

  return (
    <div className="flex h-[82vh] min-h-[560px] flex-col" data-testid="director-body">
      <header className="flex items-center gap-3 border-b border-ink-100 px-5 py-3.5">
        <IconDirector size={18} className="text-ink-500" />
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-tight text-ink-900">导演台</h2>
          <p className="text-[11px] leading-tight text-ink-400">
            在俯视图中走位，机位预览即为下游图像与视频节点的参考取景
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-[11px] text-ink-400 lg:block">
            {scene.cameras.length} 机位 · {scene.actors.length} 角色 · {scene.props.length} 道具 · {shots.length} 镜头
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-ink-600 transition-colors hover:bg-ink-50"
          >
            取消
          </button>
          <button
            type="button"
            data-testid="director-save"
            onClick={() => {
              onSave(cloneScene(scene), shots)
              onClose()
            }}
            className="rounded-lg bg-ink-900 px-3.5 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-85"
          >
            保存
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <SceneTree
          scene={scene}
          selection={selection}
          onSelect={setSelection}
          onSetActiveCamera={(id) => setScene((current) => ({ ...current, activeCameraId: id }))}
          onAddCamera={addCamera}
          onAddActor={addActor}
          onAddProp={addProp}
          onDelete={removeObject}
        />

        <main className="flex min-w-0 flex-1 flex-col bg-ink-50/60">
          <div className="flex items-center gap-3 px-4 py-2.5">
            <SegmentedControl
              size="sm"
              value={viewMode}
              onChange={setViewMode}
              options={[
                { value: 'split', label: '双视图', testId: 'director-view-split' },
                { value: 'map', label: '俯视图', testId: 'director-view-map' },
                { value: 'lens', label: '机位视图', testId: 'director-view-lens' },
              ]}
            />
            <div className="ml-auto flex items-center gap-1.5">
              {resolved && (
                <>
                  <Chip icon={<IconDirector size={11} />} tone="accent">
                    {resolved.name}
                  </Chip>
                  <Chip>{Math.round(resolved.fov)}° 视场</Chip>
                  <Chip>{ASPECT_RATIOS.find((item) => item.id === resolved.aspectRatio)?.label ?? '16:9'}</Chip>
                </>
              )}
            </div>
          </div>

          <div className={cn('grid min-h-0 flex-1 gap-3 px-4', viewMode === 'split' ? 'grid-cols-2' : 'grid-cols-1')}>
            {viewMode !== 'lens' && (
              <ViewportFrame title="俯视走位图" icon={<IconGrid size={13} />} testId="director-topdown">
                <TopDownMap
                  scene={scene}
                  selection={selection}
                  onSelect={setSelection}
                  onMove={moveObject}
                  snapToGrid={snapToGrid}
                />
              </ViewportFrame>
            )}
            {viewMode !== 'map' && (
              <ViewportFrame
                title="机位预览"
                icon={<IconDirector size={13} />}
                testId="director-preview"
                hint={resolved ? `${resolved.name} · ${Math.round(resolved.fov)}°` : undefined}
              >
                {resolved ? (
                  <CameraPreviewSurface scene={scene} camera={resolved} selection={selection} showGuides={showGuides} />
                ) : (
                  <EmptyState compact title="场景中没有机位" description="在左侧添加一个机位后即可预览取景。" />
                )}
              </ViewportFrame>
            )}
          </div>

          <ShotStrip
            scene={scene}
            shots={shots}
            renamingId={renamingShot}
            onCapture={captureShot}
            onRestore={restoreShot}
            onRename={(id, name) => {
              setShots((current) => current.map((shot) => (shot.id === id ? { ...shot, name } : shot)))
              setRenamingShot(null)
            }}
            onStartRename={setRenamingShot}
            onCancelRename={() => setRenamingShot(null)}
            onDelete={(id) => setShots((current) => current.filter((shot) => shot.id !== id))}
          />
        </main>

        <PropertiesPanel
          scene={scene}
          selection={selection}
          showGuides={showGuides}
          snapToGrid={snapToGrid}
          onToggleGuides={setShowGuides}
          onToggleSnap={setSnapToGrid}
          onPatchCamera={patchCamera}
          onPatchActor={patchActor}
          onPatchProp={patchProp}
          onSetActiveCamera={(id) => setScene((current) => ({ ...current, activeCameraId: id }))}
          onDelete={removeSelected}
        />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Layout helpers
 * ------------------------------------------------------------------ */

function ViewportFrame({
  title,
  icon,
  hint,
  testId,
  children,
}: {
  title: string
  icon: ReactNode
  hint?: string
  testId: string
  children: ReactNode
}) {
  return (
    <section
      data-testid={testId}
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl bg-surface ring-1 ring-ink-100"
    >
      <div className="flex items-center gap-1.5 border-b border-ink-100 px-3 py-2 text-[11px] font-medium text-ink-500">
        <span className="text-ink-400">{icon}</span>
        {title}
        {hint && <span className="ml-auto font-mono text-[10px] text-ink-400">{hint}</span>}
      </div>
      <div className="relative min-h-0 flex-1">{children}</div>
    </section>
  )
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [ref, size] as const
}

/* ------------------------------------------------------------------ *
 * Scene tree
 * ------------------------------------------------------------------ */

function SceneTree({
  scene,
  selection,
  onSelect,
  onSetActiveCamera,
  onAddCamera,
  onAddActor,
  onAddProp,
  onDelete,
}: {
  scene: DirectorScene
  selection: SceneSelection | null
  onSelect: (selection: SceneSelection) => void
  onSetActiveCamera: (id: string) => void
  onAddCamera: () => void
  onAddActor: () => void
  onAddProp: () => void
  onDelete: (target: SceneSelection) => void
}) {
  return (
    <aside
      data-testid="director-tree"
      className="flex w-[212px] shrink-0 flex-col border-r border-ink-100 bg-surface"
    >
      <div className="thin-scrollbar flex-1 overflow-y-auto px-2 py-3">
        <TreeGroup title="机位" icon={<IconDirector size={13} />} onAdd={onAddCamera} addLabel="添加机位">
          {scene.cameras.map((item) => (
            <TreeRow
              key={item.id}
              label={item.name}
              meta={`${Math.round(item.fov)}°`}
              selected={selection?.kind === 'camera' && selection.id === item.id}
              active={scene.activeCameraId === item.id}
              testId={`director-node-${item.id}`}
              onSelect={() => onSelect({ kind: 'camera', id: item.id })}
              onActivate={() => onSetActiveCamera(item.id)}
              onDelete={scene.cameras.length > 1 ? () => onDelete({ kind: 'camera', id: item.id }) : undefined}
            />
          ))}
        </TreeGroup>

        <TreeGroup title="角色" icon={<IconCharacter size={13} />} onAdd={onAddActor} addLabel="添加角色">
          {scene.actors.length === 0 && <TreeEmpty>暂无角色</TreeEmpty>}
          {scene.actors.map((item) => (
            <TreeRow
              key={item.id}
              label={item.name}
              meta={poseLabel(item.pose)}
              selected={selection?.kind === 'actor' && selection.id === item.id}
              testId={`director-node-${item.id}`}
              onSelect={() => onSelect({ kind: 'actor', id: item.id })}
              onDelete={() => onDelete({ kind: 'actor', id: item.id })}
            />
          ))}
        </TreeGroup>

        <TreeGroup title="道具" icon={<IconLayers size={13} />} onAdd={onAddProp} addLabel="添加道具">
          {scene.props.length === 0 && <TreeEmpty>暂无道具</TreeEmpty>}
          {scene.props.map((item) => (
            <TreeRow
              key={item.id}
              label={item.name}
              meta={`${item.size.w.toFixed(1)}×${item.size.d.toFixed(1)}`}
              selected={selection?.kind === 'prop' && selection.id === item.id}
              testId={`director-node-${item.id}`}
              onSelect={() => onSelect({ kind: 'prop', id: item.id })}
              onDelete={() => onDelete({ kind: 'prop', id: item.id })}
            />
          ))}
        </TreeGroup>
      </div>

      <div className="border-t border-ink-100 px-3 py-2.5 text-[10px] leading-relaxed text-ink-400">
        <div>
          <span className="font-mono text-ink-500">W A S D</span> 平移 ·{' '}
          <span className="font-mono text-ink-500">Q E</span> 旋转
        </div>
        <div>
          <span className="font-mono text-ink-500">Shift</span> 微调 ·{' '}
          <span className="font-mono text-ink-500">Delete</span> 删除
        </div>
      </div>
    </aside>
  )
}

function TreeGroup({
  title,
  icon,
  addLabel,
  onAdd,
  children,
}: {
  title: string
  icon: ReactNode
  addLabel: string
  onAdd: () => void
  children: ReactNode
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-1.5 px-1.5 pb-1">
        <span className="text-ink-400">{icon}</span>
        <span className="text-[11px] font-medium text-ink-500">{title}</span>
        <button
          type="button"
          onClick={onAdd}
          aria-label={addLabel}
          title={addLabel}
          className="ml-auto rounded-md p-1 text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-700"
        >
          <IconPlus size={13} />
        </button>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

function TreeEmpty({ children }: { children: ReactNode }) {
  return <div className="px-2 py-1 text-[11px] text-ink-300">{children}</div>
}

function TreeRow({
  label,
  meta,
  selected,
  active,
  testId,
  onSelect,
  onActivate,
  onDelete,
}: {
  label: string
  meta?: string
  selected: boolean
  active?: boolean
  testId?: string
  onSelect: () => void
  onActivate?: () => void
  onDelete?: () => void
}) {
  return (
    <div
      data-testid={testId}
      onClick={onSelect}
      className={cn(
        'group flex cursor-default items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] transition-colors',
        selected ? 'bg-accent-soft text-accent-ink' : 'text-ink-700 hover:bg-ink-50',
      )}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {meta && <span className="shrink-0 text-[10px] text-ink-400 group-hover:hidden">{meta}</span>}
      {onActivate && (
        <button
          type="button"
          aria-label="设为当前机位"
          title="设为当前机位"
          onClick={(event) => {
            event.stopPropagation()
            onActivate()
          }}
          className={cn(
            'shrink-0 rounded p-0.5 transition-colors',
            active ? 'text-accent' : 'text-ink-300 opacity-0 hover:text-ink-600 group-hover:opacity-100',
          )}
        >
          {active ? <IconCheck size={12} /> : <IconLocate size={12} />}
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          aria-label="删除"
          onClick={(event) => {
            event.stopPropagation()
            onDelete()
          }}
          className="shrink-0 rounded p-0.5 text-ink-300 opacity-0 transition-colors hover:text-danger group-hover:opacity-100"
        >
          <IconTrash size={12} />
        </button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Top-down blocking map
 * ------------------------------------------------------------------ */

const MIN_PPU = 8
const MAX_PPU = 110

function TopDownMap({
  scene,
  selection,
  onSelect,
  onMove,
  snapToGrid,
}: {
  scene: DirectorScene
  selection: SceneSelection | null
  onSelect: (selection: SceneSelection | null) => void
  onMove: (target: SceneSelection, ground: GroundPoint) => void
  snapToGrid: boolean
}) {
  const [hostRef, size] = useElementSize<HTMLDivElement>()
  const svgRef = useRef<SVGSVGElement>(null)
  const [camera, setCamera] = useState<{ center: GroundPoint; ppu: number } | null>(null)
  const drag = useRef<{ target: SceneSelection | 'pan'; grab: GroundPoint } | null>(null)

  const width = Math.max(size.width, 1)
  const height = Math.max(size.height, 1)

  const fit = useCallback((): { center: GroundPoint; ppu: number } => {
    const bounds = sceneBounds(scene, 2.5)
    const spanX = Math.max(bounds.maxX - bounds.minX, 4)
    const spanZ = Math.max(bounds.maxZ - bounds.minZ, 4)
    return {
      center: { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 },
      ppu: clamp(Math.min(width / spanX, height / spanZ), MIN_PPU, MAX_PPU),
    }
    // Framing depends on the live scene, but only when the user asks to refit.
  }, [scene, width, height])

  // First real measurement decides the initial framing; later resizes keep it.
  useEffect(() => {
    if (camera || width < 2 || height < 2) return
    setCamera(fit())
  }, [camera, fit, width, height])

  const view: TopDownView = useMemo(
    () => ({ width, height, center: camera?.center ?? { x: 0, z: 0 }, pixelsPerUnit: camera?.ppu ?? 32 }),
    [width, height, camera],
  )

  const toLocal = (event: { clientX: number; clientY: number }) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return { x: 0, y: 0 }
    return {
      x: (event.clientX - rect.left) * (width / rect.width),
      y: (event.clientY - rect.top) * (height / rect.height),
    }
  }

  const beginDrag = (event: React.PointerEvent, target: SceneSelection | 'pan') => {
    event.stopPropagation()
    const world = topDownToWorld(toLocal(event), view)
    if (target !== 'pan') {
      const object = findObject(scene, target)
      drag.current = object
        ? { target, grab: { x: world.x - object.position.x, z: world.z - object.position.z } }
        : { target, grab: { x: 0, z: 0 } }
      onSelect(target)
    } else {
      drag.current = { target, grab: world }
    }
    svgRef.current?.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: React.PointerEvent) => {
    const active = drag.current
    if (!active) return
    if (active.target === 'pan') {
      const local = toLocal(event)
      // Resolved against the live centre: pointermove can fire twice before a
      // re-render, and a stale view would double-apply the same delta.
      setCamera((current) => {
        if (!current) return current
        const world = topDownToWorld(local, { width, height, center: current.center, pixelsPerUnit: current.ppu })
        return {
          ppu: current.ppu,
          center: {
            x: current.center.x + (active.grab.x - world.x),
            z: current.center.z + (active.grab.z - world.z),
          },
        }
      })
      return
    }
    const world = topDownToWorld(toLocal(event), view)
    onMove(active.target, { x: world.x - active.grab.x, z: world.z - active.grab.z })
  }

  const endDrag = (event: React.PointerEvent) => {
    if (!drag.current) return
    drag.current = null
    svgRef.current?.releasePointerCapture(event.pointerId)
  }

  // Wheel zoom needs a non-passive listener to keep the dialog from scrolling.
  useEffect(() => {
    const element = svgRef.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      const local = {
        x: (event.clientX - rect.left) * (width / rect.width),
        y: (event.clientY - rect.top) * (height / rect.height),
      }
      setCamera((current) => {
        if (!current) return current
        const nextPpu = clamp(current.ppu * Math.exp(-event.deltaY * 0.0015), MIN_PPU, MAX_PPU)
        const before = topDownToWorld(local, { width, height, center: current.center, pixelsPerUnit: current.ppu })
        const after = topDownToWorld(local, { width, height, center: current.center, pixelsPerUnit: nextPpu })
        return {
          ppu: nextPpu,
          center: {
            x: current.center.x + before.x - after.x,
            z: current.center.z + before.z - after.z,
          },
        }
      })
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [width, height])

  const ppu = view.pixelsPerUnit
  const gridStep = ppu < 16 ? 5 : 1
  const active = activeCamera(scene)

  return (
    <div ref={hostRef} className="absolute inset-0">
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
        className="block touch-none select-none"
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="var(--color-surface)"
          onPointerDown={(event) => {
            onSelect(null)
            beginDrag(event, 'pan')
          }}
        />

        <MapGrid view={view} step={gridStep} />

        {/* Frustums first: they are context, not objects to click. */}
        {scene.cameras.map((item) => {
          const solved = resolveCamera(scene, item)
          const isActive = item.id === scene.activeCameraId
          const polygon = frustumPolygon(solved, Math.max(width, height) / ppu)
          const points = polygon.map((point) => {
            const screen = worldToTopDown(point, view)
            return `${screen.x},${screen.y}`
          })
          return (
            <polygon
              key={`frustum-${item.id}`}
              points={points.join(' ')}
              fill={isActive ? 'var(--color-accent)' : 'var(--color-ink-400)'}
              fillOpacity={isActive ? 0.09 : 0.05}
              stroke={isActive ? 'var(--color-accent)' : 'var(--color-ink-300)'}
              strokeOpacity={isActive ? 0.45 : 0.3}
              strokeWidth={1}
              pointerEvents="none"
            />
          )
        })}

        {scene.props.map((item) => (
          <MapProp
            key={item.id}
            prop={item}
            view={view}
            selected={selection?.kind === 'prop' && selection.id === item.id}
            onPointerDown={(event) => beginDrag(event, { kind: 'prop', id: item.id })}
          />
        ))}

        {scene.actors.map((item) => (
          <MapActor
            key={item.id}
            actor={item}
            view={view}
            selected={selection?.kind === 'actor' && selection.id === item.id}
            onPointerDown={(event) => beginDrag(event, { kind: 'actor', id: item.id })}
          />
        ))}

        {scene.cameras.map((item) => (
          <MapCamera
            key={item.id}
            camera={resolveCamera(scene, item)}
            view={view}
            active={item.id === scene.activeCameraId}
            selected={selection?.kind === 'camera' && selection.id === item.id}
            onPointerDown={(event) => beginDrag(event, { kind: 'camera', id: item.id })}
          />
        ))}
      </svg>

      <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-2 text-[10px] text-ink-400">
        <span className="rounded-full bg-surface/90 px-2 py-0.5 shadow-[var(--shadow-float)]">
          {gridStep} m 网格 · {snapToGrid ? '吸附 0.25 m' : '自由拖拽'}
        </span>
        {active && (
          <span className="rounded-full bg-surface/90 px-2 py-0.5 shadow-[var(--shadow-float)]">
            {active.name} 视野
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => setCamera(fit())}
        className="absolute right-2 top-2 rounded-lg bg-surface/95 px-2 py-1 text-[10px] text-ink-500 shadow-[var(--shadow-float)] transition-colors hover:text-ink-900"
      >
        适应视图
      </button>
    </div>
  )
}

function MapGrid({ view, step }: { view: TopDownView; step: number }) {
  const lines: ReactNode[] = []
  const half = { x: view.width / 2 / view.pixelsPerUnit, z: view.height / 2 / view.pixelsPerUnit }
  const minX = Math.ceil((view.center.x - half.x) / step) * step
  const maxX = view.center.x + half.x
  const minZ = Math.ceil((view.center.z - half.z) / step) * step
  const maxZ = view.center.z + half.z

  for (let x = minX; x <= maxX; x += step) {
    const screen = worldToTopDown({ x, z: view.center.z }, view)
    const axis = Math.abs(x) < 1e-6
    lines.push(
      <line
        key={`x${x.toFixed(3)}`}
        x1={screen.x}
        y1={0}
        x2={screen.x}
        y2={view.height}
        stroke={axis ? 'var(--color-ink-300)' : 'var(--color-ink-100)'}
        strokeWidth={1}
      />,
    )
  }
  for (let z = minZ; z <= maxZ; z += step) {
    const screen = worldToTopDown({ x: view.center.x, z }, view)
    const axis = Math.abs(z) < 1e-6
    lines.push(
      <line
        key={`z${z.toFixed(3)}`}
        x1={0}
        y1={screen.y}
        x2={view.width}
        y2={screen.y}
        stroke={axis ? 'var(--color-ink-300)' : 'var(--color-ink-100)'}
        strokeWidth={1}
      />,
    )
  }
  return <g pointerEvents="none">{lines}</g>
}

function MapCamera({
  camera,
  view,
  active,
  selected,
  onPointerDown,
}: {
  camera: Camera
  view: TopDownView
  active: boolean
  selected: boolean
  onPointerDown: (event: React.PointerEvent) => void
}) {
  const screen = worldToTopDown({ x: camera.position.x, z: camera.position.z }, view)
  const tone = active ? 'var(--color-accent)' : 'var(--color-ink-400)'
  return (
    <g transform={`translate(${screen.x} ${screen.y})`} onPointerDown={onPointerDown} className="cursor-grab">
      {selected && <circle r={17} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} />}
      {/* Glyph points along -y at rotation 0, which is +z on the map. */}
      <g transform={`rotate(${camera.rotationY})`}>
        <path d="M 0 -13 L 9 6 L 0 2 L -9 6 Z" fill={tone} stroke="var(--color-surface)" strokeWidth={1.5} />
      </g>
      <circle r={3.2} fill="var(--color-surface)" />
      <text y={24} textAnchor="middle" className="pointer-events-none" fontSize={10} fill="var(--color-ink-500)">
        {camera.name}
      </text>
    </g>
  )
}

function MapActor({
  actor,
  view,
  selected,
  onPointerDown,
}: {
  actor: Actor
  view: TopDownView
  selected: boolean
  onPointerDown: (event: React.PointerEvent) => void
}) {
  const screen = worldToTopDown({ x: actor.position.x, z: actor.position.z }, view)
  const radius = Math.max(ACTOR_RADIUS * view.pixelsPerUnit, 7)
  const reach = radius * 2.2
  const spread = 34
  const p1 = { x: reach * Math.sin((-spread * Math.PI) / 180), y: -reach * Math.cos((-spread * Math.PI) / 180) }
  const p2 = { x: reach * Math.sin((spread * Math.PI) / 180), y: -reach * Math.cos((spread * Math.PI) / 180) }

  return (
    <g transform={`translate(${screen.x} ${screen.y})`} onPointerDown={onPointerDown} className="cursor-grab">
      <g transform={`rotate(${actor.rotationY})`}>
        <path
          d={`M 0 0 L ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${reach.toFixed(2)} ${reach.toFixed(2)} 0 0 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} Z`}
          fill={selected ? 'var(--color-accent)' : 'var(--color-ink-400)'}
          fillOpacity={0.16}
        />
      </g>
      <circle
        r={radius}
        fill={selected ? 'var(--color-accent-soft)' : 'var(--color-surface)'}
        stroke={selected ? 'var(--color-accent)' : 'var(--color-ink-400)'}
        strokeWidth={selected ? 2 : 1.4}
      />
      <text
        y={radius + 12}
        textAnchor="middle"
        className="pointer-events-none"
        fontSize={10}
        fill="var(--color-ink-500)"
      >
        {actor.name}
      </text>
    </g>
  )
}

function MapProp({
  prop,
  view,
  selected,
  onPointerDown,
}: {
  prop: Prop
  view: TopDownView
  selected: boolean
  onPointerDown: (event: React.PointerEvent) => void
}) {
  const screen = worldToTopDown({ x: prop.position.x, z: prop.position.z }, view)
  const w = Math.max(prop.size.w * view.pixelsPerUnit, 4)
  const d = Math.max(prop.size.d * view.pixelsPerUnit, 4)
  const label = Math.max(w, d) / 2 + 12
  return (
    <g transform={`translate(${screen.x} ${screen.y})`} onPointerDown={onPointerDown} className="cursor-grab">
      <g transform={`rotate(${prop.rotationY})`}>
        <rect
          x={-w / 2}
          y={-d / 2}
          width={w}
          height={d}
          rx={2}
          fill={selected ? 'var(--color-accent-soft)' : 'var(--color-ink-100)'}
          stroke={selected ? 'var(--color-accent)' : 'var(--color-ink-300)'}
          strokeWidth={selected ? 2 : 1.2}
        />
        {/* A tick on the front edge so a rotated prop still reads as oriented. */}
        <line x1={0} y1={-d / 2} x2={0} y2={-d / 2 - 6} stroke="var(--color-ink-400)" strokeWidth={1.2} />
      </g>
      <text y={label} textAnchor="middle" className="pointer-events-none" fontSize={10} fill="var(--color-ink-400)">
        {prop.name}
      </text>
    </g>
  )
}

/* ------------------------------------------------------------------ *
 * Camera preview
 * ------------------------------------------------------------------ */

function CameraPreviewSurface({
  scene,
  camera,
  selection,
  showGuides,
}: {
  scene: DirectorScene
  camera: Camera
  selection: SceneSelection | null
  showGuides: boolean
}) {
  const [hostRef, size] = useElementSize<HTMLDivElement>()
  return (
    <div ref={hostRef} className="absolute inset-0">
      {size.width > 1 && size.height > 1 && (
        <CameraPreview
          scene={scene}
          camera={camera}
          width={size.width}
          height={size.height}
          selection={selection}
          showGuides={showGuides}
        />
      )}
    </div>
  )
}

export interface CameraPreviewProps {
  scene: DirectorScene
  /**
   * The camera to look through. Pass it through `resolveCamera` first if it may
   * carry a look-at target, otherwise a stale yaw is drawn.
   */
  camera: Camera
  /** Pixel box to draw into; the framing is letterboxed inside it. */
  width: number
  height: number
  /** Highlights the matching actor or prop in accent. */
  selection?: SceneSelection | null
  /** Rule-of-thirds overlay. Ignored in `compact` mode. */
  showGuides?: boolean
  /** Thumbnail mode: coarser floor grid, no name labels, no letterbox padding. */
  compact?: boolean
}

/**
 * The lens view, exported so a node card can show its blocking without opening
 * the studio. Everything is projected through `worldToCameraView`, the same
 * maths the top-down frustum is drawn from, so the two views can never drift
 * apart: move the camera closer and figures grow, yaw it and they pan across,
 * put one behind the lens and it disappears.
 */
export function CameraPreview({ scene, camera, width, height, selection, showGuides, compact }: CameraPreviewProps) {
  const clipId = useId()
  const aspect = aspectValue(camera.aspectRatio)
  const pad = compact ? 0 : 10
  const boxW = Math.max(width - pad * 2, 1)
  const boxH = Math.max(height - pad * 2, 1)
  const frameW = boxW / boxH > aspect ? boxH * aspect : boxW
  const frameH = boxW / boxH > aspect ? boxH : boxW / aspect
  const originX = (width - frameW) / 2
  const originY = (height - frameH) / 2
  const viewport: Viewport = { width: frameW, height: frameH }
  const horizon = frameH / 2

  // Projection is a few dozen dot products; memoising it would cost more in
  // dependency bookkeeping than it saves, and drags must stay frame-accurate.
  const grid = groundGridSegments(camera, compact ? 2 : 1, compact ? 18 : 28)

  const renderables: { key: string; depth: number; node: ReactNode }[] = []
  for (const prop of scene.props) {
    const drawn = renderProp(prop, camera, viewport, selection?.kind === 'prop' && selection.id === prop.id)
    if (drawn) renderables.push({ key: `prop-${prop.id}`, depth: drawn.depth, node: drawn.element })
  }
  for (const actor of scene.actors) {
    const drawn = renderActor(
      actor,
      camera,
      viewport,
      selection?.kind === 'actor' && selection.id === actor.id,
      Boolean(compact),
    )
    if (drawn) renderables.push({ key: `actor-${actor.id}`, depth: drawn.depth, node: drawn.element })
  }
  // Painter's algorithm: far things first, so a foreground actor covers a prop.
  renderables.sort((a, b) => b.depth - a.depth)

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block select-none">
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={frameW} height={frameH} />
        </clipPath>
      </defs>

      {/* Letterbox: the bars are the dialog surface, the frame is the picture. */}
      <rect x={0} y={0} width={width} height={height} fill="var(--color-ink-50)" />

      <g transform={`translate(${originX} ${originY})`} clipPath={`url(#${clipId})`}>
        <rect x={0} y={0} width={frameW} height={horizon} fill="var(--color-surface)" />
        <rect x={0} y={horizon} width={frameW} height={frameH - horizon} fill="var(--color-ink-100)" />

        <g stroke="var(--color-ink-200)" strokeWidth={compact ? 0.5 : 0.8} fill="none">
          {grid.map(([from, to], index) => {
            const segment = projectSegment(from, to, camera, viewport)
            if (!segment) return null
            return (
              <line
                key={index}
                x1={segment.a.x}
                y1={segment.a.y}
                x2={segment.b.x}
                y2={segment.b.y}
                opacity={0.75}
              />
            )
          })}
        </g>

        <line x1={0} y1={horizon} x2={frameW} y2={horizon} stroke="var(--color-ink-300)" strokeWidth={1} />

        {renderables.map((item) => (
          <g key={item.key}>{item.node}</g>
        ))}

        {showGuides && !compact && (
          <g stroke="var(--color-ink-300)" strokeWidth={0.8} strokeDasharray="4 5" opacity={0.7}>
            <line x1={frameW / 3} y1={0} x2={frameW / 3} y2={frameH} />
            <line x1={(frameW * 2) / 3} y1={0} x2={(frameW * 2) / 3} y2={frameH} />
            <line x1={0} y1={frameH / 3} x2={frameW} y2={frameH / 3} />
            <line x1={0} y1={(frameH * 2) / 3} x2={frameW} y2={(frameH * 2) / 3} />
          </g>
        )}
      </g>

      <rect
        x={originX}
        y={originY}
        width={frameW}
        height={frameH}
        fill="none"
        stroke="var(--color-ink-200)"
        strokeWidth={1}
      />
    </svg>
  )
}

/** Stick figure billboarded at the actor's mark, scaled by lens distance. */
function renderActor(
  actor: Actor,
  camera: Camera,
  viewport: Viewport,
  selected: boolean,
  compact: boolean,
): { depth: number; element: ReactNode } | null {
  const ground = worldToCameraView(actor.position, camera, viewport)
  // Behind the lens: drawing it would fold the figure into a mirror image.
  if (!ground.visible) return null
  const unit = ground.scale * actor.height
  if (unit < 3 || unit > viewport.height * 40) return null

  const skeleton = poseSkeleton(actor.pose)
  const relativeYaw = actor.rotationY - camera.rotationY
  const at = (joint: JointId) => {
    const point = projectBodyPoint(skeleton[joint], relativeYaw)
    return { x: ground.x + point.x * unit, y: ground.y + point.y * unit }
  }

  const stroke = selected ? 'var(--color-accent)' : 'var(--color-ink-700)'
  const head = at('head')
  const headRadius = unit * BODY.headRadius

  return {
    depth: ground.depth,
    element: (
      <>
        <ellipse
          cx={ground.x}
          cy={ground.y}
          rx={Math.max(unit * 0.19, 1)}
          ry={Math.max(unit * 0.05, 0.5)}
          fill="var(--color-ink-900)"
          opacity={0.09}
        />
        <g stroke={stroke} strokeLinecap="round" fill="none">
          {POSE_BONES.map((bone) => {
            const from = at(bone.from)
            const to = at(bone.to)
            const weight = bone.weight === 'torso' ? 0.055 : bone.weight === 'limb' ? 0.034 : 0.022
            return (
              <line
                key={`${bone.from}-${bone.to}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                strokeWidth={Math.max(unit * weight, 0.6)}
              />
            )
          })}
        </g>
        <circle
          cx={head.x}
          cy={head.y}
          r={Math.max(headRadius, 1)}
          fill="var(--color-surface)"
          stroke={stroke}
          strokeWidth={Math.max(unit * 0.022, 0.6)}
        />
        {!compact && unit > 40 && (
          <text
            x={head.x}
            y={head.y - headRadius - 6}
            textAnchor="middle"
            fontSize={11}
            fill={selected ? 'var(--color-accent-ink)' : 'var(--color-ink-400)'}
          >
            {actor.name}
          </text>
        )}
      </>
    ),
  }
}

/** Prop drawn as a real box: visible faces filled, all edges near-plane clipped. */
function renderProp(
  prop: Prop,
  camera: Camera,
  viewport: Viewport,
  selected: boolean,
): { depth: number; element: ReactNode } | null {
  const corners = propCorners(prop)
  const cameraSpace = corners.map((corner) => worldToCamera(corner, camera))
  if (cameraSpace.every((point) => point.z < NEAR_PLANE)) return null

  const screen = cameraSpace.map((point) => cameraToScreen(point, camera, viewport))
  const depth = cameraSpace.reduce((sum, point) => sum + point.z, 0) / cameraSpace.length

  const faces = BOX_FACES.map((face) => ({
    face,
    depth: face.reduce((sum, index) => sum + cameraSpace[index].z, 0) / face.length,
    clipped: face.some((index) => cameraSpace[index].z < NEAR_PLANE),
  }))
    .filter((item) => !item.clipped)
    .sort((a, b) => b.depth - a.depth)

  const edges = BOX_EDGES.map(([from, to]) => projectSegment(corners[from], corners[to], camera, viewport))

  return {
    depth,
    element: (
      <>
        {faces.map((item, index) => (
          <polygon
            key={index}
            points={item.face.map((corner) => `${screen[corner].x},${screen[corner].y}`).join(' ')}
            fill={selected ? 'var(--color-accent-soft)' : 'var(--color-ink-200)'}
            fillOpacity={0.85}
          />
        ))}
        <g
          stroke={selected ? 'var(--color-accent)' : 'var(--color-ink-400)'}
          strokeWidth={selected ? 1.6 : 1}
          fill="none"
          strokeLinecap="round"
        >
          {edges.map((segment, index) =>
            segment ? (
              <line key={index} x1={segment.a.x} y1={segment.a.y} x2={segment.b.x} y2={segment.b.y} />
            ) : null,
          )}
        </g>
      </>
    ),
  }
}

/* ------------------------------------------------------------------ *
 * Shot list
 * ------------------------------------------------------------------ */

function ShotStrip({
  scene,
  shots,
  renamingId,
  onCapture,
  onRestore,
  onRename,
  onStartRename,
  onCancelRename,
  onDelete,
}: {
  scene: DirectorScene
  shots: CapturedShot[]
  renamingId: string | null
  onCapture: () => void
  onRestore: (shot: CapturedShot) => void
  onRename: (id: string, name: string) => void
  onStartRename: (id: string) => void
  onCancelRename: () => void
  onDelete: (id: string) => void
}) {
  return (
    <section data-testid="director-shots" className="shrink-0 px-4 pb-3 pt-3">
      <div className="flex items-center gap-2 pb-2">
        <span className="text-[11px] font-medium text-ink-500">镜头表</span>
        <span className="text-[10px] text-ink-400">{shots.length} 个已捕捉取景</span>
        <button
          type="button"
          data-testid="director-capture"
          onClick={onCapture}
          className="ml-auto flex items-center gap-1 rounded-lg bg-ink-900 px-2.5 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-85"
        >
          <IconPlus size={12} />
          捕捉当前画面
        </button>
      </div>

      {shots.length === 0 ? (
        <div className="rounded-xl bg-surface ring-1 ring-ink-100">
          <EmptyState
            compact
            title="还没有捕捉镜头"
            description="调整机位到满意的取景后点击「捕捉当前画面」，这里会保留缩略图并可一键回到该机位。"
          />
        </div>
      ) : (
        <div className="thin-scrollbar flex gap-2.5 overflow-x-auto pb-1">
          {shots.map((shot) => (
            <div
              key={shot.id}
              data-testid={`director-shot-${shot.id}`}
              className="group relative w-[136px] shrink-0 overflow-hidden rounded-xl bg-surface ring-1 ring-ink-100 transition-shadow hover:shadow-[var(--shadow-float)]"
            >
              <button
                type="button"
                onClick={() => onRestore(shot)}
                title="回到该机位"
                className="block w-full"
              >
                <div className="h-[76px] w-full bg-ink-50">
                  <CameraPreview scene={scene} camera={shot.camera} width={136} height={76} compact />
                </div>
              </button>
              <div className="flex items-center gap-1 px-2 py-1.5">
                {renamingId === shot.id ? (
                  <InlineRename
                    value={shot.name}
                    onCommit={(next) => onRename(shot.id, next)}
                    onCancel={onCancelRename}
                  />
                ) : (
                  <>
                    <span
                      onDoubleClick={() => onStartRename(shot.id)}
                      className="min-w-0 flex-1 truncate text-[11px] text-ink-700"
                      title="双击重命名"
                    >
                      {shot.name}
                    </span>
                    <span className="shrink-0 font-mono text-[9px] text-ink-400">
                      {Math.round(shot.camera.fov)}°
                    </span>
                  </>
                )}
              </div>
              <button
                type="button"
                aria-label="删除镜头"
                onClick={() => onDelete(shot.id)}
                className="absolute right-1 top-1 rounded-md bg-surface/90 p-1 text-ink-400 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
              >
                <IconTrash size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ *
 * Properties
 * ------------------------------------------------------------------ */

function PropertiesPanel({
  scene,
  selection,
  showGuides,
  snapToGrid,
  onToggleGuides,
  onToggleSnap,
  onPatchCamera,
  onPatchActor,
  onPatchProp,
  onSetActiveCamera,
  onDelete,
}: {
  scene: DirectorScene
  selection: SceneSelection | null
  showGuides: boolean
  snapToGrid: boolean
  onToggleGuides: (next: boolean) => void
  onToggleSnap: (next: boolean) => void
  onPatchCamera: (id: string, patch: Partial<Camera>) => void
  onPatchActor: (id: string, patch: Partial<Actor>) => void
  onPatchProp: (id: string, patch: Partial<Prop>) => void
  onSetActiveCamera: (id: string) => void
  onDelete: () => void
}) {
  const lookAtMenu = useMenuAnchor()
  const object = selection ? findObject(scene, selection) : null

  return (
    <aside
      data-testid="director-props"
      className="flex w-[290px] shrink-0 flex-col border-l border-ink-100 bg-surface"
    >
      <div className="thin-scrollbar flex-1 space-y-4 overflow-y-auto p-4">
        {!selection || !object ? (
          <EmptyState
            icon={<IconCursor size={26} />}
            title="未选中对象"
            description="在左侧列表或俯视图中选择机位、角色或道具后，这里会显示它的参数。"
          />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="rounded bg-ink-100 px-1.5 py-px text-[10px] text-ink-500">
                {selection.kind === 'camera' ? '机位' : selection.kind === 'actor' ? '角色' : '道具'}
              </span>
              <button
                type="button"
                onClick={onDelete}
                className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-ink-400 transition-colors hover:bg-danger/8 hover:text-danger"
              >
                <IconTrash size={12} />
                删除
              </button>
            </div>

            <Field label="名称">
              <input
                value={object.name}
                onChange={(event) => {
                  const name = event.target.value
                  if (selection.kind === 'camera') onPatchCamera(selection.id, { name })
                  else if (selection.kind === 'actor') onPatchActor(selection.id, { name })
                  else onPatchProp(selection.id, { name })
                }}
                className="w-full rounded-lg border border-ink-200 px-2.5 py-1.5 text-[13px] outline-none transition-colors focus:border-accent"
              />
            </Field>

            <Field label="位置">
              <div className="space-y-2">
                <Slider
                  label="X 横向"
                  min={-20}
                  max={20}
                  step={0.05}
                  value={round2(object.position.x)}
                  format={(value) => `${value.toFixed(2)} m`}
                  onChange={(value) => patchPosition(selection, { x: value })}
                />
                <Slider
                  label="Z 纵深"
                  min={-20}
                  max={20}
                  step={0.05}
                  value={round2(object.position.z)}
                  format={(value) => `${value.toFixed(2)} m`}
                  onChange={(value) => patchPosition(selection, { z: value })}
                />
                <Slider
                  label={selection.kind === 'camera' ? 'Y 机位高度' : 'Y 离地高度'}
                  min={0}
                  max={selection.kind === 'camera' ? 5 : 4}
                  step={0.01}
                  value={round2(object.position.y)}
                  format={(value) => `${value.toFixed(2)} m`}
                  onChange={(value) => patchPosition(selection, { y: value })}
                />
              </div>
            </Field>

            <Field
              label="朝向"
              hint={
                selection.kind === 'camera' && (object as Camera).lookAtActorId
                  ? '当前由「看向」目标接管，调整会解除锁定'
                  : undefined
              }
            >
              <Slider
                label="Yaw"
                min={0}
                max={359}
                step={1}
                value={Math.round(normalizeAngle(object.rotationY))}
                format={(value) => `${value}°`}
                onChange={(value) => {
                  if (selection.kind === 'camera') {
                    onPatchCamera(selection.id, { rotationY: value, lookAtActorId: null })
                  } else if (selection.kind === 'actor') {
                    onPatchActor(selection.id, { rotationY: value })
                  } else {
                    onPatchProp(selection.id, { rotationY: value })
                  }
                }}
              />
            </Field>

            {selection.kind === 'camera' && (
              <CameraFields
                scene={scene}
                camera={object as Camera}
                menu={lookAtMenu}
                onPatch={(patch) => onPatchCamera(selection.id, patch)}
                onSetActive={() => onSetActiveCamera(selection.id)}
              />
            )}

            {selection.kind === 'actor' && (
              <ActorFields actor={object as Actor} onPatch={(patch) => onPatchActor(selection.id, patch)} />
            )}

            {selection.kind === 'prop' && (
              <PropFields prop={object as Prop} onPatch={(patch) => onPatchProp(selection.id, patch)} />
            )}
          </>
        )}

        <div className="border-t border-ink-100 pt-3">
          <div className="pb-1 text-[12px] font-medium text-ink-500">视图</div>
          <Toggle checked={showGuides} onChange={onToggleGuides} label="三分构图线" description="仅显示在机位预览中" />
          <Toggle checked={snapToGrid} onChange={onToggleSnap} label="网格吸附" description="拖拽时对齐到 0.25 m" />
        </div>
      </div>
    </aside>
  )

  function patchPosition(target: SceneSelection, patch: Partial<{ x: number; y: number; z: number }>) {
    const current = findObject(scene, target)
    if (!current) return
    const position = { ...current.position, ...patch }
    if (target.kind === 'camera') onPatchCamera(target.id, { position })
    else if (target.kind === 'actor') onPatchActor(target.id, { position })
    else onPatchProp(target.id, { position })
  }
}

function CameraFields({
  scene,
  camera,
  menu,
  onPatch,
  onSetActive,
}: {
  scene: DirectorScene
  camera: Camera
  menu: ReturnType<typeof useMenuAnchor>
  onPatch: (patch: Partial<Camera>) => void
  onSetActive: () => void
}) {
  const target = scene.actors.find((actor) => actor.id === camera.lookAtActorId) ?? null
  const sections: MenuSection[] = [
    {
      title: '看向目标',
      items: [
        {
          id: 'none',
          label: '不锁定',
          checked: !camera.lookAtActorId,
          onSelect: () => onPatch({ lookAtActorId: null }),
        },
        ...scene.actors.map((actor) => ({
          id: actor.id,
          label: actor.name,
          checked: actor.id === camera.lookAtActorId,
          onSelect: () => onPatch({ lookAtActorId: actor.id }),
        })),
      ],
    },
  ]

  return (
    <>
      {scene.activeCameraId !== camera.id && (
        <button
          type="button"
          onClick={onSetActive}
          className="w-full rounded-lg bg-ink-100 py-1.5 text-[12px] font-medium text-ink-700 transition-colors hover:bg-ink-200"
        >
          设为当前机位
        </button>
      )}

      <Field label="视场角" hint="越小越长焦，压缩纵深；越大越广角">
        <Slider
          label="FOV"
          min={12}
          max={110}
          step={1}
          value={Math.round(camera.fov)}
          format={(value) => `${value}°`}
          onChange={(value) => onPatch({ fov: value })}
        />
      </Field>

      <Field label="画幅比例">
        <div className="flex flex-wrap gap-1.5">
          {ASPECT_RATIOS.map((option) => (
            <button
              key={option.id}
              type="button"
              data-testid={`director-aspect-${option.id}`}
              onClick={() => onPatch({ aspectRatio: option.id as AspectRatioId })}
              className={cn(
                'rounded-full px-2.5 py-1 text-[11px] transition-colors',
                option.id === camera.aspectRatio
                  ? 'bg-ink-900 text-white'
                  : 'bg-ink-100 text-ink-600 hover:bg-ink-200',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="看向" hint={target ? '机位会持续对准该角色' : undefined}>
        <button
          type="button"
          onClick={(event) => menu.openFrom(event)}
          className="flex w-full items-center gap-2 rounded-lg border border-ink-200 px-2.5 py-1.5 text-left text-[13px] transition-colors hover:border-ink-300"
        >
          <span className={cn('flex-1 truncate', target ? 'text-ink-900' : 'text-ink-400')}>
            {target?.name ?? '不锁定'}
          </span>
          <IconChevronDown size={14} className="text-ink-400" />
        </button>
        {menu.anchor && <Menu sections={sections} anchor={menu.anchor} onClose={menu.close} width={200} />}
      </Field>
    </>
  )
}

function ActorFields({ actor, onPatch }: { actor: Actor; onPatch: (patch: Partial<Actor>) => void }) {
  const [category, setCategory] = useState<PoseCategory | '全部'>('全部')
  const poses = useMemo(
    () => (category === '全部' ? POSE_PRESETS : POSE_PRESETS.filter((pose) => pose.category === category)),
    [category],
  )

  return (
    <>
      <Field label="身高">
        <Slider
          label="Height"
          min={1.2}
          max={2.2}
          step={0.01}
          value={actor.height}
          format={(value) => `${value.toFixed(2)} m`}
          onChange={(value) => onPatch({ height: value })}
        />
      </Field>

      <Field label={`姿态 · ${poseLabel(actor.pose)}`}>
        <div className="flex flex-wrap gap-1 pb-2">
          {(['全部', ...POSE_CATEGORIES] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] transition-colors',
                item === category ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200',
              )}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="thin-scrollbar grid max-h-[260px] grid-cols-3 gap-1.5 overflow-y-auto pr-1">
          {poses.map((pose) => (
            <button
              key={pose.id}
              type="button"
              data-testid={`director-pose-${pose.id}`}
              onClick={() => onPatch({ pose: pose.id as PoseId })}
              className={cn(
                'flex flex-col items-center rounded-lg py-1 ring-1 transition-colors',
                pose.id === actor.pose
                  ? 'bg-accent-soft ring-accent'
                  : 'bg-ink-50 ring-transparent hover:bg-ink-100',
              )}
            >
              <PoseGlyph pose={pose.id} active={pose.id === actor.pose} />
              <span className="text-[10px] text-ink-600">{pose.label}</span>
            </button>
          ))}
        </div>
      </Field>
    </>
  )
}

function PropFields({ prop, onPatch }: { prop: Prop; onPatch: (patch: Partial<Prop>) => void }) {
  return (
    <>
      <Field label="类型">
        <div className="flex flex-wrap gap-1.5">
          {PROP_KINDS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onPatch({ kind: option.id as PropKind, size: propKindSize(option.id) })}
              className={cn(
                'rounded-full px-2.5 py-1 text-[11px] transition-colors',
                option.id === prop.kind ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="尺寸">
        <div className="space-y-2">
          <Slider
            label="宽 W"
            min={0.1}
            max={8}
            step={0.05}
            value={prop.size.w}
            format={(value) => `${value.toFixed(2)} m`}
            onChange={(value) => onPatch({ size: { ...prop.size, w: value } })}
          />
          <Slider
            label="深 D"
            min={0.1}
            max={8}
            step={0.05}
            value={prop.size.d}
            format={(value) => `${value.toFixed(2)} m`}
            onChange={(value) => onPatch({ size: { ...prop.size, d: value } })}
          />
          <Slider
            label="高 H"
            min={0.1}
            max={6}
            step={0.05}
            value={prop.size.h}
            format={(value) => `${value.toFixed(2)} m`}
            onChange={(value) => onPatch({ size: { ...prop.size, h: value } })}
          />
        </div>
      </Field>
    </>
  )
}

/** Three-quarter view of a pose, used by the picker. */
function PoseGlyph({ pose, active }: { pose: PoseId; active: boolean }) {
  const width = 40
  const height = 46
  const unit = 40
  const skeleton = poseSkeleton(pose)
  const at = (joint: JointId) => {
    const point = projectBodyPoint(skeleton[joint], 38)
    return { x: width / 2 + point.x * unit, y: height - 3 + point.y * unit }
  }
  const head = at('head')
  const stroke = active ? 'var(--color-accent)' : 'var(--color-ink-500)'

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <g stroke={stroke} strokeWidth={1.4} strokeLinecap="round" fill="none">
        {POSE_BONES.map((bone) => {
          const from = at(bone.from)
          const to = at(bone.to)
          return (
            <line
              key={`${bone.from}-${bone.to}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              strokeWidth={bone.weight === 'torso' ? 1.9 : bone.weight === 'limb' ? 1.3 : 0.9}
            />
          )
        })}
      </g>
      <circle cx={head.x} cy={head.y} r={unit * BODY.headRadius} fill="var(--color-surface)" stroke={stroke} strokeWidth={1.3} />
    </svg>
  )
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function findObject(
  scene: DirectorScene,
  selection: SceneSelection,
): Camera | Actor | Prop | null {
  if (selection.kind === 'camera') return scene.cameras.find((item) => item.id === selection.id) ?? null
  if (selection.kind === 'actor') return scene.actors.find((item) => item.id === selection.id) ?? null
  return scene.props.find((item) => item.id === selection.id) ?? null
}

/** `角色 3` where 1 and 2 already exist, even after deletes in the middle. */
function nextName(list: { name: string }[], prefix: string): string {
  let highest = 0
  for (const item of list) {
    const match = item.name.match(new RegExp(`^${prefix}\\s*(\\d+)$`))
    if (match) highest = Math.max(highest, Number(match[1]))
  }
  return `${prefix} ${Math.max(highest + 1, list.length + 1)}`
}

/** Drop new objects near the middle of the action, nudged clear of neighbours. */
function openSpot(scene: DirectorScene): GroundPoint {
  const actors = scene.actors
  const base =
    actors.length > 0
      ? {
          x: actors.reduce((sum, actor) => sum + actor.position.x, 0) / actors.length,
          z: actors.reduce((sum, actor) => sum + actor.position.z, 0) / actors.length,
        }
      : { x: 0, z: 0 }
  const count = actors.length + scene.props.length
  const angle = (count * 137 * Math.PI) / 180
  return { x: round2(base.x + Math.cos(angle) * 1.4), z: round2(base.z + Math.sin(angle) * 1.4) }
}

/** New actors face the active camera — the framing a director expects to see. */
function aimAtCamera(scene: DirectorScene, spot: GroundPoint): number {
  const camera = activeCamera(scene)
  if (!camera) return 180
  return normalizeAngle(
    (Math.atan2(camera.position.x - spot.x, camera.position.z - spot.z) * 180) / Math.PI,
  )
}

export type { CapturedShot, DirectorScene }
