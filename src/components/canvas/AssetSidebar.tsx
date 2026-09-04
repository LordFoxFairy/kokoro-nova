'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NODE_META, NODE_TYPES } from '@/domain/nodes'
import type { Asset, AssetKind, AssetNamespace, NodeType } from '@/domain/types'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useEditor } from '@/lib/editor-store'
import { Menu, useMenuAnchor } from '../ui/Menu'
import { EmptyState, InlineRename, SegmentedControl, Spinner } from '../ui/controls'
import {
  IconAssetLibrary,
  IconAudio,
  IconChevronDown,
  IconChevronLeft,
  IconImage,
  IconLocate,
  IconMore,
  IconRefresh,
  IconSearch,
  IconText,
  IconUpload,
  IconVideo,
  IconWarning,
} from '../icons'
import { NODE_ICON } from './node-visuals'
import { UploadDropzone } from '../assets/UploadDropzone'

export type SidebarAssetKind = AssetKind | 'all'

const SIDEBAR_ASSET_LABELS: Record<SidebarAssetKind, string> = {
  all: '全部',
  image: '图片',
  video: '视频',
  audio: '音频',
  text: '文本',
}

export function sidebarAssetKindLabel(kind: AssetKind): string {
  return SIDEBAR_ASSET_LABELS[kind]
}

/** Filter the compact library view without mutating the server response. */
export function filterSidebarAssets(
  assets: readonly Asset[],
  options: { query?: string; kind?: SidebarAssetKind } = {},
): Asset[] {
  const kind = options.kind ?? 'all'
  const query = options.query?.trim().toLocaleLowerCase('zh-CN') ?? ''
  return assets
    .filter((asset) => {
      if (kind !== 'all' && asset.kind !== kind) return false
      if (!query) return true
      return `${asset.name}\n${asset.tags.join(' ')}`.toLocaleLowerCase('zh-CN').includes(query)
    })
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
}

/** Filter canvas nodes without treating the search affordance's blank value as a query. */
export function filterSidebarNodes<T extends { name: string; type: NodeType }>(
  nodes: readonly T[],
  options: { query?: string; type?: NodeType | 'all' } = {},
): T[] {
  const type = options.type ?? 'all'
  const query = options.query?.trim().toLocaleLowerCase('zh-CN') ?? ''
  return nodes.filter((node) => {
    if (type !== 'all' && node.type !== type) return false
    return !query || node.name.toLocaleLowerCase('zh-CN').includes(query)
  })
}

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
  onInsertAsset,
  onOpenLibrary,
}: {
  onLocateNode: (nodeId: string) => void
  onRenameNode: (nodeId: string, name: string) => void
  onDuplicateNode: (nodeId: string) => void
  /** Optional bridge for hosts that want a compact card to insert directly. */
  onInsertAsset?: (asset: Asset) => void
  /** Opens the full library sheet when the host exposes that affordance. */
  onOpenLibrary?: () => void
}) {
  const open = useEditor((s) => s.assetSidebarOpen)
  const setOpen = useEditor((s) => s.setAssetSidebar)
  const document = useEditor((s) => s.document)
  const project = useEditor((s) => s.project)
  const canvases = useEditor((s) => s.canvases)
  const canvasId = useEditor((s) => s.canvasId)
  const selection = useEditor((s) => s.selection)
  const toast = useEditor((s) => s.toast)

  const [tab, setTab] = useState<'canvas' | 'assets'>('canvas')
  const [assetNamespace, setAssetNamespace] = useState<AssetNamespace>('personal')
  const [assetKind, setAssetKind] = useState<SidebarAssetKind>('all')
  const [assetQuery, setAssetQuery] = useState('')
  const [assets, setAssets] = useState<Asset[]>([])
  const [assetLoading, setAssetLoading] = useState(false)
  const [assetError, setAssetError] = useState<string | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [typeFilter, setTypeFilter] = useState<NodeType | 'all'>('all')
  const [query, setQuery] = useState('')
  const [nodeSearchOpen, setNodeSearchOpen] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [width, setWidth] = useState(240)
  const dragging = useRef(false)

  const typeMenu = useMenuAnchor()
  const rowMenu = useMenuAnchor()
  const [menuNodeId, setMenuNodeId] = useState<string | null>(null)
  const assetRequestSeq = useRef(0)

  const nodes = useMemo(() => {
    const list = [...document.nodes].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return filterSidebarNodes(list, { type: typeFilter, query })
  }, [document.nodes, typeFilter, query])

  const loadAssets = useCallback(async () => {
    const seq = assetRequestSeq.current + 1
    assetRequestSeq.current = seq
    setAssetLoading(true)
    setAssetError(null)
    try {
      const data = await api.get<{ assets: Asset[] }>(
        `/api/assets?namespace=${encodeURIComponent(assetNamespace)}`,
      )
      if (assetRequestSeq.current !== seq) return
      setAssets(data.assets.filter((asset) => asset.state === 'committed'))
    } catch (error) {
      if (assetRequestSeq.current !== seq) return
      setAssetError(error instanceof Error ? error.message : '资产加载失败')
    } finally {
      if (assetRequestSeq.current === seq) setAssetLoading(false)
    }
  }, [assetNamespace])

  useEffect(() => {
    if (!open || tab !== 'assets') return
    void loadAssets()
  }, [open, tab, loadAssets])

  useEffect(() => {
    setAssetQuery('')
    setAssetKind('all')
    setAssets([])
    setAssetError(null)
  }, [assetNamespace])

  // Agent assets are a generated-output namespace in the observed canvas UI:
  // unlike personal assets, it has no personal browse/filter controls or
  // upload/library actions in its empty surface.
  const isAgentNamespace = assetNamespace === 'agent'
  const visibleAssets = useMemo(
    () =>
      filterSidebarAssets(assets, {
        query: isAgentNamespace ? '' : assetQuery,
        kind: isAgentNamespace ? 'all' : assetKind,
      }),
    [assets, assetQuery, assetKind, isAgentNamespace],
  )
  const personalFiltersActive = !isAgentNamespace && (assetQuery.trim() !== '' || assetKind !== 'all')

  const openLibrary = () => {
    if (onOpenLibrary) onOpenLibrary()
    else toast('可从画布工具栏打开完整资产库', 'info')
  }

  const handleUploaded = (asset: Asset) => {
    setAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)])
    toast(`已加入${assetNamespace === 'agent' ? ' Agent' : ''}资产库：${asset.name}`, 'success')
  }

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
              onClick={() => {
                setNodeSearchOpen((value) => !value)
                if (nodeSearchOpen) setQuery('')
              }}
              aria-pressed={nodeSearchOpen}
              className="rounded-md p-1 text-ink-500 hover:bg-ink-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              aria-label="搜索节点"
            >
              <IconSearch size={14} />
            </button>
          </div>

          {nodeSearchOpen && (
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
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault()
                      onLocateNode(node.id)
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`定位节点 ${node.name}`}
                    className={cn(
                      'group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
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
                      className="shrink-0 rounded p-0.5 text-ink-400 opacity-0 transition-opacity hover:bg-ink-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent group-hover:opacity-100"
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
          <div className="space-y-2 px-3 py-2">
            <div className="flex items-center gap-1.5">
              <SegmentedControl
                size="sm"
                value={assetNamespace}
                onChange={setAssetNamespace}
                options={[
                  { value: 'personal', label: '个人', testId: 'sidebar-assets-personal' },
                  { value: 'agent', label: 'Agent', testId: 'sidebar-assets-agent' },
                ]}
              />
              {!isAgentNamespace && (
                <button
                  type="button"
                  data-testid="sidebar-upload"
                  aria-label="上传资产"
                  title="上传资产"
                  onClick={() => setUploadOpen(true)}
                  className="ml-auto rounded-lg bg-ink-900 p-1.5 text-white transition-opacity hover:opacity-85"
                >
                  <IconUpload size={14} />
                </button>
              )}
            </div>
            {!isAgentNamespace && (
              <>
                <div className="flex items-center gap-1.5 rounded-lg bg-ink-100 px-2.5 py-1.5">
                  <IconSearch size={13} className="shrink-0 text-ink-400" />
                  <input
                    value={assetQuery}
                    data-testid="sidebar-asset-search"
                    onChange={(event) => setAssetQuery(event.target.value)}
                    placeholder="搜索资产"
                    aria-label="搜索资产"
                    className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-ink-400"
                  />
                </div>
                <div className="flex flex-wrap gap-1">
                  {(['all', 'image', 'video', 'audio', 'text'] as const).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      data-testid={`sidebar-asset-kind-${kind}`}
                      aria-pressed={assetKind === kind}
                      onClick={() => setAssetKind(kind)}
                      className={cn(
                        'rounded-md px-1.5 py-1 text-[10px] transition-colors',
                        assetKind === kind ? 'bg-ink-900 text-white' : 'bg-ink-50 text-ink-500 hover:bg-ink-100',
                      )}
                    >
                      <span className="mr-0.5 opacity-70"><SidebarAssetIcon kind={kind} size={11} /></span>
                      {SIDEBAR_ASSET_LABELS[kind]}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  data-testid="sidebar-open-library"
                  onClick={openLibrary}
                  className="flex w-full items-center justify-center gap-1 rounded-lg border border-ink-200 px-2 py-1.5 text-[11px] text-ink-600 transition-colors hover:bg-ink-50"
                >
                  <IconAssetLibrary size={13} />
                  打开完整资产库
                </button>
              </>
            )}
          </div>

          <div className="thin-scrollbar flex-1 overflow-y-auto px-2" data-testid="sidebar-asset-list">
            {assetError && assets.length > 0 && (
              <div
                className="mb-2 flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/6 px-2.5 py-2 text-[11px] text-danger"
                role="alert"
                data-testid="sidebar-asset-error"
              >
                <IconWarning size={13} className="mt-px shrink-0" />
                <span className="min-w-0 flex-1">资产刷新失败：{assetError}</span>
                <button
                  type="button"
                  data-testid="sidebar-asset-retry"
                  onClick={() => void loadAssets()}
                  className="shrink-0 rounded px-1.5 py-0.5 font-medium hover:bg-danger/10"
                >
                  重试
                </button>
              </div>
            )}

            {assetLoading && visibleAssets.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-ink-300" data-testid="sidebar-asset-loading">
                <Spinner size={20} />
              </div>
            ) : assetError && assets.length === 0 ? (
              <EmptyState
                compact
                icon={<IconWarning size={26} />}
                title="资产加载失败"
                description={assetError}
                action={
                  <button
                    type="button"
                    data-testid="sidebar-asset-retry"
                    onClick={() => void loadAssets()}
                    className="flex items-center gap-1 rounded-lg bg-ink-900 px-3 py-1.5 text-[11px] font-medium text-white"
                  >
                    <IconRefresh size={12} />
                    重试
                  </button>
                }
              />
            ) : visibleAssets.length === 0 ? (
              <EmptyState
                compact
                icon={<IconAssetLibrary size={26} />}
                title={personalFiltersActive ? '没有匹配的资产' : assetNamespace === 'personal' ? '暂无资产' : '暂无素材'}
                description={
                  personalFiltersActive
                    ? '调整搜索词或类型筛选后重试。'
                    : assetNamespace === 'personal'
                      ? '上传或保存生成结果后，素材会出现在这里。'
                      : 'Agent 产生的素材是独立命名空间。'
                }
                action={
                  !isAgentNamespace ? (
                    <button
                      type="button"
                      data-testid="sidebar-empty-upload"
                      onClick={() => setUploadOpen(true)}
                      className="rounded-lg bg-ink-900 px-3 py-1.5 text-[11px] font-medium text-white"
                    >
                      上传资产
                    </button>
                  ) : undefined
                }
              />
            ) : (
              <div className="space-y-1 py-1">
                {visibleAssets.map((asset) => (
                  <SidebarAssetCard
                    key={asset.id}
                    asset={asset}
                    onActivate={() => {
                      if (onInsertAsset) onInsertAsset(asset)
                      else toast(`已选择资产：${asset.name}`, 'info')
                    }}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-ink-100 px-3 py-2.5 text-[11px] text-ink-400">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate">{project?.name} · {canvases.find((c) => c.id === canvasId)?.name}</span>
              <span className="shrink-0 tabular-nums">{visibleAssets.length} 项</span>
            </div>
          </div>

          <UploadDropzone
            open={uploadOpen}
            onClose={() => {
              setUploadOpen(false)
              void loadAssets()
            }}
            namespace={assetNamespace}
            folderId={null}
            onUploaded={handleUploaded}
          />
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

function SidebarAssetCard({ asset, onActivate }: { asset: Asset; onActivate: () => void }) {
  return (
    <button
      type="button"
      data-testid={`sidebar-asset-${asset.id}`}
      aria-label={`插入资产 ${asset.name}`}
      title="点击插入画布"
      onClick={onActivate}
      className="group flex w-full items-center gap-2 rounded-lg p-1.5 text-left transition-colors hover:bg-ink-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      <span className="relative h-12 w-16 shrink-0 overflow-hidden rounded-md bg-ink-100">
        {asset.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span
            className="flex h-full w-full items-center justify-center text-white/85"
            style={{
              background: `linear-gradient(145deg, hsl(${sidebarAssetHue(asset.id)} 58% 66%), hsl(${(sidebarAssetHue(asset.id) + 42) % 360} 48% 44%))`,
            }}
          >
            <SidebarAssetIcon kind={asset.kind} size={18} />
          </span>
        )}
        <span className="absolute bottom-0.5 right-0.5 rounded bg-ink-900/60 px-1 text-[9px] text-white">
          {sidebarAssetKindLabel(asset.kind)}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium text-ink-800">{asset.name}</span>
        <span className="mt-0.5 block truncate text-[10px] text-ink-400">
          {asset.width && asset.height ? `${asset.width}×${asset.height}` : asset.durationSeconds ? `${asset.durationSeconds}s` : asset.tags[0] ?? '本地资产'}
        </span>
      </span>
      <IconChevronDown size={12} className="-rotate-90 shrink-0 text-ink-300 opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  )
}

function SidebarAssetIcon({ kind, size }: { kind: SidebarAssetKind; size: number }) {
  if (kind === 'all') return <IconAssetLibrary size={size} />
  if (kind === 'image') return <IconImage size={size} />
  if (kind === 'video') return <IconVideo size={size} />
  if (kind === 'audio') return <IconAudio size={size} />
  return <IconText size={size} />
}

function sidebarAssetHue(id: string): number {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) % 360
  return hash
}
