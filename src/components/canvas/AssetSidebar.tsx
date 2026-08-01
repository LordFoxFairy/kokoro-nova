'use client'

import { useMemo, useRef, useState } from 'react'
import { NODE_META, NODE_TYPES } from '@/domain/nodes'
import type { Asset, NodeType } from '@/domain/types'
import { cn } from '@/lib/cn'
import { useEditor } from '@/lib/editor-store'
import { Menu, useMenuAnchor } from '../ui/Menu'
import { EmptyState, InlineRename, SegmentedControl } from '../ui/controls'
import { IconChevronDown, IconChevronLeft, IconLocate, IconMore, IconSearch } from '../icons'
import { NODE_ICON } from './node-visuals'

/**
 * Two-level asset management.
 *
 * The 画布 tab locates nodes inside the current graph; the 资产 tab is the
 * personal/agent library. They are separate namespaces on purpose — agent
 * output does not silently merge into the user's personal assets.
 */
export function AssetSidebar({
  onLocateNode,
  onRenameNode,
  onDuplicateNode,
}: {
  onLocateNode: (nodeId: string) => void
  onRenameNode: (nodeId: string, name: string) => void
  onDuplicateNode: (nodeId: string) => void
}) {
  const open = useEditor((s) => s.assetSidebarOpen)
  const setOpen = useEditor((s) => s.setAssetSidebar)
  const document = useEditor((s) => s.document)
  const project = useEditor((s) => s.project)
  const canvases = useEditor((s) => s.canvases)
  const canvasId = useEditor((s) => s.canvasId)
  const selection = useEditor((s) => s.selection)

  const [tab, setTab] = useState<'canvas' | 'assets'>('canvas')
  const [assetNamespace, setAssetNamespace] = useState<'personal' | 'agent'>('personal')
  const [typeFilter, setTypeFilter] = useState<NodeType | 'all'>('all')
  const [query, setQuery] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [width, setWidth] = useState(240)
  const dragging = useRef(false)

  const typeMenu = useMenuAnchor()
  const rowMenu = useMenuAnchor()
  const [menuNodeId, setMenuNodeId] = useState<string | null>(null)

  const nodes = useMemo(() => {
    let list = [...document.nodes].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    if (typeFilter !== 'all') list = list.filter((n) => n.type === typeFilter)
    if (query) list = list.filter((n) => n.name.toLowerCase().includes(query.toLowerCase()))
    return list
  }, [document.nodes, typeFilter, query])

  // Personal/agent library — empty until artifacts are explicitly registered.
  const assets: Asset[] = []

  if (!open) return null

  const startResize = (event: React.PointerEvent) => {
    event.preventDefault()
    dragging.current = true
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return
      setWidth(Math.max(200, Math.min(420, e.clientX)))
    }
    const onUp = () => {
      dragging.current = false
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <aside
      data-testid="asset-sidebar"
      className="relative z-20 flex h-full shrink-0 flex-col border-r border-ink-100 bg-surface"
      style={{ width }}
    >
      <div className="flex items-center gap-2 px-3 pb-2 pt-14">
        <SegmentedControl
          size="sm"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'canvas', label: '画布' },
            { value: 'assets', label: '资产' },
          ]}
        />
      </div>

      {tab === 'canvas' ? (
        <>
          <div className="flex items-center gap-1.5 px-3 py-2">
            <span className="text-[12px] font-medium text-ink-600">画布元素</span>
            <button
              type="button"
              onClick={(e) => typeMenu.openFrom(e)}
              className="ml-auto flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] text-ink-500 hover:bg-ink-50"
            >
              {typeFilter === 'all' ? '全部' : NODE_META[typeFilter].label}
              <IconChevronDown size={12} />
            </button>
            <button
              type="button"
              onClick={() => setQuery(query ? '' : ' ')}
              className="rounded-md p-1 text-ink-500 hover:bg-ink-50"
              aria-label="搜索节点"
            >
              <IconSearch size={14} />
            </button>
          </div>

          {query !== '' && (
            <div className="px-3 pb-2">
              <input
                autoFocus
                value={query.trim()}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索节点名称"
                className="w-full rounded-lg bg-ink-100 px-2.5 py-1.5 text-[12px] outline-none placeholder:text-ink-400"
              />
            </div>
          )}

          <div className="thin-scrollbar flex-1 overflow-y-auto px-1.5">
            {nodes.length === 0 ? (
              <EmptyState compact title="没有匹配的节点" />
            ) : (
              nodes.map((node) => {
                const Icon = NODE_ICON[node.type]
                const active = selection.includes(node.id)
                return (
                  <div
                    key={node.id}
                    data-testid={`sidebar-node-${node.id}`}
                    onClick={() => onLocateNode(node.id)}
                    className={cn(
                      'group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition-colors',
                      active ? 'bg-accent-soft' : 'hover:bg-ink-50',
                    )}
                  >
                    <span className="shrink-0 text-ink-400">
                      <Icon size={15} />
                    </span>
                    {renamingId === node.id ? (
                      <InlineRename
                        value={node.name}
                        onCancel={() => setRenamingId(null)}
                        onCommit={(name) => {
                          setRenamingId(null)
                          if (name !== node.name) onRenameNode(node.id, name)
                        }}
                      />
                    ) : (
                      <span className="flex-1 truncate text-[12px] text-ink-700">{node.name}</span>
                    )}
                    <button
                      type="button"
                      aria-label="节点操作"
                      onClick={(e) => {
                        e.stopPropagation()
                        setMenuNodeId(node.id)
                        rowMenu.openFrom(e, 'point')
                      }}
                      className="shrink-0 rounded p-0.5 text-ink-400 opacity-0 transition-opacity hover:bg-ink-100 group-hover:opacity-100"
                    >
                      <IconMore size={13} />
                    </button>
                  </div>
                )
              })
            )}
          </div>

          <div className="flex items-center justify-between border-t border-ink-100 px-3 py-2.5 text-[11px] text-ink-400">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-1 hover:bg-ink-50"
              aria-label="收起侧栏"
            >
              <IconChevronLeft size={14} />
            </button>
            <span data-testid="node-count">共 {document.nodes.length} 节点</span>
          </div>
        </>
      ) : (
        <>
          <div className="px-3 py-2">
            <SegmentedControl
              size="sm"
              value={assetNamespace}
              onChange={setAssetNamespace}
              options={[
                { value: 'personal', label: '个人' },
                { value: 'agent', label: 'Agent' },
              ]}
            />
          </div>
          <div className="flex-1">
            {assets.length === 0 && (
              <EmptyState
                compact
                title={assetNamespace === 'personal' ? '暂无资产' : '暂无素材'}
                description={
                  assetNamespace === 'personal'
                    ? '生成结果使用「保存资产」后会出现在这里。'
                    : 'Agent 产生的素材是独立命名空间。'
                }
              />
            )}
          </div>
          <div className="border-t border-ink-100 px-3 py-2.5 text-[11px] text-ink-400">
            {project?.name} · {canvases.find((c) => c.id === canvasId)?.name}
          </div>
        </>
      )}

      {/* Drag handle */}
      <div
        onPointerDown={startResize}
        className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-accent/30"
      />

      {typeMenu.anchor && (
        <Menu
          anchor={typeMenu.anchor}
          onClose={typeMenu.close}
          width={168}
          sections={[
            {
              items: [
                { id: 'all', label: '全部', checked: typeFilter === 'all', onSelect: () => setTypeFilter('all') },
                ...NODE_TYPES.map((type) => ({
                  id: type,
                  label: NODE_META[type].label,
                  checked: typeFilter === type,
                  onSelect: () => setTypeFilter(type),
                })),
              ],
            },
          ]}
        />
      )}

      {rowMenu.anchor && menuNodeId && (
        <Menu
          anchor={rowMenu.anchor}
          onClose={() => {
            rowMenu.close()
            setMenuNodeId(null)
          }}
          width={150}
          sections={[
            {
              items: [
                { id: 'locate', label: '定位', icon: <IconLocate size={14} />, onSelect: () => onLocateNode(menuNodeId) },
                { id: 'rename', label: '重命名', onSelect: () => setRenamingId(menuNodeId) },
                { id: 'copy', label: '创建副本', onSelect: () => onDuplicateNode(menuNodeId) },
              ],
            },
          ]}
        />
      )}
    </aside>
  )
}
