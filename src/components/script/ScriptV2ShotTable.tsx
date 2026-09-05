'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import {
  clampScriptV2Duration,
  SCRIPT_V2_MAX_DURATION_SECONDS,
  SCRIPT_V2_MIN_DURATION_SECONDS,
  SCRIPT_V2_SHOT_SIZES,
  type ScriptV2Row,
  type ScriptV2RowPatch,
  type ScriptV2ColorLabel,
  type ScriptV2ShotSize,
} from '@/domain/script-v2'
import { cn } from '@/lib/cn'
import { IconCheck, IconClose, IconMore, IconTrash } from '../icons'
import { ConfirmDialog } from '../ui/Dialog'
import { Menu } from '../ui/Menu'
import { useScriptV2DialogFocus } from './ScriptV2Dialogs'

export interface ScriptV2ShotTableProps {
  rows: ScriptV2Row[]
  onPatch: (rowId: string, patch: ScriptV2RowPatch, label: string) => void
  onMove: (from: number, to: number) => void
  onDelete: (rowId: string, shotNumber: number) => void
  onOpenPrompt?: (rowId: string) => void
  onChildSurfaceChange?: (open: boolean) => void
}

const HEADERS = [
  '镜号',
  '时长',
  '画面描述',
  '景别',
  '光影氛围',
  '对白·旁白',
  '音效',
  '运镜',
  '最终提示词',
  '操作',
] as const

type TextField =
  | 'plotDescription'
  | 'lightingAndAtmosphere'
  | 'dialogue'
  | 'audioEffects'
  | 'cameraMovement'

interface AnchorPoint {
  left: number
  top: number
}

type ActiveEditor =
  | { kind: 'duration'; row: ScriptV2Row; anchor: AnchorPoint; trigger: HTMLButtonElement }
  | { kind: 'shotSize'; row: ScriptV2Row; anchor: AnchorPoint; trigger: HTMLButtonElement }
  | { kind: 'text'; row: ScriptV2Row; field: TextField; anchor: AnchorPoint; trigger: HTMLButtonElement }

const TEXT_FIELDS: Record<TextField, { label: string; placeholder: string }> = {
  plotDescription: { label: '画面描述', placeholder: '描述镜头中发生的画面与动作' },
  lightingAndAtmosphere: { label: '光影氛围', placeholder: '描述灯光、色彩与环境氛围' },
  dialogue: { label: '对白·旁白', placeholder: '输入角色对白或旁白' },
  audioEffects: { label: '音效', placeholder: '输入环境声、动作声或拟音' },
  cameraMovement: { label: '运镜', placeholder: '描述推、拉、摇、移等镜头运动' },
}

function anchorFrom(element: HTMLElement): AnchorPoint {
  const rect = element.getBoundingClientRect()
  return { left: rect.left, top: rect.bottom + 8 }
}

function textValue(row: ScriptV2Row, field: TextField): string {
  return field === 'cameraMovement' ? row.cinematics?.cameraMovement ?? '' : row[field]
}

function textPatch(row: ScriptV2Row, field: TextField, value: string): ScriptV2RowPatch {
  if (field === 'cameraMovement') {
    return { cinematics: { ...row.cinematics, cameraMovement: value } }
  }
  return { [field]: value }
}

/** Semantic, horizontally scrollable stage-one table with viewport-local editors. */
export function ScriptV2ShotTable({
  rows,
  onPatch,
  onMove,
  onDelete,
  onOpenPrompt,
  onChildSurfaceChange,
}: ScriptV2ShotTableProps) {
  const [editor, setEditor] = useState<ActiveEditor | null>(null)
  const [visualRows, setVisualRows] = useState(rows)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const dragOriginRef = useRef<string[]>([])
  const dragSettledRef = useRef(false)
  const visualRowsRef = useRef(visualRows)
  const [actionMenu, setActionMenu] = useState<{
    row: ScriptV2Row
    anchor: { x: number; y: number }
  } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ScriptV2Row | null>(null)
  const hasEditor = editor !== null || actionMenu !== null || deleteTarget !== null

  visualRowsRef.current = visualRows

  useEffect(() => {
    if (!draggedId) {
      visualRowsRef.current = rows
      setVisualRows(rows)
    }
  }, [draggedId, rows])

  useEffect(() => {
    onChildSurfaceChange?.(hasEditor)
  }, [hasEditor, onChildSurfaceChange])

  useEffect(
    () => () => {
      onChildSurfaceChange?.(false)
    },
    [onChildSurfaceChange],
  )

  const closeEditor = useCallback(() => setEditor(null), [])

  return (
    <div className="thin-scrollbar min-h-0 flex-1 overflow-auto bg-[#171717]">
      <table aria-label="镜头字段" className="w-full min-w-[1380px] table-fixed border-collapse text-left">
        <colgroup>
          <col className="w-[82px]" />
          <col className="w-[88px]" />
          <col className="w-[300px]" />
          <col className="w-[108px]" />
          <col className="w-[160px]" />
          <col className="w-[170px]" />
          <col className="w-[130px]" />
          <col className="w-[130px]" />
          <col className="w-[160px]" />
          <col className="w-[70px]" />
        </colgroup>
        <thead className="sticky top-0 z-20 bg-[#222222]">
          <tr>
            {HEADERS.map((header, index) => (
              <th
                key={header}
                scope="col"
                className={cn(
                  'h-12 border-b border-r border-white/8 px-3 text-[11px] font-normal text-white/42 last:border-r-0',
                  index === 0 && 'sticky left-0 z-30 bg-[#222222]',
                  index === HEADERS.length - 1 && 'sticky right-0 z-30 bg-[#222222]',
                )}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visualRows.map((sourceRow, visualIndex) => {
            const row = sourceRow.shotNumber === visualIndex + 1
              ? sourceRow
              : { ...sourceRow, shotNumber: visualIndex + 1 }
            return (
            <tr
              key={row.id}
              data-testid={`script-v2-shot-row-${row.id}`}
              data-shot-id={row.id}
              data-color-label={row.colorLabel ?? 'none'}
              className="group/row bg-[#1b1b1b] hover:bg-[#202020]"
              onDragEnter={(event) => {
                if (!draggedId || draggedId === row.id) return
                event.preventDefault()
                setVisualRows((current) => {
                  const from = current.findIndex((candidate) => candidate.id === draggedId)
                  const to = current.findIndex((candidate) => candidate.id === row.id)
                  if (from < 0 || to < 0 || from === to) return current
                  const next = [...current]
                  const [dragged] = next.splice(from, 1)
                  next.splice(to, 0, dragged)
                  visualRowsRef.current = next
                  return next
                })
              }}
              onDragOver={(event) => {
                if (draggedId) event.preventDefault()
              }}
              onDrop={(event) => {
                if (!draggedId) return
                event.preventDefault()
                settleDrag(onMove, draggedId, dragOriginRef.current, visualRowsRef.current, dragSettledRef)
                setDraggedId(null)
              }}
            >
              <Cell sticky="left">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    draggable
                    aria-label={`拖动镜头 ${row.shotNumber}`}
                    onDragStart={(event) => {
                      dragOriginRef.current = visualRowsRef.current.map((candidate) => candidate.id)
                      dragSettledRef.current = false
                      setDraggedId(row.id)
                      event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer.setData('text/plain', row.id)
                    }}
                    onDragEnd={() => {
                      settleDrag(onMove, row.id, dragOriginRef.current, visualRowsRef.current, dragSettledRef)
                      setDraggedId(null)
                    }}
                    className="grid cursor-grab grid-cols-2 gap-[2px] rounded p-1 text-white/20 hover:text-white/48 active:cursor-grabbing"
                  >
                    {Array.from({ length: 6 }).map((_, index) => (
                      <span key={index} className="h-[2px] w-[2px] rounded-full bg-current" />
                    ))}
                  </button>
                  <span className="font-medium text-white/72">
                    <span className="sr-only">镜头 </span>
                    {row.shotNumber}
                  </span>
                </div>
              </Cell>
              <Cell>
                <CellButton
                  ariaLabel={`镜头 ${row.shotNumber} 时长 ${row.durationSeconds} 秒`}
                  onClick={(element) => setEditor({ kind: 'duration', row, anchor: anchorFrom(element), trigger: element })}
                >
                  <span aria-hidden="true">{row.durationSeconds}s</span>
                  <span className="sr-only">{row.durationSeconds} 秒</span>
                </CellButton>
              </Cell>
              <Cell>
                <CellButton
                  ariaLabel={`编辑镜头 ${row.shotNumber} 画面描述`}
                  onClick={(element) => setEditor({ kind: 'text', row, field: 'plotDescription', anchor: anchorFrom(element), trigger: element })}
                  multiline
                >
                  {row.plotDescription || '+'}
                </CellButton>
              </Cell>
              <Cell>
                <CellButton
                  ariaLabel={`镜头 ${row.shotNumber} 景别 ${row.shotSize}`}
                  onClick={(element) => setEditor({ kind: 'shotSize', row, anchor: anchorFrom(element), trigger: element })}
                >
                  {row.shotSize}
                </CellButton>
              </Cell>
              <Cell>
                <CellButton
                  ariaLabel={`编辑镜头 ${row.shotNumber} 光影氛围`}
                  onClick={(element) => setEditor({ kind: 'text', row, field: 'lightingAndAtmosphere', anchor: anchorFrom(element), trigger: element })}
                  multiline
                >
                  {row.lightingAndAtmosphere || '+'}
                </CellButton>
              </Cell>
              <Cell>
                <CellButton
                  ariaLabel={`编辑镜头 ${row.shotNumber} 对白·旁白`}
                  onClick={(element) => setEditor({ kind: 'text', row, field: 'dialogue', anchor: anchorFrom(element), trigger: element })}
                  multiline
                >
                  {row.dialogue || row.voiceover || '+'}
                </CellButton>
              </Cell>
              <Cell>
                <CellButton
                  ariaLabel={`编辑镜头 ${row.shotNumber} 音效`}
                  onClick={(element) => setEditor({ kind: 'text', row, field: 'audioEffects', anchor: anchorFrom(element), trigger: element })}
                  multiline
                >
                  {row.audioEffects || row.sfx || '+'}
                </CellButton>
              </Cell>
              <Cell>
                <CellButton
                  ariaLabel={`编辑镜头 ${row.shotNumber} 运镜`}
                  onClick={(element) => setEditor({ kind: 'text', row, field: 'cameraMovement', anchor: anchorFrom(element), trigger: element })}
                  multiline
                >
                  {row.cinematics?.cameraMovement || '+'}
                </CellButton>
              </Cell>
              <Cell>
                <button
                  type="button"
                  aria-label={`查看镜头 ${row.shotNumber} 最终提示词`}
                  onClick={() => onOpenPrompt?.(row.id)}
                  className="rounded-md px-1 py-1 text-left text-[11px] text-white/45 hover:bg-white/7 hover:text-white/75"
                >
                  {row.imageGenerationPrompt || row.videoMotionPrompt ? '点击查看提示词' : '待生成提示词'}
                </button>
              </Cell>
              <Cell sticky="right">
                <button
                  type="button"
                  aria-label={`镜头 ${row.shotNumber} 行操作`}
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect()
                    setActionMenu({ row, anchor: { x: rect.right, y: rect.bottom + 6 } })
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-white/35 hover:bg-white/7 hover:text-white/75"
                >
                  <IconMore size={14} />
                </button>
              </Cell>
            </tr>
            )
          })}
        </tbody>
      </table>

      {actionMenu && (
        <div aria-label="镜头行操作" role="menu">
          <Menu
            align="end"
            anchor={actionMenu.anchor}
            onClose={() => setActionMenu(null)}
            width={176}
            sections={[
              {
                title: '颜色标签',
                items: colorMenuItems(actionMenu.row, (colorLabel) => {
                  onPatch(
                    actionMenu.row.id,
                    { colorLabel },
                    `${colorLabel ? '设置' : '清除'}镜头 ${actionMenu.row.shotNumber} 颜色`,
                  )
                }),
              },
              {
                items: [
                  {
                    id: 'delete',
                    label: '删除镜头',
                    danger: true,
                    icon: <IconTrash size={14} />,
                    onSelect: () => setDeleteTarget(actionMenu.row),
                  },
                ],
              },
            ]}
          />
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`删除镜头 ${deleteTarget?.shotNumber ?? ''}？`}
        description="删除后其镜头编号会自动顺延，此操作可通过画布历史撤销。"
        confirmLabel="删除"
        danger
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return
          onDelete(deleteTarget.id, deleteTarget.shotNumber)
          setDeleteTarget(null)
        }}
      />

      {editor?.kind === 'duration' && (
        <DurationEditor
          key={`duration-${editor.row.id}`}
          row={editor.row}
          anchor={editor.anchor}
          restoreFocusTarget={editor.trigger}
          onCommit={(durationSeconds) =>
            onPatch(editor.row.id, { durationSeconds }, `修改镜头 ${editor.row.shotNumber} 时长`)
          }
          onClose={closeEditor}
        />
      )}
      {editor?.kind === 'shotSize' && (
        <ShotSizeEditor
          key={`shot-size-${editor.row.id}`}
          row={editor.row}
          anchor={editor.anchor}
          restoreFocusTarget={editor.trigger}
          onCommit={(shotSize) =>
            onPatch(editor.row.id, { shotSize }, `修改镜头 ${editor.row.shotNumber} 景别`)
          }
          onClose={closeEditor}
        />
      )}
      {editor?.kind === 'text' && (
        <TextEditor
          key={`${editor.field}-${editor.row.id}`}
          row={editor.row}
          field={editor.field}
          anchor={editor.anchor}
          restoreFocusTarget={editor.trigger}
          onCommit={(value) =>
            onPatch(
              editor.row.id,
              textPatch(editor.row, editor.field, value),
              `修改镜头 ${editor.row.shotNumber} ${TEXT_FIELDS[editor.field].label}`,
            )
          }
          onClose={closeEditor}
        />
      )}
    </div>
  )
}

function settleDrag(
  onMove: (from: number, to: number) => void,
  draggedId: string,
  originIds: string[],
  currentRows: ScriptV2Row[],
  settledRef: { current: boolean },
) {
  if (settledRef.current) return
  settledRef.current = true
  const from = originIds.indexOf(draggedId)
  const to = currentRows.findIndex((row) => row.id === draggedId)
  if (from >= 0 && to >= 0 && from !== to) onMove(from, to)
}

const COLOR_OPTIONS: Array<{
  id: Exclude<ScriptV2ColorLabel, null>
  label: string
  color: string
}> = [
  { id: 'red', label: '红色', color: '#f26f76' },
  { id: 'yellow', label: '黄色', color: '#f0c85b' },
  { id: 'green', label: '绿色', color: '#5fca8e' },
  { id: 'blue', label: '蓝色', color: '#64a6f4' },
  { id: 'gray', label: '灰色', color: '#9398a0' },
]

function colorMenuItems(
  row: ScriptV2Row,
  onSelect: (color: ScriptV2ColorLabel) => void,
) {
  return [
    {
      id: 'clear-color',
      label: '清除颜色',
      disabled: row.colorLabel === null,
      disabledReason: '当前镜头没有颜色标签',
      checked: row.colorLabel === null,
      onSelect: () => onSelect(null),
    },
    ...COLOR_OPTIONS.map((option) => ({
      id: `color-${option.id}`,
      label: option.label,
      checked: row.colorLabel === option.id,
      icon: (
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: option.color }}
        />
      ),
      onSelect: () => onSelect(option.id),
    })),
  ]
}

function CellButton({
  ariaLabel,
  children,
  multiline,
  onClick,
}: {
  ariaLabel: string
  children: ReactNode
  multiline?: boolean
  onClick: (element: HTMLButtonElement) => void
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={(event) => onClick(event.currentTarget)}
      className={cn(
        '-m-1 min-h-7 w-[calc(100%+8px)] rounded-md p-1 text-left text-[11px] text-white/72 hover:bg-white/7',
        multiline && 'line-clamp-3 leading-relaxed',
      )}
    >
      {children}
    </button>
  )
}

function Cell({ children, sticky }: { children: ReactNode; sticky?: 'left' | 'right' }) {
  return (
    <td
      className={cn(
        'h-[112px] border-b border-r border-white/8 bg-inherit px-3 py-3 align-top text-[11px] text-white/42 last:border-r-0',
        sticky === 'left' && 'sticky left-0 z-10',
        sticky === 'right' && 'sticky right-0 z-10',
      )}
    >
      {children}
    </td>
  )
}

function FloatingSurface({
  anchor,
  width,
  ariaLabel,
  surfaceRef,
  restoreFocusTarget,
  children,
}: {
  anchor: AnchorPoint
  width: number
  ariaLabel: string
  surfaceRef: React.RefObject<HTMLDivElement | null>
  restoreFocusTarget: HTMLElement
  children: ReactNode
}) {
  // Cell editors are popovers rather than modal sheets: Tab must be able to
  // leave the control so the editor's blur handler can commit the draft.
  const dialogRef = useScriptV2DialogFocus(true, {
    trap: ariaLabel === '选择景别',
    restoreFocusTarget,
  })
  const left = Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12))
  const estimatedHeight = ariaLabel === '选择景别' ? 430 : 230
  const top = Math.max(12, Math.min(anchor.top, window.innerHeight - estimatedHeight - 12))
  return (
    <div
      ref={(element) => {
        surfaceRef.current = element
        dialogRef.current = element
      }}
      role="dialog"
      aria-label={ariaLabel}
      tabIndex={-1}
      className="fixed z-[190] rounded-xl border border-white/12 bg-[#292929] p-3 text-white shadow-[0_18px_60px_rgba(0,0,0,.46)]"
      style={{ left, top, width }}
    >
      {children}
    </div>
  )
}

function useSurfaceSettlement(
  surfaceRef: React.RefObject<HTMLDivElement | null>,
  settle: () => void,
) {
  const settleRef = useRef(settle)
  settleRef.current = settle

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (surfaceRef.current?.contains(event.target as Node)) return
      settleRef.current()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      settleRef.current()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [surfaceRef])
}

function DurationEditor({
  row,
  anchor,
  restoreFocusTarget,
  onCommit,
  onClose,
}: {
  row: ScriptV2Row
  anchor: AnchorPoint
  restoreFocusTarget: HTMLElement
  onCommit: (value: number) => void
  onClose: () => void
}) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const settledRef = useRef(false)
  const internalPointerRef = useRef(false)
  const [draft, setDraft] = useState(String(row.durationSeconds))

  const settle = useCallback(() => {
    if (settledRef.current) return
    settledRef.current = true
    const value = clampScriptV2Duration(Number(draft))
    if (value !== row.durationSeconds) onCommit(value)
    onClose()
  }, [draft, onClose, onCommit, row.durationSeconds])

  useSurfaceSettlement(surfaceRef, settle)

  const nudge = (delta: number) => {
    const value = clampScriptV2Duration(Number(draft) + delta)
    setDraft(String(value))
  }

  return (
    <FloatingSurface anchor={anchor} width={252} ariaLabel="设置镜头时长" surfaceRef={surfaceRef} restoreFocusTarget={restoreFocusTarget}>
      <div
        onPointerDownCapture={() => {
          internalPointerRef.current = true
          queueMicrotask(() => {
            internalPointerRef.current = false
          })
        }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[12px] font-medium text-white/88">设置镜头时长</h3>
          <button type="button" tabIndex={-1} aria-label="关闭时长设置" onClick={settle} className="rounded-md p-1 text-white/35 hover:bg-white/8 hover:text-white/75">
            <IconClose size={13} />
          </button>
        </div>
        <label className="block text-[10px] text-white/42" htmlFor={`duration-${row.id}`}>
          镜头时长（秒）
        </label>
        <div className="mt-1.5 flex h-9 overflow-hidden rounded-lg border border-white/12 bg-black/15 focus-within:border-white/30">
          <button type="button" aria-label="减少一秒" onClick={() => nudge(-1)} className="w-9 border-r border-white/10 text-white/55 hover:bg-white/7">−</button>
          <input
            id={`duration-${row.id}`}
            autoFocus
            type="number"
            min={SCRIPT_V2_MIN_DURATION_SECONDS}
            max={SCRIPT_V2_MAX_DURATION_SECONDS}
            step={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              if (!internalPointerRef.current) settle()
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                settle()
              }
            }}
            className="min-w-0 flex-1 bg-transparent px-2 text-center text-[12px] text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <button type="button" aria-label="增加一秒" onClick={() => nudge(1)} className="w-9 border-l border-white/10 text-white/55 hover:bg-white/7">+</button>
        </div>
        <p className="mt-2 text-[10px] text-white/34">范围 5–15 秒；失焦自动保存</p>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={settle}
          className="mt-3 h-8 w-full rounded-lg bg-white text-[11px] font-medium text-[#202020] hover:bg-white/90"
        >
          保存
        </button>
      </div>
    </FloatingSurface>
  )
}

function ShotSizeEditor({
  row,
  anchor,
  restoreFocusTarget,
  onCommit,
  onClose,
}: {
  row: ScriptV2Row
  anchor: AnchorPoint
  restoreFocusTarget: HTMLElement
  onCommit: (value: ScriptV2ShotSize) => void
  onClose: () => void
}) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => onClose(), [onClose])
  useSurfaceSettlement(surfaceRef, close)

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'))
    const current = options.indexOf(document.activeElement as HTMLButtonElement)
    const delta = event.key === 'ArrowDown' ? 1 : -1
    options[(current + delta + options.length) % options.length]?.focus()
  }

  return (
    <FloatingSurface anchor={anchor} width={184} ariaLabel="选择景别" surfaceRef={surfaceRef} restoreFocusTarget={restoreFocusTarget}>
      <div role="listbox" aria-label="选择景别" className="max-h-[400px] overflow-y-auto" onKeyDown={onKeyDown}>
        {SCRIPT_V2_SHOT_SIZES.map((shotSize) => (
          <button
            key={shotSize}
            type="button"
            role="option"
            aria-selected={shotSize === row.shotSize}
            autoFocus={shotSize === row.shotSize}
            onClick={() => {
              if (shotSize !== row.shotSize) onCommit(shotSize)
              onClose()
            }}
            className={cn(
              'flex h-8 w-full items-center rounded-lg px-2.5 text-left text-[11px] text-white/68 hover:bg-white/8 hover:text-white',
              shotSize === row.shotSize && 'bg-white/7 text-white',
            )}
          >
            <span className="flex-1">{shotSize}</span>
            {shotSize === row.shotSize && <IconCheck size={13} className="text-emerald-300" />}
          </button>
        ))}
      </div>
    </FloatingSurface>
  )
}

function TextEditor({
  row,
  field,
  anchor,
  restoreFocusTarget,
  onCommit,
  onClose,
}: {
  row: ScriptV2Row
  field: TextField
  anchor: AnchorPoint
  restoreFocusTarget: HTMLElement
  onCommit: (value: string) => void
  onClose: () => void
}) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const settledRef = useRef(false)
  const initial = textValue(row, field)
  const [draft, setDraft] = useState(initial)
  const config = TEXT_FIELDS[field]

  const settle = useCallback(() => {
    if (settledRef.current) return
    settledRef.current = true
    if (draft !== initial) onCommit(draft)
    onClose()
  }, [draft, initial, onClose, onCommit])

  useSurfaceSettlement(surfaceRef, settle)

  return (
    <FloatingSurface anchor={anchor} width={340} ariaLabel={`编辑${config.label}`} surfaceRef={surfaceRef} restoreFocusTarget={restoreFocusTarget}>
      <div className="mb-2 flex items-center justify-between">
        <label htmlFor={`${field}-${row.id}`} className="text-[12px] font-medium text-white/88">
          {config.label}
        </label>
        <button
          type="button"
          tabIndex={-1}
          aria-label={`关闭${config.label}编辑`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={settle}
          className="rounded-md p-1 text-white/35 hover:bg-white/8 hover:text-white/75"
        >
          <IconClose size={13} />
        </button>
      </div>
      <textarea
        id={`${field}-${row.id}`}
        autoFocus
        value={draft}
        rows={5}
        placeholder={config.placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => {
          if (surfaceRef.current?.contains(event.relatedTarget as Node | null)) return
          settle()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            settle()
          }
        }}
        className="w-full resize-none rounded-lg border border-white/12 bg-black/15 p-2.5 text-[11px] leading-relaxed text-white/82 outline-none placeholder:text-white/22 focus:border-white/28"
      />
      <p className="mt-2 text-[10px] text-white/32">失焦自动保存 · ⌘↵ 完成</p>
    </FloatingSurface>
  )
}
