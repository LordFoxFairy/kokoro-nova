'use client'

import { useRef } from 'react'
import { useReactFlow } from '@xyflow/react'
import { NODE_META } from '@/domain/nodes'
import type { NodeType } from '@/domain/types'
import { cn } from '@/lib/cn'
import { useEditor } from '@/lib/editor-store'
import { Menu, useMenuAnchor, type MenuItem, type MenuSection } from '../ui/Menu'
import { Tooltip } from '../ui/Tooltip'
import {
  IconArrange,
  IconCharacter,
  IconClose,
  IconCursor,
  IconEdges,
  IconHelp,
  IconHistory,
  IconKeyboard,
  IconMagnet,
  IconMaterial,
  IconMinimap,
  IconPlus,
  IconSidebar,
  IconToolbox,
  IconUpload,
} from '../icons'
import { NODE_ICON } from './node-visuals'

export const CANVAS_TOOLBAR_RESPONSIVE_BREAKPOINT = 1100

const CANVAS_TOOLBAR_RESPONSIVE_STYLES = `
@media (max-width: ${CANVAS_TOOLBAR_RESPONSIVE_BREAKPOINT}px) {
  [data-testid="canvas-status-rail"] {
    left: 0.5rem;
    right: 0.5rem;
    bottom: 4.5rem;
    max-width: calc(100% - 1rem);
    overflow-x: auto;
    white-space: nowrap;
  }

  [data-testid="canvas-primary-rail"] {
    left: 0.5rem;
    right: 0.5rem;
    bottom: 0.5rem;
    max-width: calc(100% - 1rem);
    transform: none;
    /* Tailwind v4 emits translate as an individual property. Reset it too,
     * otherwise the desktop -translate-x-1/2 still moves this full-width rail
     * completely off the left edge at compact widths. */
    translate: none;
    overflow-x: auto;
    justify-content: flex-start;
  }

  [data-testid="canvas-status-rail"] > *,
  [data-testid="canvas-primary-rail"] > * {
    flex: 0 0 auto;
  }
}
`

interface BottomToolbarProps {
  onAddNode: (type: NodeType) => void
  onAutoArrange: () => void
  onOpenMaterial: (kind: 'style' | 'effect') => void
  onOpenAssetLibrary: () => void
}

/**
 * The canvas control surface.
 *
 * Left cluster: asset management, arrange, minimap, edge visibility, grid snap
 * and the zoom read-out. Center: the floating action rail. The zoom percentage
 * is a button that resets to 100%.
 */
export function BottomToolbar({
  onAddNode,
  onAutoArrange,
  onOpenMaterial,
  onOpenAssetLibrary,
}: BottomToolbarProps) {
  const flow = useReactFlow()
  const zoom = useEditor((s) => s.zoom)
  const showEdges = useEditor((s) => s.showEdges)
  const snapToGrid = useEditor((s) => s.snapToGrid)
  const showMinimap = useEditor((s) => s.showMinimap)
  const assetSidebarOpen = useEditor((s) => s.assetSidebarOpen)
  const leftPanel = useEditor((s) => s.leftPanel)
  const toolMode = useEditor((s) => s.toolMode)

  const toggleEdges = useEditor((s) => s.toggleEdges)
  const toggleSnap = useEditor((s) => s.toggleSnap)
  const toggleMinimap = useEditor((s) => s.toggleMinimap)
  const setAssetSidebar = useEditor((s) => s.setAssetSidebar)
  const setLeftPanel = useEditor((s) => s.setLeftPanel)
  const setToolMode = useEditor((s) => s.setToolMode)

  const addMenu = useMenuAnchor()
  const materialMenu = useMenuAnchor()
  const helpMenu = useMenuAnchor()
  const addNodeButtonRef = useRef<HTMLButtonElement>(null)

  // Product names track the current menu while serialized node types remain
  // stable for local documents and the future backend contract.
  const addNodeItems: MenuItem[] = [
    nodeMenuItem('text', onAddNode),
    nodeMenuItem('image', onAddNode),
    nodeMenuItem('video', onAddNode),
    nodeMenuItem('videoComposite', onAddNode, { label: '智能剪辑' }),
    nodeMenuItem('director', onAddNode),
    nodeMenuItem('scriptLegacy', onAddNode, { label: '逐帧拉片', badge: 'SD 2.5' }),
    nodeMenuItem('audio', onAddNode),
    {
      id: 'script-group',
      label: '脚本',
      icon: <NodeIcon type="script" />,
      submenu: [{ id: 'script', label: '脚本 V2', onSelect: () => onAddNode('script') }],
    },
    {
      id: 'material-group',
      label: '素材库',
      icon: <NodeIcon type="style" />,
      submenu: [
        { id: 'style', label: '风格库', onSelect: () => onOpenMaterial('style') },
        { id: 'effect', label: '特效库', onSelect: () => onOpenMaterial('effect') },
      ],
    },
  ]

  const addSections: MenuSection[] = [
    { title: '添加节点', items: addNodeItems },
    {
      title: '添加资源',
      items: [
        { id: 'upload', label: '上传', icon: <IconUpload size={15} />, onSelect: onOpenAssetLibrary },
        {
          id: 'from-history',
          label: '从生成历史选择',
          icon: <IconHistory size={15} />,
          onSelect: () => setLeftPanel('history'),
        },
      ],
    },
  ]

  return (
    <>
      <style>{CANVAS_TOOLBAR_RESPONSIVE_STYLES}</style>
      {/* Left status cluster */}
      <div
        data-testid="canvas-status-rail"
        className="pointer-events-auto absolute bottom-[18px] left-[22px] z-30 flex h-7 items-center gap-1 text-ink-600"
      >
        <button
          type="button"
          data-testid="asset-sidebar-toggle"
          onClick={() => setAssetSidebar(!assetSidebarOpen)}
          className={cn(
            'flex h-7 items-center gap-1.5 rounded-lg px-2 text-[12px] transition-colors hover:bg-ink-100',
            assetSidebarOpen && 'bg-ink-100 text-ink-900',
          )}
          aria-expanded={assetSidebarOpen}
        >
          <IconSidebar size={16} />
          资产管理
        </button>
        <ToolbarToggle label="自动整理" icon={<IconArrange size={16} />} onClick={onAutoArrange} />
        <ToolbarToggle
          label="小地图"
          icon={<IconMinimap size={16} />}
          active={showMinimap}
          onClick={toggleMinimap}
        />
        <ToolbarToggle
          label={showEdges ? '隐藏连线' : '显示连线'}
          icon={<IconEdges size={16} />}
          active={showEdges}
          onClick={toggleEdges}
          testId="toggle-edges"
        />
        <ToolbarToggle
          label="网格吸附"
          icon={<IconMagnet size={16} />}
          active={snapToGrid}
          onClick={toggleSnap}
          testId="toggle-snap"
        />
        <button
          type="button"
          data-testid="zoom-readout"
          onClick={() => flow.zoomTo(1, { duration: 200 })}
          aria-keyshortcuts="Control+0 Meta+0"
          className="h-7 rounded-lg px-2 text-[12px] tabular-nums transition-colors hover:bg-ink-100"
        >
          {Math.round(zoom * 100)}%
        </button>
      </div>

      {/* Center rail */}
      <div
        data-testid="canvas-primary-rail"
        className="pointer-events-auto absolute bottom-3 left-1/2 z-30 flex h-12 -translate-x-1/2 items-center gap-2 rounded-[13px] border border-white/8 bg-surface p-2 shadow-[var(--shadow-panel)]"
      >
        <button
          ref={addNodeButtonRef}
          type="button"
          data-testid="add-node-button"
          onClick={(e) => (addMenu.anchor ? addMenu.close() : addMenu.openFrom(e, 'above'))}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg text-white transition-colors focus-visible:outline-2 focus-visible:outline-accent',
            addMenu.anchor ? 'bg-ink-500' : 'bg-[#d5d7d9] text-[#242424] hover:bg-white',
          )}
          aria-label="添加节点"
          aria-keyshortcuts="Tab"
        >
          {addMenu.anchor ? <IconClose size={18} /> : <IconPlus size={18} />}
        </button>

        <RailButton
          label="移动工具 (V)"
          icon={<IconCursor size={18} />}
          active={toolMode === 'select'}
          onClick={() => setToolMode('select')}
          keyShortcuts="V"
        />
        <RailButton
          label="工具箱"
          icon={<IconToolbox size={18} />}
          active={leftPanel === 'toolbox'}
          onClick={() => setLeftPanel('toolbox')}
          testId="open-toolbox"
        />
        <RailButton
          label="素材库"
          icon={<IconMaterial size={18} />}
          active={leftPanel === 'material'}
          onClick={(e) => materialMenu.openFrom(e, 'above')}
          testId="open-material"
        />
        <RailButton
          label="角色库"
          icon={<IconCharacter size={18} />}
          active={leftPanel === 'character'}
          onClick={() => setLeftPanel('character')}
          testId="open-character"
        />
        <RailButton
          label="生成历史"
          icon={<IconHistory size={18} />}
          active={leftPanel === 'history'}
          onClick={() => setLeftPanel('history')}
          testId="open-history"
        />

        <span className="h-5 w-px bg-ink-200" />

        <RailButton
          label="快捷键"
          icon={<IconKeyboard size={18} />}
          active={leftPanel === 'shortcuts'}
          onClick={() => setLeftPanel('shortcuts')}
          testId="open-shortcuts"
        />
        <RailButton
          label="教程"
          icon={<IconHelp size={18} />}
          onClick={(e) => helpMenu.openFrom(e, 'above')}
          testId="open-help"
        />
      </div>

      {addMenu.anchor && (
        <Menu
          sections={addSections}
          anchor={addMenu.anchor}
          onClose={addMenu.close}
          restoreFocusRef={addNodeButtonRef}
          placement="above"
          width={216}
        />
      )}
      {materialMenu.anchor && (
        <Menu
          anchor={materialMenu.anchor}
          onClose={materialMenu.close}
          placement="above"
          width={180}
          sections={[
            {
              items: [
                { id: 'style', label: '风格库', badge: 'NEW', onSelect: () => onOpenMaterial('style') },
                { id: 'effect', label: '特效库', badge: 'NEW', onSelect: () => onOpenMaterial('effect') },
              ],
            },
          ]}
        />
      )}
      {helpMenu.anchor && (
        <Menu
          anchor={helpMenu.anchor}
          onClose={helpMenu.close}
          placement="above"
          width={180}
          sections={[
            {
              items: [
                { id: 'guide', label: '使用指南', onSelect: () => undefined },
                { id: 'support', label: '联系客服', onSelect: () => undefined },
                { id: 'sales', label: '商务合作', onSelect: () => undefined },
                { id: 'community', label: '社区与公众号', onSelect: () => undefined },
              ],
            },
          ]}
        />
      )}
    </>
  )
}

function NodeIcon({ type }: { type: NodeType }) {
  const Icon = NODE_ICON[type]
  return <Icon size={15} />
}

function nodeMenuItem(
  type: NodeType,
  onAddNode: (type: NodeType) => void,
  override?: { label?: string; badge?: string },
): MenuItem {
  return {
    id: type,
    label: override?.label ?? NODE_META[type].label,
    badge: override?.badge ?? NODE_META[type].badge,
    icon: <NodeIcon type={type} />,
    onSelect: () => onAddNode(type),
  }
}

function ToolbarToggle({
  label,
  icon,
  onClick,
  active,
  testId,
}: {
  label: string
  icon: React.ReactNode
  onClick: () => void
  active?: boolean
  testId?: string
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        data-testid={testId}
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-ink-100 focus-visible:outline-2 focus-visible:outline-accent',
          active ? 'text-ink-900' : 'text-ink-400',
        )}
      >
        {icon}
      </button>
    </Tooltip>
  )
}

function RailButton({
  label,
  icon,
  onClick,
  active,
  testId,
  keyShortcuts,
}: {
  label: string
  icon: React.ReactNode
  onClick: (event: React.MouseEvent) => void
  active?: boolean
  testId?: string
  keyShortcuts?: string
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        data-testid={testId}
        onClick={onClick}
        aria-label={label}
        aria-keyshortcuts={keyShortcuts}
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-accent',
          active ? 'bg-ink-100 text-ink-900' : 'text-ink-600 hover:bg-ink-50',
        )}
      >
        {icon}
      </button>
    </Tooltip>
  )
}
