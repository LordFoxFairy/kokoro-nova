'use client'

import { useReactFlow } from '@xyflow/react'
import { NODE_META, NODE_TYPES } from '@/domain/nodes'
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
  IconHand,
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

  // Top-level node entries, then the two submenu groups (脚本 / 素材库).
  const addNodeItems: MenuItem[] = [
    ...NODE_TYPES.filter((t) => NODE_META[t].menu === 'node').map((type) => ({
      id: type,
      label: NODE_META[type].label,
      badge: NODE_META[type].badge,
      icon: <NodeIcon type={type} />,
      onSelect: () => onAddNode(type),
    })),
    {
      id: 'script-group',
      label: '脚本',
      icon: <NodeIcon type="script" />,
      submenu: [
        { id: 'script', label: '脚本 V2', onSelect: () => onAddNode('script') },
        { id: 'scriptLegacy', label: '旧版脚本 Beta', onSelect: () => onAddNode('scriptLegacy') },
      ],
    },
    {
      id: 'material-group',
      label: '素材库',
      icon: <NodeIcon type="style" />,
      badge: 'NEW',
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
      {/* Left status cluster */}
      <div className="pointer-events-auto absolute bottom-4 left-4 z-30 flex items-center gap-1 text-ink-600">
        <button
          type="button"
          data-testid="asset-sidebar-toggle"
          onClick={() => setAssetSidebar(!assetSidebarOpen)}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] transition-colors hover:bg-ink-100',
            assetSidebarOpen && 'bg-ink-100 text-ink-900',
          )}
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
          className="rounded-lg px-2 py-1.5 text-[12px] tabular-nums transition-colors hover:bg-ink-100"
        >
          {Math.round(zoom * 100)}%
        </button>
      </div>

      {/* Center rail */}
      <div className="pointer-events-auto absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-2xl bg-surface p-1.5 shadow-[var(--shadow-panel)]">
        <button
          type="button"
          data-testid="add-node-button"
          onClick={(e) => (addMenu.anchor ? addMenu.close() : addMenu.openFrom(e, 'above'))}
          className={cn(
            'rounded-xl p-2.5 text-white transition-colors',
            addMenu.anchor ? 'bg-ink-700' : 'bg-ink-900 hover:opacity-85',
          )}
          aria-label="添加节点"
        >
          {addMenu.anchor ? <IconClose size={18} /> : <IconPlus size={18} />}
        </button>

        <RailButton
          label="选择工具 (V)"
          icon={<IconCursor size={18} />}
          active={toolMode === 'select'}
          onClick={() => setToolMode('select')}
        />
        <RailButton
          label="抓手工具 (H)"
          icon={<IconHand size={18} />}
          active={toolMode === 'hand'}
          onClick={() => setToolMode('hand')}
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
          label="历史资产"
          icon={<IconHistory size={18} />}
          active={leftPanel === 'history'}
          onClick={() => setLeftPanel('history')}
          testId="open-history"
        />

        <span className="mx-0.5 h-5 w-px bg-ink-200" />

        <RailButton
          label="快捷键"
          icon={<IconKeyboard size={18} />}
          active={leftPanel === 'shortcuts'}
          onClick={() => setLeftPanel('shortcuts')}
          testId="open-shortcuts"
        />
        <RailButton
          label="帮助与支持"
          icon={<IconHelp size={18} />}
          onClick={(e) => helpMenu.openFrom(e, 'above')}
          testId="open-help"
        />
      </div>

      {addMenu.anchor && (
        <Menu sections={addSections} anchor={addMenu.anchor} onClose={addMenu.close} placement="above" width={216} />
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
          'rounded-lg p-2 transition-colors hover:bg-ink-100',
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
}: {
  label: string
  icon: React.ReactNode
  onClick: (event: React.MouseEvent) => void
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
        className={cn(
          'rounded-xl p-2.5 transition-colors',
          active ? 'bg-ink-100 text-ink-900' : 'text-ink-600 hover:bg-ink-50',
        )}
      >
        {icon}
      </button>
    </Tooltip>
  )
}
