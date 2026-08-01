'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AssetFolder } from '@/app/api/assets/folders/route'
import type { Asset, AssetKind, AssetNamespace, AssetTag } from '@/domain/types'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useEditor } from '@/lib/editor-store'
import { ConfirmDialog, Dialog } from '../ui/Dialog'
import { Menu, useMenuAnchor, type MenuSection } from '../ui/Menu'
import { Chip, EmptyState, Field, InlineRename, SegmentedControl, Spinner } from '../ui/controls'
import { UploadDropzone } from './UploadDropzone'
import {
  IconAssetLibrary,
  IconAudio,
  IconCheck,
  IconChevronLeft,
  IconFilter,
  IconFolder,
  IconFolderPlus,
  IconImage,
  IconMore,
  IconPlus,
  IconRename,
  IconSearch,
  IconText,
  IconTrash,
  IconUpload,
  IconVideo,
} from '../icons'

export interface AssetLibraryPanelProps {
  /** Mounts and shows the sheet. Nothing is fetched while closed. */
  open: boolean
  /** Fired by the backdrop, Escape and every action that finishes the flow. */
  onClose: () => void
  /**
   * A card was activated outside of 批量 mode — place the asset on the canvas.
   * The panel closes itself immediately afterwards.
   */
  onInsert: (asset: Asset) => void
  /**
   * 上传资产 picked local files. Transport lives in the panel — this only
   * reports the raw batch, before any gate has run, for callers that want to
   * log it or mirror the selection elsewhere.
   */
  onUpload?: (files: File[]) => void
}

/** Bulk writes fan out into one request per asset, so the batch stays bounded. */
const MAX_SELECTION = 50

const ALL_TAGS: AssetTag[] = ['其它', '人物', '场景', '物品', '风格', '音效']

const KIND_LABEL: Record<AssetKind, string> = {
  image: '图片',
  video: '视频',
  audio: '音频',
  text: '文本',
}

type Category = 'all' | 'image' | 'video' | 'audio'

const CATEGORIES: { value: Category; label: string; icon: ReactNode }[] = [
  { value: 'all', label: '全部', icon: <IconAssetLibrary size={15} /> },
  { value: 'image', label: '图片', icon: <IconImage size={15} /> },
  { value: 'video', label: '视频', icon: <IconVideo size={15} /> },
  { value: 'audio', label: '音频', icon: <IconAudio size={15} /> },
]

/**
 * 资产库 — browse, organise and insert library assets.
 *
 * Assets are fetched per namespace/category/keyword from the server; the tag
 * filter is applied locally because the listing endpoint only understands a
 * single tag while the popover allows several.
 */
export function AssetLibraryPanel({ open, onClose, onInsert, onUpload }: AssetLibraryPanelProps) {
  const toast = useEditor((s) => s.toast)

  const [namespace, setNamespace] = useState<AssetNamespace>('personal')
  const [category, setCategory] = useState<Category>('all')
  const [query, setQuery] = useState('')
  const [committedQuery, setCommittedQuery] = useState('')
  const [activeTags, setActiveTags] = useState<AssetTag[]>([])
  const [folderId, setFolderId] = useState<string | null>(null)

  const [assets, setAssets] = useState<Asset[]>([])
  const [folders, setFolders] = useState<AssetFolder[]>([])
  const [folderCounts, setFolderCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  const [selectionMode, setSelectionMode] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [capHit, setCapHit] = useState(false)

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false)
  const [tagDraft, setTagDraft] = useState<AssetTag[]>([])
  const [tagEditor, setTagEditor] = useState<{ ids: string[]; draft: AssetTag[] } | null>(null)
  const [moveEditor, setMoveEditor] = useState<{ ids: string[]; target: string | null } | null>(null)
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null)
  const [cardMenu, setCardMenu] = useState<{ asset: Asset; anchor: { x: number; y: number } } | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)

  const createMenu = useMenuAnchor()
  /** Guards against a slow earlier request overwriting a newer result. */
  const requestSeq = useRef(0)

  useEffect(() => {
    const timer = setTimeout(() => setCommittedQuery(query.trim()), 220)
    return () => clearTimeout(timer)
  }, [query])

  const loadFolders = useCallback(async () => {
    try {
      const data = await api.get<{ folders: AssetFolder[]; counts: Record<string, number> }>(
        '/api/assets/folders',
      )
      setFolders(data.folders)
      setFolderCounts(data.counts)
    } catch (error) {
      toast(error instanceof Error ? error.message : '文件夹加载失败', 'error')
    }
  }, [toast])

  const loadAssets = useCallback(async () => {
    const seq = requestSeq.current + 1
    requestSeq.current = seq
    setLoading(true)
    try {
      // Kind stays out of the request: the rail shows a count per category, and
      // a kind-filtered response could only ever count the selected one.
      const params = new URLSearchParams({ namespace })
      if (committedQuery) params.set('q', committedQuery)
      const data = await api.get<{ assets: Asset[] }>(`/api/assets?${params.toString()}`)
      if (requestSeq.current !== seq) return
      setAssets(data.assets)
    } catch (error) {
      if (requestSeq.current !== seq) return
      toast(error instanceof Error ? error.message : '资产加载失败', 'error')
    } finally {
      if (requestSeq.current === seq) setLoading(false)
    }
  }, [namespace, committedQuery, toast])

  useEffect(() => {
    if (!open) return
    void loadAssets()
  }, [open, loadAssets])

  useEffect(() => {
    if (!open) return
    void loadFolders()
  }, [open, loadFolders])

  // Closing drops transient UI so the next open starts from a predictable view.
  useEffect(() => {
    if (open) return
    setSelectionMode(false)
    setSelected([])
    setCapHit(false)
    setRenamingId(null)
    setTagPopoverOpen(false)
    setCardMenu(null)
    setFolderId(null)
    setUploadOpen(false)
  }, [open])

  // A selection only makes sense for what is on screen; any filter change
  // silently changes that set, so the selection is dropped with it.
  useEffect(() => {
    setSelected([])
    setCapHit(false)
  }, [namespace, category, committedQuery, activeTags, folderId])

  /** Everything the current folder, search and tags allow, before the rail. */
  const scoped = useMemo(
    () =>
      assets.filter((asset) => {
        if ((asset.folderId ?? null) !== folderId) return false
        // Several tags read as "any of these", matching how the chips are used.
        if (activeTags.length > 0 && !activeTags.some((tag) => asset.tags.includes(tag))) return false
        return true
      }),
    [assets, folderId, activeTags],
  )

  const counts = useMemo(() => {
    const base: Record<Category, number> = { all: 0, image: 0, video: 0, audio: 0 }
    for (const asset of scoped) {
      base.all += 1
      if (asset.kind === 'image' || asset.kind === 'video' || asset.kind === 'audio') {
        base[asset.kind] += 1
      }
    }
    return base
  }, [scoped])

  const visible = useMemo(
    () => (category === 'all' ? scoped : scoped.filter((asset) => asset.kind === category)),
    [scoped, category],
  )

  const currentFolder = folders.find((f) => f.id === folderId) ?? null
  const filtersActive = committedQuery.length > 0 || activeTags.length > 0 || category !== 'all'
  // A filtered view is about finding assets, and folders match no filter, so
  // they only belong in the unfiltered root listing.
  const showFolders = folderId === null && !filtersActive && folders.length > 0

  /* ---------------------------------------------------------------- *
   * Selection
   * ---------------------------------------------------------------- */

  const isSelected = (id: string) => selected.includes(id)
  const atCap = selected.length >= MAX_SELECTION

  const toggleSelected = (id: string) => {
    if (isSelected(id)) {
      setSelected(selected.filter((x) => x !== id))
      setCapHit(false)
      return
    }
    if (atCap) {
      setCapHit(true)
      return
    }
    setSelected([...selected, id])
  }

  const pageIds = visible.map((a) => a.id)
  // Past the cap only the leading slice can ever be selected, so "everything is
  // selected" has to mean that slice — comparing against the full page would
  // leave the toggle permanently unchecked and give no way back to an empty
  // selection.
  const selectableIds = pageIds.slice(0, MAX_SELECTION)
  const allPageSelected = selectableIds.length > 0 && selectableIds.every((id) => isSelected(id))

  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelected([])
      setCapHit(false)
      return
    }
    setSelected(selectableIds)
    setCapHit(selectableIds.length < pageIds.length)
  }

  /* ---------------------------------------------------------------- *
   * Writes
   * ---------------------------------------------------------------- */

  const applyPatched = (asset: Asset) =>
    setAssets((prev) => prev.map((a) => (a.id === asset.id ? asset : a)))

  const patchAsset = async (id: string, patch: { name?: string; tags?: AssetTag[]; folderId?: string | null }) => {
    const updated = await api.patch<Asset>(`/api/assets/${id}`, patch)
    applyPatched(updated)
  }

  const runSingle = async (action: () => Promise<void>, failure: string) => {
    setBusy(true)
    try {
      await action()
    } catch (error) {
      toast(error instanceof Error ? error.message : failure, 'error')
    } finally {
      setBusy(false)
    }
  }

  /** Sequential on purpose: the store serialises writes and a partial failure
   * stays attributable to the assets that actually failed. */
  const runBulk = async (ids: string[], label: string, action: (id: string) => Promise<void>) => {
    setBusy(true)
    let failed = 0
    for (const id of ids) {
      try {
        await action(id)
      } catch {
        failed += 1
      }
    }
    setBusy(false)
    setSelected([])
    setCapHit(false)
    void loadFolders()
    if (failed > 0) toast(`${label}：${ids.length - failed} 个成功，${failed} 个失败`, 'error')
    else toast(`${label}：${ids.length} 个资产`, 'success')
  }

  const commitRename = (asset: Asset, next: string) => {
    setRenamingId(null)
    if (next === asset.name) return
    void runSingle(() => patchAsset(asset.id, { name: next }), '重命名失败')
  }

  const removeAssets = async (ids: string[]) => {
    const drop = async (id: string) => {
      await api.del<Asset>(`/api/assets/${id}`)
      setAssets((prev) => prev.filter((a) => a.id !== id))
    }
    if (ids.length === 1) {
      await runSingle(async () => {
        await drop(ids[0])
        void loadFolders()
      }, '删除失败')
      return
    }
    await runBulk(ids, '已删除', drop)
  }

  const createFolder = () =>
    runSingle(async () => {
      const folder = await api.post<AssetFolder>('/api/assets/folders')
      setFolders((prev) => [...prev, folder])
      setFolderCounts((prev) => ({ ...prev, [folder.id]: 0 }))
      toast(`已创建「${folder.name}」`, 'success')
    }, '新建文件夹失败')

  /** A committed upload joins the listing in place: the endpoint returns the
   * finished row, so nothing has to be refetched to make it visible. */
  const addUploaded = (asset: Asset) => {
    setAssets((prev) => [asset, ...prev.filter((a) => a.id !== asset.id)])
  }

  /* ---------------------------------------------------------------- *
   * Render
   * ---------------------------------------------------------------- */

  const railButton = (option: (typeof CATEGORIES)[number]) => {
    const active = option.value === category
    return (
      <button
        key={option.value}
        type="button"
        data-testid={`asset-category-${option.value}`}
        aria-pressed={active}
        // Stays inside the open folder: the rail narrows the view, it does not
        // navigate.
        onClick={() => setCategory(option.value)}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg px-2.5 py-[7px] text-[13px] transition-colors',
          active ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100',
        )}
      >
        <span className={active ? 'text-white' : 'text-ink-400'}>{option.icon}</span>
        <span className="flex-1 text-left">{option.label}</span>
        <span className={cn('text-[11px] tabular-nums', active ? 'text-white/70' : 'text-ink-400')}>
          {counts[option.value]}
        </span>
      </button>
    )
  }

  return (
    <Dialog open={open} onClose={onClose} variant="panel" width={900} hideHeader testId="asset-library-panel">
      <div className="flex items-center justify-between gap-4 border-b border-ink-100 px-6 py-4">
        <h2 className="flex min-w-0 items-center gap-1.5 text-[15px] font-semibold text-ink-900">
          {currentFolder ? (
            <>
              <button
                type="button"
                data-testid="asset-folder-back"
                onClick={() => setFolderId(null)}
                className="-ml-1 flex shrink-0 items-center gap-0.5 rounded-lg px-1 py-0.5 text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-900"
              >
                <IconChevronLeft size={14} />
                资产库
              </button>
              <span className="shrink-0 text-ink-300">/</span>
              <span className="truncate">{currentFolder.name}</span>
            </>
          ) : (
            '资产库'
          )}
        </h2>

        <div className="flex shrink-0 items-center gap-2">
          {/* Refreshes keep the current results on screen, so the spinner is
              the only hint that a newer list is on its way. */}
          {loading && assets.length > 0 && (
            <span className="text-ink-300">
              <Spinner size={14} />
            </span>
          )}
          <div className="flex items-center gap-1.5 rounded-lg bg-ink-100 px-2.5 py-1.5">
            <IconSearch size={14} className="text-ink-400" />
            <input
              value={query}
              data-testid="asset-search"
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索资产"
              className="w-28 bg-transparent text-[12px] outline-none placeholder:text-ink-400"
            />
          </div>

          <div className="relative">
            <button
              type="button"
              data-testid="asset-tag-filter"
              onClick={() => {
                setTagDraft(activeTags)
                setTagPopoverOpen((v) => !v)
              }}
              className={cn(
                'flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] transition-colors',
                activeTags.length > 0 || tagPopoverOpen ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600',
              )}
            >
              <IconFilter size={13} />
              标签
              {activeTags.length > 0 && (
                <span className="rounded-full bg-white/20 px-1.5 text-[10px]">{activeTags.length}</span>
              )}
            </button>
            {tagPopoverOpen && (
              <>
                {/* Click-away layer; sits under the popover but over the sheet. */}
                <button
                  type="button"
                  aria-label="关闭标签筛选"
                  className="fixed inset-0 z-[68] cursor-default"
                  onClick={() => setTagPopoverOpen(false)}
                />
                <div className="panel absolute right-0 top-[calc(100%+6px)] z-[69] w-[232px] p-3" data-testid="asset-tag-popover">
                  <div className="mb-2 text-[11px] font-medium text-ink-400">按标签筛选</div>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_TAGS.map((tag) => {
                      const on = tagDraft.includes(tag)
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() =>
                            setTagDraft(on ? tagDraft.filter((t) => t !== tag) : [...tagDraft, tag])
                          }
                          className={cn(
                            'rounded-full px-2.5 py-1 text-[11px] transition-colors',
                            on ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200',
                          )}
                        >
                          {tag}
                        </button>
                      )
                    })}
                  </div>
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setTagDraft([])}
                      className="rounded-lg px-2.5 py-1.5 text-[12px] text-ink-600 transition-colors hover:bg-ink-50"
                    >
                      清空
                    </button>
                    <button
                      type="button"
                      data-testid="asset-tag-apply"
                      onClick={() => {
                        setActiveTags(tagDraft)
                        setTagPopoverOpen(false)
                      }}
                      className="rounded-lg bg-ink-900 px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-85"
                    >
                      应用
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            data-testid="asset-batch-toggle"
            aria-pressed={selectionMode}
            onClick={() => {
              setSelectionMode(!selectionMode)
              setSelected([])
              setCapHit(false)
              setRenamingId(null)
            }}
            className={cn(
              'rounded-lg px-2.5 py-1.5 text-[12px] transition-colors',
              selectionMode ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200',
            )}
          >
            批量
          </button>

          <button
            type="button"
            data-testid="asset-create"
            onClick={(e) => createMenu.openFrom(e)}
            className="flex items-center gap-1 rounded-lg bg-ink-900 px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-85"
          >
            <IconPlus size={13} />
            新建
          </button>
        </div>
      </div>

      <div className="flex">
        <div className="w-[148px] shrink-0 border-r border-ink-100 p-3">
          <SegmentedControl
            size="sm"
            value={namespace}
            onChange={setNamespace}
            options={[
              { value: 'personal', label: '个人', testId: 'asset-ns-personal' },
              { value: 'agent', label: 'Agent', testId: 'asset-ns-agent' },
            ]}
          />
          <div className="mt-3 space-y-0.5">{CATEGORIES.map(railButton)}</div>
        </div>

        <div className="thin-scrollbar max-h-[52vh] min-h-[320px] flex-1 overflow-y-auto p-5">
          {loading && assets.length === 0 ? (
            <div className="flex h-[280px] items-center justify-center text-ink-300">
              <Spinner size={22} />
            </div>
          ) : visible.length === 0 && !showFolders ? (
            <EmptyState
              icon={<IconAssetLibrary size={30} />}
              title={
                filtersActive ? '没有匹配的资产' : folderId ? '这个文件夹还是空的' : '资产库还是空的'
              }
              description={
                filtersActive
                  ? '调整分类、标签或搜索词后重试。'
                  : folderId
                    ? '把资产移动到这个文件夹后会显示在这里。'
                    : '在生成结果上使用「保存资产」，或从右上角「新建 → 上传资产」加入素材。'
              }
              action={
                !filtersActive && !folderId ? (
                  <button
                    type="button"
                    data-testid="asset-empty-upload"
                    onClick={() => setUploadOpen(true)}
                    className="rounded-lg bg-ink-900 px-3.5 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-85"
                  >
                    上传资产
                  </button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-3.5">
              {showFolders &&
                folders.map((folder) => (
                  <FolderCard
                    key={folder.id}
                    folder={folder}
                    count={folderCounts[folder.id] ?? 0}
                    // Folders are containers, never batch targets.
                    locked={selectionMode}
                    onOpen={() => setFolderId(folder.id)}
                  />
                ))}
              {visible.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  selectionMode={selectionMode}
                  selected={isSelected(asset.id)}
                  blockedByCap={atCap && !isSelected(asset.id)}
                  renaming={renamingId === asset.id}
                  onActivate={() => {
                    if (selectionMode) {
                      toggleSelected(asset.id)
                      return
                    }
                    onInsert(asset)
                    onClose()
                  }}
                  onStartRename={() => setRenamingId(asset.id)}
                  onCommitRename={(next) => commitRename(asset, next)}
                  onCancelRename={() => setRenamingId(null)}
                  onOpenMenu={(anchor) => setCardMenu({ asset, anchor })}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {selectionMode && (
        <div className="flex items-center justify-between gap-4 border-t border-ink-100 px-6 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              data-testid="asset-select-all"
              onClick={toggleSelectAll}
              disabled={pageIds.length === 0}
              className="flex items-center gap-1.5 text-[12px] text-ink-600 transition-colors hover:text-ink-900 disabled:cursor-not-allowed disabled:text-ink-300"
            >
              <CheckBox checked={allPageSelected} tone="light" />
              全选当前页
            </button>
            <span className="text-[12px] tabular-nums text-ink-500" data-testid="asset-selection-count">
              已选 {selected.length} / {MAX_SELECTION}
            </span>
            {capHit && (
              <span className="truncate text-[11px] text-danger" data-testid="asset-selection-cap">
                已达上限，一次最多操作 {MAX_SELECTION} 个资产
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {busy && <Spinner size={14} />}
            <BarButton
              disabled={selected.length === 0 || busy}
              testId="asset-bulk-move"
              onClick={() => setMoveEditor({ ids: selected, target: folderId })}
            >
              移动到文件夹
            </BarButton>
            <BarButton
              disabled={selected.length === 0 || busy}
              testId="asset-bulk-tags"
              onClick={() => setTagEditor({ ids: selected, draft: [] })}
            >
              修改标签
            </BarButton>
            <BarButton
              danger
              disabled={selected.length === 0 || busy}
              testId="asset-bulk-delete"
              onClick={() => setDeleteIds(selected)}
            >
              删除
            </BarButton>
          </div>
        </div>
      )}

      <UploadDropzone
        open={uploadOpen}
        onClose={() => {
          setUploadOpen(false)
          // Folder counts move with every committed upload, so they are
          // refreshed once per batch instead of once per file.
          void loadFolders()
        }}
        namespace={namespace}
        folderId={folderId}
        onUploaded={addUploaded}
        onPicked={onUpload}
      />

      {createMenu.anchor && (
        <Menu
          anchor={createMenu.anchor}
          width={176}
          onClose={createMenu.close}
          sections={[
            {
              items: [
                {
                  id: 'folder',
                  label: '新建文件夹',
                  icon: <IconFolderPlus size={14} />,
                  onSelect: () => void createFolder(),
                },
                {
                  id: 'upload',
                  label: '上传资产',
                  icon: <IconUpload size={14} />,
                  onSelect: () => setUploadOpen(true),
                },
              ],
            },
          ]}
        />
      )}

      {cardMenu && (
        <Menu
          anchor={cardMenu.anchor}
          align="end"
          width={168}
          onClose={() => setCardMenu(null)}
          sections={cardMenuSections(cardMenu.asset, {
            onRename: () => setRenamingId(cardMenu.asset.id),
            onTags: () => setTagEditor({ ids: [cardMenu.asset.id], draft: cardMenu.asset.tags }),
            onMove: () => setMoveEditor({ ids: [cardMenu.asset.id], target: cardMenu.asset.folderId }),
            onDelete: () => setDeleteIds([cardMenu.asset.id]),
          })}
        />
      )}

      <Dialog
        open={Boolean(tagEditor)}
        onClose={() => setTagEditor(null)}
        title="修改标签"
        width={380}
        footer={
          <>
            <FooterButton onClick={() => setTagEditor(null)}>取消</FooterButton>
            <FooterButton
              primary
              testId="asset-tags-save"
              onClick={() => {
                if (!tagEditor) return
                const { ids, draft } = tagEditor
                setTagEditor(null)
                if (ids.length === 1) {
                  void runSingle(() => patchAsset(ids[0], { tags: draft }), '标签更新失败')
                  return
                }
                void runBulk(ids, '已更新标签', (id) => patchAsset(id, { tags: draft }))
              }}
            >
              保存
            </FooterButton>
          </>
        }
      >
        <Field label="标签" hint="保存后会覆盖所选资产原有的标签。">
          <div className="flex flex-wrap gap-1.5">
            {ALL_TAGS.map((tag) => {
              const on = tagEditor?.draft.includes(tag) ?? false
              return (
                <button
                  key={tag}
                  type="button"
                  data-testid={`asset-tag-option-${tag}`}
                  onClick={() =>
                    setTagEditor((prev) =>
                      prev
                        ? {
                            ...prev,
                            draft: on ? prev.draft.filter((t) => t !== tag) : [...prev.draft, tag],
                          }
                        : prev,
                    )
                  }
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[12px] transition-colors',
                    on ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200',
                  )}
                >
                  {tag}
                </button>
              )
            })}
          </div>
        </Field>
        <div className="pt-3 text-[12px] text-ink-400">已选 {tagEditor?.ids.length ?? 0} 个资产</div>
      </Dialog>

      <Dialog
        open={Boolean(moveEditor)}
        onClose={() => setMoveEditor(null)}
        title="移动到文件夹"
        width={380}
        footer={
          <>
            <FooterButton onClick={() => setMoveEditor(null)}>取消</FooterButton>
            <FooterButton
              primary
              testId="asset-move-confirm"
              onClick={() => {
                if (!moveEditor) return
                const { ids, target } = moveEditor
                setMoveEditor(null)
                if (ids.length === 1) {
                  void runSingle(async () => {
                    await patchAsset(ids[0], { folderId: target })
                    void loadFolders()
                  }, '移动失败')
                  return
                }
                void runBulk(ids, '已移动', (id) => patchAsset(id, { folderId: target }))
              }}
            >
              移动
            </FooterButton>
          </>
        }
      >
        <div className="space-y-1">
          <FolderOption
            label="不放入文件夹"
            icon={<IconAssetLibrary size={15} />}
            selected={moveEditor?.target === null}
            onSelect={() => setMoveEditor((prev) => (prev ? { ...prev, target: null } : prev))}
          />
          {folders.map((folder) => (
            <FolderOption
              key={folder.id}
              label={folder.name}
              icon={<IconFolder size={15} />}
              selected={moveEditor?.target === folder.id}
              onSelect={() => setMoveEditor((prev) => (prev ? { ...prev, target: folder.id } : prev))}
            />
          ))}
          {folders.length === 0 && (
            <EmptyState
              compact
              title="还没有文件夹"
              description="先用「新建 → 新建文件夹」创建一个。"
            />
          )}
        </div>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteIds)}
        danger
        title="删除资产"
        confirmLabel="删除"
        description={`确定删除选中的 ${deleteIds?.length ?? 0} 个资产？删除后不再出现在资产库中，已经生成的产物仍然保留。`}
        onClose={() => setDeleteIds(null)}
        onConfirm={() => {
          const ids = deleteIds ?? []
          setDeleteIds(null)
          void removeAssets(ids)
        }}
      />
    </Dialog>
  )
}

/* ------------------------------------------------------------------ *
 * Cards
 * ------------------------------------------------------------------ */

function AssetCard({
  asset,
  selectionMode,
  selected,
  blockedByCap,
  renaming,
  onActivate,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onOpenMenu,
}: {
  asset: Asset
  selectionMode: boolean
  selected: boolean
  blockedByCap: boolean
  renaming: boolean
  onActivate: () => void
  onStartRename: () => void
  onCommitRename: (next: string) => void
  onCancelRename: () => void
  onOpenMenu: (anchor: { x: number; y: number }) => void
}) {
  const meta = describeAsset(asset)

  return (
    <div
      data-testid={`asset-card-${asset.id}`}
      role="button"
      tabIndex={0}
      aria-pressed={selectionMode ? selected : undefined}
      aria-label={asset.name}
      title={blockedByCap ? '已达选择上限' : asset.name}
      onClick={() => {
        if (renaming) return
        onActivate()
      }}
      onKeyDown={(e) => {
        if (renaming) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onActivate()
        }
      }}
      className={cn(
        'group relative overflow-hidden rounded-xl bg-surface text-left ring-1 transition-shadow outline-none',
        selected ? 'ring-2 ring-accent' : 'ring-ink-100 hover:shadow-[var(--shadow-float)]',
        blockedByCap && 'opacity-50',
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-ink-100">
        <AssetThumbnail asset={asset} />

        <span className="absolute left-1.5 top-1.5 rounded bg-ink-900/55 px-1.5 py-px text-[10px] text-white">
          {KIND_LABEL[asset.kind]}
        </span>
        {asset.durationSeconds ? (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-ink-900/55 px-1.5 py-px text-[10px] tabular-nums text-white">
            {formatDuration(asset.durationSeconds)}
          </span>
        ) : null}

        {selectionMode ? (
          <div
            className={cn(
              'absolute inset-0 transition-colors',
              selected ? 'bg-accent/12' : 'bg-ink-900/0 group-hover:bg-ink-900/10',
            )}
          >
            <span className="absolute right-1.5 top-1.5">
              <CheckBox checked={selected} />
            </span>
          </div>
        ) : (
          <>
            <div className="absolute inset-0 flex items-center justify-center bg-ink-900/25 opacity-0 transition-opacity group-hover:opacity-100">
              <span className="rounded-lg bg-white/95 px-3 py-1.5 text-[12px] font-medium text-ink-900 shadow-sm">
                插入画布
              </span>
            </div>
            <button
              type="button"
              aria-label="更多"
              data-testid={`asset-menu-${asset.id}`}
              onClick={(e) => {
                e.stopPropagation()
                const rect = e.currentTarget.getBoundingClientRect()
                onOpenMenu({ x: rect.right, y: rect.bottom + 6 })
              }}
              className="absolute right-1.5 top-1.5 rounded-lg bg-white/92 p-1 text-ink-600 opacity-0 shadow-sm transition-opacity hover:text-ink-900 group-hover:opacity-100"
            >
              <IconMore size={14} />
            </button>
          </>
        )}
      </div>

      <div className="p-2">
        {renaming ? (
          <InlineRename
            value={asset.name}
            testId={`asset-rename-${asset.id}`}
            onCommit={onCommitRename}
            onCancel={onCancelRename}
            className="text-[12px]"
          />
        ) : (
          <div
            className="truncate text-[12px] font-medium text-ink-900"
            // A dblclick is always preceded by a click, and that click reaching
            // the card would insert the asset and close the panel before the
            // rename could start. The name row therefore stops activating the
            // card; 插入画布 lives on the thumbnail. In 批量 the row still has to
            // toggle the checkbox, so the click is let through there.
            onClick={(e) => {
              if (!selectionMode) e.stopPropagation()
            }}
            onDoubleClick={(e) => {
              e.stopPropagation()
              if (!selectionMode) onStartRename()
            }}
          >
            {asset.name}
          </div>
        )}
        <div className="mt-0.5 truncate text-[10px] tabular-nums text-ink-400">{meta}</div>
        {asset.tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {asset.tags.slice(0, 2).map((tag) => (
              <Chip key={tag}>{tag}</Chip>
            ))}
            {asset.tags.length > 2 && <Chip>+{asset.tags.length - 2}</Chip>}
          </div>
        )}
      </div>
    </div>
  )
}

function FolderCard({
  folder,
  count,
  locked,
  onOpen,
}: {
  folder: AssetFolder
  count: number
  locked: boolean
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      disabled={locked}
      data-testid={`asset-folder-${folder.id}`}
      title={locked ? '批量模式下不能进入文件夹' : folder.name}
      onClick={onOpen}
      className={cn(
        'overflow-hidden rounded-xl bg-surface text-left ring-1 ring-ink-100 transition-shadow',
        locked ? 'cursor-not-allowed opacity-45' : 'hover:shadow-[var(--shadow-float)]',
      )}
    >
      <div className="flex aspect-[4/3] items-center justify-center bg-ink-50 text-ink-300">
        <IconFolder size={34} />
      </div>
      <div className="p-2">
        <div className="truncate text-[12px] font-medium text-ink-900">{folder.name}</div>
        <div className="mt-0.5 text-[10px] tabular-nums text-ink-400">{count} 个资产</div>
      </div>
    </button>
  )
}

function AssetThumbnail({ asset }: { asset: Asset }) {
  const hue = hueOf(asset.id)

  if (asset.thumbnailUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={asset.thumbnailUrl} alt="" className="h-full w-full object-cover" />
    )
  }

  if (asset.kind === 'audio') return <Waveform seed={asset.id} hue={hue} />

  return (
    <div
      className="flex h-full w-full items-center justify-center text-white/80"
      style={{
        background: `linear-gradient(145deg, hsl(${hue} 52% 66%), hsl(${(hue + 42) % 360} 48% 44%))`,
      }}
    >
      {asset.kind === 'video' ? (
        <IconVideo size={26} />
      ) : asset.kind === 'text' ? (
        <IconText size={26} />
      ) : (
        <IconImage size={26} />
      )}
    </div>
  )
}

/** Audio has no frame to show, so the id drives a stable stand-in waveform. */
function Waveform({ seed, hue }: { seed: string; hue: number }) {
  const bars = useMemo(() => {
    const base = hueOf(seed) + 7
    return Array.from({ length: 30 }, (_, i) => {
      // Offset per bar rather than multiplied by it: a multiplicative mix
      // collapses to a flat line whenever the seed lands on a multiple of 100.
      const wobble = (base * 7919 + (i + 3) * 104729) % 100
      return 0.18 + (wobble / 100) * 0.78
    })
  }, [seed])

  return (
    <div
      className="flex h-full w-full items-center gap-[2px] px-3"
      style={{ background: `linear-gradient(145deg, hsl(${hue} 30% 94%), hsl(${hue} 24% 86%))` }}
    >
      {bars.map((height, i) => (
        <span
          key={i}
          className="flex-1 rounded-full"
          style={{ height: `${Math.round(height * 100)}%`, background: `hsl(${hue} 45% 52% / 0.75)` }}
        />
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Small shared pieces
 * ------------------------------------------------------------------ */

function CheckBox({ checked, tone = 'dark' }: { checked: boolean; tone?: 'dark' | 'light' }) {
  return (
    <span
      className={cn(
        'flex h-[18px] w-[18px] items-center justify-center rounded-md border transition-colors',
        checked
          ? 'border-accent bg-accent text-white'
          : tone === 'light'
            ? 'border-ink-300 bg-surface text-transparent'
            : 'border-white/80 bg-ink-900/25 text-transparent',
      )}
    >
      <IconCheck size={12} />
    </span>
  )
}

function BarButton({
  children,
  onClick,
  disabled,
  danger,
  testId,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  testId?: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      data-testid={testId}
      onClick={onClick}
      className={cn(
        'rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors',
        disabled
          ? 'cursor-not-allowed bg-ink-50 text-ink-300'
          : danger
            ? 'bg-danger/10 text-danger hover:bg-danger/16'
            : 'bg-ink-100 text-ink-700 hover:bg-ink-200',
      )}
    >
      {children}
    </button>
  )
}

function FooterButton({
  children,
  onClick,
  primary,
  testId,
}: {
  children: ReactNode
  onClick: () => void
  primary?: boolean
  testId?: string
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={cn(
        'rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors',
        primary ? 'bg-ink-900 text-white hover:opacity-90' : 'text-ink-600 hover:bg-ink-50',
      )}
    >
      {children}
    </button>
  )
}

function FolderOption({
  label,
  icon,
  selected,
  onSelect,
}: {
  label: string
  icon: ReactNode
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] transition-colors',
        selected ? 'bg-accent-soft text-accent-ink' : 'text-ink-700 hover:bg-ink-50',
      )}
    >
      <span className={selected ? 'text-accent' : 'text-ink-400'}>{icon}</span>
      <span className="flex-1 truncate text-left">{label}</span>
      {selected && <IconCheck size={14} className="text-accent" />}
    </button>
  )
}

function cardMenuSections(
  asset: Asset,
  actions: { onRename: () => void; onTags: () => void; onMove: () => void; onDelete: () => void },
): MenuSection[] {
  return [
    {
      items: [
        { id: 'rename', label: '重命名', icon: <IconRename size={14} />, onSelect: actions.onRename },
        { id: 'tags', label: '修改标签', icon: <IconFilter size={14} />, onSelect: actions.onTags },
        { id: 'move', label: '移动', icon: <IconFolder size={14} />, onSelect: actions.onMove },
      ],
    },
    {
      items: [
        {
          id: 'delete',
          label: '删除',
          icon: <IconTrash size={14} />,
          danger: true,
          onSelect: actions.onDelete,
        },
      ],
    },
  ]
}

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

function describeAsset(asset: Asset): string {
  const parts: string[] = []
  if (asset.width && asset.height) parts.push(`${asset.width}×${asset.height}`)
  if (asset.durationSeconds) parts.push(formatDuration(asset.durationSeconds))
  if (parts.length === 0) parts.push(KIND_LABEL[asset.kind])
  return parts.join(' · ')
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}s`
  // Round once, up front: rounding the remainder on its own turns 119.6s into
  // "1:60" because the carry never reaches the minutes.
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** Deterministic hue so a thumbnail-less asset keeps the same colour forever. */
function hueOf(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) % 360
  return hash
}
