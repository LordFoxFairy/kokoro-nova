'use client'

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'

import { client } from '@/api/client'
import type {
  ScriptV2Asset,
  ScriptV2AssetGenerationSettings,
  ScriptV2AssetRemovalMode,
  ScriptV2AssetRole,
  ScriptV2Assets as ScriptV2AssetBuckets,
  ScriptV2State,
} from '@/domain/script-v2'
import {
  removeScriptV2Asset,
  renameScriptV2Asset,
  updateScriptV2Asset,
} from '@/domain/script-v2'
import type { Asset } from '@/domain/types'
import { IconImage, IconLocate, IconMore, IconPlus, IconSparkle, IconTrash, IconUpload } from '../icons'
import {
  ScriptV2AssetDeleteDialog,
  ScriptV2AssetDetailDialog,
  ScriptV2BatchAssetDialog,
  ScriptV2AssetSourceDialog,
  SCRIPT_V2_ASSET_ROLE_LABELS,
  type ScriptV2BatchAssetRequest,
  type ScriptV2BatchAssetResult,
  type ScriptV2CanvasImageCandidate,
} from './ScriptV2Dialogs'
import type { ScriptV2StateChange } from './ScriptV2Workspace'

const FIXTURE_TIMESTAMP = '2026-09-04T00:00:00.000Z'

const ASSET_SECTIONS: Array<{
  role: ScriptV2AssetRole
  bucket: keyof ScriptV2AssetBuckets
}> = [
  { role: 'character', bucket: 'characters' },
  { role: 'scene', bucket: 'scenes' },
  { role: 'prop', bucket: 'props' },
]

const STATUS_LABEL: Record<ScriptV2Asset['status'], string> = {
  pending: '待创建',
  generating: '生成中',
  ready: '已生成',
  failed: '生成失败',
  lost: '资源丢失',
}

export interface ScriptV2AssetsProps {
  canvasId: string
  nodeId: string
  canvasImages: ScriptV2CanvasImageCandidate[]
  state: ScriptV2State
  onStateChange: (change: ScriptV2StateChange, label?: string) => void | Promise<void>
  onLocateNode?: (nodeId: string) => void
  onChildSurfaceChange?: (open: boolean) => void
}

function pendingAsset(state: ScriptV2State, role: ScriptV2AssetRole): ScriptV2Asset {
  const ordinal = state.nextAssetOrdinal
  const safeSeed = state.identitySeed.replaceAll(/[^a-zA-Z0-9_-]/g, '').slice(-20) || 'script-v2'
  return {
    id: `script_asset_${safeSeed}_${ordinal}`,
    role,
    name: `未命名${SCRIPT_V2_ASSET_ROLE_LABELS[role]}`,
    description: '',
    source: 'ai',
    status: 'pending',
    createdAt: FIXTURE_TIMESTAMP,
    updatedAt: FIXTURE_TIMESTAMP,
  }
}

function appendAsset(state: ScriptV2State, asset: ScriptV2Asset): ScriptV2State {
  const section = ASSET_SECTIONS.find((candidate) => candidate.role === asset.role)
  if (!section) return state
  return {
    ...state,
    nextAssetOrdinal: state.nextAssetOrdinal + 1,
    assets: {
      ...state.assets,
      [section.bucket]: [...state.assets[section.bucket], asset],
    },
  }
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

/** Stage-two grouped asset board. Creation persists the pending card first. */
export function ScriptV2Assets({
  canvasId,
  nodeId,
  canvasImages,
  state,
  onStateChange,
  onLocateNode,
  onChildSurfaceChange,
}: ScriptV2AssetsProps) {
  const [sourceAsset, setSourceAsset] = useState<ScriptV2Asset | null>(null)
  const [initialSource, setInitialSource] = useState<'ai' | 'canvas' | 'upload' | 'library' | null>(null)
  const [detailAssetId, setDetailAssetId] = useState<string | null>(null)
  const [deleteAssetId, setDeleteAssetId] = useState<string | null>(null)
  const [deleteMode, setDeleteMode] = useState<ScriptV2AssetRemovalMode>('keep-text')
  const [menu, setMenu] = useState<{ asset: ScriptV2Asset; x: number; y: number } | null>(null)
  const [batchOpen, setBatchOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const allAssets = [...state.assets.characters, ...state.assets.scenes, ...state.assets.props]
  const detailAsset = allAssets.find((asset) => asset.id === detailAssetId) ?? null
  const deleteAsset = allAssets.find((asset) => asset.id === deleteAssetId) ?? null
  const childSurfaceOpen = Boolean(sourceAsset || detailAsset || deleteAsset || menu || batchOpen)

  useEffect(() => {
    onChildSurfaceChange?.(childSurfaceOpen)
  }, [childSurfaceOpen, onChildSurfaceChange])

  useEffect(
    () => () => {
      onChildSurfaceChange?.(false)
    },
    [onChildSurfaceChange],
  )

  const beginAsset = (role: ScriptV2AssetRole) => {
    const asset = pendingAsset(state, role)
    setInitialSource(null)
    setSourceAsset(asset)
    void onStateChange(
      (current) => appendAsset(current, asset),
      `新增${SCRIPT_V2_ASSET_ROLE_LABELS[role]}资产`,
    )
  }

  const executeAsset = async (
    asset: ScriptV2Asset,
    prompt: string,
    requestedSettings: ScriptV2AssetGenerationSettings,
  ) => {
    const settings = { ...requestedSettings, prompt }
    const prepared: ScriptV2Asset = {
      ...asset,
      description: prompt,
      source: 'ai',
      status: 'generating',
      generation: settings,
      error: undefined,
      updatedAt: FIXTURE_TIMESTAMP,
    }
    await onStateChange(
      (current) => updateScriptV2Asset(current, prepared.id, prepared),
      `生成${SCRIPT_V2_ASSET_ROLE_LABELS[prepared.role]}资产`,
    )

    try {
      let response = await client.scriptV2.createRun({
        idempotencyKey: `asset_${fnv1a(`${prepared.id}:${JSON.stringify(settings)}`)}`,
        canvasId,
        nodeId,
        operation: 'generate-asset',
        input: { asset: prepared, settings },
      })
      for (let poll = 0; poll < 6 && (response.run.status === 'queued' || response.run.status === 'running'); poll += 1) {
        await delay(410)
        response = await client.scriptV2.getRun(response.run.id)
      }
      if (response.run.status !== 'succeeded' || response.run.operation !== 'generate-asset' || !response.run.result) {
        throw new Error(response.run.error ?? '资产生成未完成')
      }
      const generatedAsset = response.run.result.asset
      await onStateChange(
        (current) => updateScriptV2Asset(current, generatedAsset.id, generatedAsset),
        `完成${SCRIPT_V2_ASSET_ROLE_LABELS[prepared.role]}资产`,
      )
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '资产生成失败'
      await onStateChange(
        (current) => updateScriptV2Asset(current, prepared.id, { ...prepared, status: 'failed', error: message }),
        `${SCRIPT_V2_ASSET_ROLE_LABELS[prepared.role]}资产生成失败`,
      )
      throw reason
    }
  }

  const generateAsset = async (
    prompt: string,
    requestedSettings: ScriptV2AssetGenerationSettings,
  ) => {
    if (!sourceAsset) throw new Error('待生成资产不存在')
    await executeAsset(sourceAsset, prompt, requestedSettings)
    setSourceAsset(null)
    setInitialSource(null)
  }

  const generateBatch = async (
    requests: ScriptV2BatchAssetRequest[],
    shared: Omit<ScriptV2AssetGenerationSettings, 'prompt'>,
  ): Promise<ScriptV2BatchAssetResult[]> => {
    const results: ScriptV2BatchAssetResult[] = []
    for (const request of requests) {
      try {
        await executeAsset(request.asset, request.prompt, { ...shared, prompt: request.prompt })
        results.push({ assetId: request.asset.id, name: request.asset.name, status: 'succeeded' })
      } catch (reason) {
        results.push({
          assetId: request.asset.id,
          name: request.asset.name,
          status: 'failed',
          error: reason instanceof Error ? reason.message : '生成失败',
        })
      }
    }
    return results
  }

  const finishSource = async (
    patch: Pick<ScriptV2Asset, 'source' | 'thumbnailUrl'> & Partial<ScriptV2Asset>,
    label: string,
  ) => {
    if (!sourceAsset) throw new Error('待准备资产不存在')
    const ready = {
      ...patch,
      status: 'ready',
      error: undefined,
      updatedAt: FIXTURE_TIMESTAMP,
    } satisfies Partial<ScriptV2Asset>
    await onStateChange((current) => updateScriptV2Asset(current, sourceAsset.id, ready), label)
    setSourceAsset(null)
    setInitialSource(null)
  }

  const openSource = (asset: ScriptV2Asset, source: typeof initialSource) => {
    setMenu(null)
    setInitialSource(source)
    setSourceAsset(asset)
  }

  const clearImage = (asset: ScriptV2Asset) => {
    setMenu(null)
    void onStateChange(
      (current) => updateScriptV2Asset(current, asset.id, {
        status: 'pending',
        thumbnailUrl: undefined,
        linkedNodeId: undefined,
        sourceImageRef: undefined,
        generation: undefined,
        error: undefined,
        updatedAt: FIXTURE_TIMESTAMP,
      }),
      `清除${SCRIPT_V2_ASSET_ROLE_LABELS[asset.role]}资产图片`,
    )
  }

  const saveToLibrary = async (asset: ScriptV2Asset) => {
    setMenu(null)
    if (asset.source !== 'canvas' || !asset.sourceImageRef) return
    setActionError(null)
    try {
      const saved = await client.raw.post<Asset>('/api/assets', {
        artifactId: asset.sourceImageRef,
        name: asset.name,
        namespace: 'personal',
      })
      await onStateChange(
        (current) => updateScriptV2Asset(current, asset.id, {
          source: 'library',
          sourceImageRef: saved.id,
          thumbnailUrl: saved.thumbnailUrl ?? saved.url,
          updatedAt: FIXTURE_TIMESTAMP,
        }),
        `保存${SCRIPT_V2_ASSET_ROLE_LABELS[asset.role]}到个人资产`,
      )
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : '保存到个人资产失败')
    }
  }

  return (
    <div data-testid="script-v2-assets" className="thin-scrollbar relative min-h-0 flex-1 overflow-y-auto bg-[#171717] px-6 py-5">
      {actionError && (
        <div role="alert" className="sticky top-0 z-10 mb-3 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-[10px] text-red-200">
          {actionError}
        </div>
      )}
      <div className="space-y-7 pb-8">
        <div className="flex items-center justify-between border-b border-white/7 pb-4">
          <div>
            <h2 className="text-[13px] font-medium text-white/78">资产准备</h2>
            <p className="mt-1 text-[10px] text-white/30">为镜头统一角色、场景与道具的视觉设定</p>
          </div>
          <button
            type="button"
            disabled={allAssets.length === 0}
            onClick={() => setBatchOpen(true)}
            className="flex h-9 items-center gap-2 rounded-xl border border-white/12 bg-white/[0.045] px-3.5 text-[11px] font-medium text-white/68 hover:bg-white/[0.075] hover:text-white disabled:cursor-not-allowed disabled:opacity-25"
          >
            <IconSparkle size={14} />
            一键生成资产
          </button>
        </div>
        {ASSET_SECTIONS.map((section) => {
          const label = SCRIPT_V2_ASSET_ROLE_LABELS[section.role]
          const assets = state.assets[section.bucket]
          return (
            <section key={section.role} role="region" aria-label={label} className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-[13px] font-medium text-white/82">{label}</h3>
                <span className="text-[10px] text-white/30">{assets.length}</span>
              </div>
              <div className="flex flex-wrap gap-3">
                {assets.map((asset) => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    onOpenDetails={() => setDetailAssetId(asset.id)}
                    onOpenMenu={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect()
                      setMenu({ asset, x: rect.right, y: rect.bottom + 6 })
                    }}
                  />
                ))}
                <button
                  type="button"
                  aria-label={`新增${label}`}
                  onClick={() => beginAsset(section.role)}
                  className="flex h-[152px] w-[152px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/16 text-white/30 hover:border-white/30 hover:bg-white/[0.025] hover:text-white/58"
                >
                  <IconPlus size={22} />
                  <span className="text-[11px]">新增</span>
                </button>
              </div>
            </section>
          )
        })}
      </div>

      <ScriptV2AssetSourceDialog
        open={Boolean(sourceAsset)}
        role={sourceAsset?.role ?? 'character'}
        initialSource={initialSource}
        canvasImages={canvasImages}
        onChoose={() => {
          // Source-specific forms replace this slot in the next increments of Task 9.
        }}
        onGenerate={generateAsset}
        onSelectCanvas={(candidate) =>
          finishSource(
            {
              source: 'canvas',
              ...(/^未命名/.test(sourceAsset?.name ?? '') ? { name: candidate.name } : {}),
              thumbnailUrl: candidate.url,
              linkedNodeId: candidate.nodeId,
              sourceImageRef: candidate.artifactId ?? candidate.url,
            },
            `从画布选择${sourceAsset ? SCRIPT_V2_ASSET_ROLE_LABELS[sourceAsset.role] : ''}资产`,
          )
        }
        onSelectUpload={(file) =>
          finishSource(
            {
              source: 'upload',
              ...(/^未命名/.test(sourceAsset?.name ?? '')
                ? { name: file.name.replace(/\.[^.]+$/, '') || file.name }
                : {}),
              thumbnailUrl: URL.createObjectURL(file),
              sourceImageRef: file.name,
              linkedNodeId: undefined,
            },
            `上传${sourceAsset ? SCRIPT_V2_ASSET_ROLE_LABELS[sourceAsset.role] : ''}资产`,
          )
        }
        onSelectLibrary={(asset: Asset) =>
          finishSource(
            {
              source: 'library',
              ...(/^未命名/.test(sourceAsset?.name ?? '') ? { name: asset.name } : {}),
              thumbnailUrl: asset.thumbnailUrl ?? asset.url,
              sourceImageRef: asset.id,
              linkedNodeId: undefined,
            },
            `选择个人${sourceAsset ? SCRIPT_V2_ASSET_ROLE_LABELS[sourceAsset.role] : ''}资产`,
          )
        }
        onClose={() => {
          setSourceAsset(null)
          setInitialSource(null)
        }}
      />

      <ScriptV2AssetDetailDialog
        asset={detailAsset}
        onSave={async (name, description) => {
          if (!detailAsset) return
          await onStateChange(
            (current) => renameScriptV2Asset(current, detailAsset.id, { name, description }),
            `编辑${SCRIPT_V2_ASSET_ROLE_LABELS[detailAsset.role]}资产`,
          )
          setDetailAssetId(null)
        }}
        onClose={() => setDetailAssetId(null)}
      />

      <ScriptV2AssetDeleteDialog
        asset={deleteAsset}
        mode={deleteMode}
        onModeChange={setDeleteMode}
        onConfirm={async () => {
          if (!deleteAsset) return
          await onStateChange(
            (current) => removeScriptV2Asset(current, deleteAsset.id, deleteMode),
            `删除${SCRIPT_V2_ASSET_ROLE_LABELS[deleteAsset.role]}资产`,
          )
          setDeleteAssetId(null)
        }}
        onClose={() => setDeleteAssetId(null)}
      />

      <ScriptV2BatchAssetDialog
        open={batchOpen}
        assets={allAssets}
        onGenerate={generateBatch}
        onClose={() => setBatchOpen(false)}
      />

      {menu && (
        <AssetActionMenu
          asset={menu.asset}
          anchor={{ x: menu.x, y: menu.y }}
          onClose={() => setMenu(null)}
          onChooseImage={() => openSource(menu.asset, null)}
          onGenerate={() => openSource(menu.asset, 'ai')}
          onLocate={() => {
            setMenu(null)
            if (menu.asset.linkedNodeId) onLocateNode?.(menu.asset.linkedNodeId)
          }}
          onClear={() => clearImage(menu.asset)}
          onSave={() => void saveToLibrary(menu.asset)}
          onDelete={() => {
            setMenu(null)
            setDeleteMode('keep-text')
            setDeleteAssetId(menu.asset.id)
          }}
        />
      )}
    </div>
  )
}

function AssetCard({
  asset,
  onOpenDetails,
  onOpenMenu,
}: {
  asset: ScriptV2Asset
  onOpenDetails: () => void
  onOpenMenu: (event: ReactMouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <article
      data-testid="script-v2-asset-card"
      data-asset-id={asset.id}
      data-asset-status={asset.status}
      className="relative h-[152px] w-[152px] overflow-hidden rounded-xl border border-white/10 bg-white/[0.035]"
    >
      <button type="button" aria-label={`${asset.name} 详情`} onClick={onOpenDetails} className="block h-full w-full text-left">
        {asset.thumbnailUrl ? (
          // Script fixtures are local data/object URLs or already-sanitized library URLs.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.thumbnailUrl} alt={asset.name} className="h-[104px] w-full object-cover" />
        ) : (
          <div className="flex h-[104px] items-center justify-center bg-black/10 text-[11px] text-white/24">
            {STATUS_LABEL[asset.status]}
          </div>
        )}
        <div className="px-2.5 py-2">
          <p className="truncate text-[11px] font-medium text-white/72">{asset.name}</p>
          <p className="mt-0.5 text-[9px] text-white/32">{STATUS_LABEL[asset.status]}</p>
        </div>
      </button>
      <button
        type="button"
        aria-label={`${asset.name} 更多操作`}
        onClick={onOpenMenu}
        className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-black/35 text-white/55 backdrop-blur hover:bg-black/55 hover:text-white"
      >
        <IconMore size={14} />
      </button>
    </article>
  )
}

function AssetActionMenu({
  asset,
  anchor,
  onClose,
  onChooseImage,
  onGenerate,
  onLocate,
  onClear,
  onSave,
  onDelete,
}: {
  asset: ScriptV2Asset
  anchor: { x: number; y: number }
  onClose: () => void
  onChooseImage: () => void
  onGenerate: () => void
  onLocate: () => void
  onClear: () => void
  onSave: () => void
  onDelete: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const hasImage = Boolean(asset.thumbnailUrl || asset.linkedNodeId)
  const alreadySaved = asset.source === 'library'
  const canSave = hasImage && asset.source === 'canvas' && Boolean(asset.sourceImageRef)
  const x = Math.min(anchor.x, typeof window === 'undefined' ? anchor.x : window.innerWidth - 228)
  const y = Math.min(anchor.y, typeof window === 'undefined' ? anchor.y : window.innerHeight - 270)

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('pointerdown', closeOutside, true)
    window.addEventListener('keydown', closeEscape, true)
    return () => {
      window.removeEventListener('pointerdown', closeOutside, true)
      window.removeEventListener('keydown', closeEscape, true)
    }
  }, [onClose])

  const items = [
    { label: '选择图片', icon: <IconImage size={14} />, onClick: onChooseImage },
    { label: `AI 生${SCRIPT_V2_ASSET_ROLE_LABELS[asset.role]}`, icon: <IconSparkle size={14} />, onClick: onGenerate },
    {
      label: '跳转至节点',
      icon: <IconLocate size={14} />,
      onClick: onLocate,
      disabled: !asset.linkedNodeId,
      reason: '资产尚未关联画布节点',
    },
    {
      label: '清除图片',
      icon: <IconTrash size={14} />,
      onClick: onClear,
      disabled: !hasImage,
      reason: '资产尚未准备图片',
    },
    {
      label: '保存到个人资产',
      icon: <IconUpload size={14} />,
      onClick: onSave,
      disabled: alreadySaved || !canSave,
      reason: alreadySaved
        ? '该图片已在个人资产库'
        : !hasImage
          ? '资产尚未准备图片'
          : '当前图片仅是本地预览',
    },
    { label: '删除', icon: <IconTrash size={14} />, onClick: onDelete, danger: true },
  ]

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`${asset.name}资产操作`}
      className="fixed z-[220] w-[220px] overflow-hidden rounded-xl border border-white/12 bg-[#292929] py-1.5 shadow-[0_18px_55px_rgba(0,0,0,.52)]"
      style={{ left: x, top: y }}
    >
      {items.map((item, index) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          title={item.disabled ? item.reason : undefined}
          onClick={item.onClick}
          className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[11px] ${
            item.disabled
              ? 'cursor-not-allowed text-white/22'
              : item.danger
                ? 'text-red-300 hover:bg-red-400/10'
                : 'text-white/68 hover:bg-white/7 hover:text-white/90'
          } ${index === items.length - 1 ? 'mt-1 border-t border-white/8 pt-2.5' : ''}`}
        >
          <span className="text-current opacity-70">{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>
  )
}
