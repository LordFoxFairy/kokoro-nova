'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { client } from '@/api/client'
import {
  imageModelOutputOptions,
  modelOutputOptions,
  MODELS_BY_ID,
  quoteCredits,
  VIDEO_MODE_LABELS,
  type ImageAspectRatio,
  type ImageQuality,
  type ImageResolution,
  type ModelAspectRatio,
  type ModelDefinition,
  type ModelResolution,
} from '@/domain/models'
import type {
  ScriptV2Asset,
  ScriptV2AssetGenerationSettings,
  ScriptV2AssetRemovalMode,
  ScriptV2AssetRole,
  ScriptV2State,
} from '@/domain/script-v2'
import { scriptV2BatchRowBlockedReason } from '@/domain/script-v2'
import type { ScriptV2BatchKind, ScriptV2BatchMaterializeOptions } from '@/domain/script-v2-mock'
import type { Asset } from '@/domain/types'
import { cn } from '@/lib/cn'
import { ImageModelCatalog } from '../image/ImageModelCatalog'
import { VideoModelCatalog } from '../video/VideoModelCatalog'
import {
  IconAssetLibrary,
  IconCheck,
  IconChevronDown,
  IconClose,
  IconCredit,
  IconImage,
  IconSparkle,
  IconTrash,
  IconUpload,
  IconVideo,
  IconWarning,
} from '../icons'
import { Spinner } from '../ui/controls'

const ROLE_LABEL: Record<ScriptV2AssetRole, string> = {
  character: '角色',
  scene: '场景',
  prop: '道具',
}

interface ScriptV2DialogFocusOptions {
  /** Floating editors can let Tab leave so their blur handlers can save drafts. */
  trap?: boolean
}

/** Keep keyboard focus inside transient Script V2 surfaces and return it to the trigger. */
export function useScriptV2DialogFocus(open: boolean, { trap = true }: ScriptV2DialogFocusOptions = {}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    if (!dialog) return

    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]):not([tabindex="-1"]), [href], input:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => element.getAttribute('aria-hidden') !== 'true')
    // Child controls such as an auto-focused input run during the same commit.
    // Do not steal that focus back to the first button: doing so can trigger a
    // draft's blur handler while the surface is still being mounted.
    if (!dialog.contains(document.activeElement)) {
      const first = focusable()[0]
      ;(first ?? dialog).focus()
    }

    const restoreFocus = () => {
      const active = document.activeElement
      // When focus moved to another live control (for example, Tab from a
      // text editor), preserve the browser's destination. Explicit closes,
      // however, still return focus to the trigger.
      if (
        restoreFocusRef.current &&
        document.contains(restoreFocusRef.current) &&
        (!active || active === document.body || dialog.contains(active))
      ) {
        restoreFocusRef.current.focus()
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!trap) return
      if (event.key !== 'Tab' || !dialog.contains(document.activeElement)) return
      const elements = focusable()
      if (elements.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const firstElement = elements[0]
      const lastElement = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    }
    if (trap) window.addEventListener('keydown', onKeyDown, true)
    return () => {
      if (trap) window.removeEventListener('keydown', onKeyDown, true)
      restoreFocus()
    }
  }, [open, trap])

  return dialogRef
}

export interface ScriptV2CanvasImageCandidate {
  nodeId: string
  name: string
  url: string
  artifactId?: string
}

interface ScriptV2AssetSourceDialogProps {
  open: boolean
  role: ScriptV2AssetRole
  initialSource?: 'ai' | 'canvas' | 'upload' | 'library' | null
  canvasImages: ScriptV2CanvasImageCandidate[]
  onChoose: (source: 'ai' | 'canvas' | 'upload' | 'library') => void
  onGenerate: (prompt: string, settings: ScriptV2AssetGenerationSettings) => Promise<void>
  onSelectCanvas: (candidate: ScriptV2CanvasImageCandidate) => Promise<void>
  onSelectUpload: (file: File) => Promise<void>
  onSelectLibrary: (asset: Asset) => Promise<void>
  onClose: () => void
}

const SOURCES: Array<{
  id: 'ai' | 'canvas' | 'upload' | 'library'
  label: string
  icon: ReactNode
}> = [
  { id: 'ai', label: 'AI生成', icon: <IconSparkle size={17} /> },
  { id: 'canvas', label: '从当前画布选择', icon: <IconImage size={17} /> },
  { id: 'upload', label: '本地上传', icon: <IconUpload size={17} /> },
  { id: 'library', label: '个人资产库', icon: <IconAssetLibrary size={17} /> },
]

/** First layer of the staged Script V2 asset creation flow. */
export function ScriptV2AssetSourceDialog({
  open,
  role,
  initialSource = null,
  canvasImages,
  onChoose,
  onGenerate,
  onSelectCanvas,
  onSelectUpload,
  onSelectLibrary,
  onClose,
}: ScriptV2AssetSourceDialogProps) {
  const [activeSource, setActiveSource] = useState<'ai' | 'canvas' | 'upload' | 'library' | null>(null)
  const dialogRef = useScriptV2DialogFocus(open)

  useEffect(() => {
    if (open) setActiveSource(initialSource)
  }, [initialSource, open, role])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose, open])

  if (!open) return null

  const label = ROLE_LABEL[role]
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`新增${label}`}
      data-testid="script-v2-asset-source-dialog"
      ref={dialogRef}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/58 p-3 backdrop-blur-[1px] sm:p-6"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="max-h-[calc(100vh-24px)] w-full max-w-[720px] overflow-y-auto rounded-2xl border border-white/10 bg-[#242424] shadow-[0_24px_90px_rgba(0,0,0,.54)] sm:max-h-[calc(100vh-48px)]">
        <header className="flex h-16 items-center border-b border-white/8 px-6">
          <h2 className="text-[15px] font-medium text-white/90">新增{label}</h2>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-white/38 hover:bg-white/8 hover:text-white/78"
          >
            <IconClose size={16} />
          </button>
        </header>

        <div className="min-h-[360px] p-6">
          <div data-testid="script-v2-asset-sources" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {SOURCES.map((source) => (
              <button
                key={source.id}
                type="button"
                aria-pressed={activeSource === source.id}
                onClick={() => {
                  setActiveSource(source.id)
                  onChoose(source.id)
                }}
                className={cn(
                  'flex h-14 items-center gap-3 rounded-xl border px-4 text-left text-[12px] font-medium hover:border-white/20 hover:bg-white/[0.065] hover:text-white',
                  activeSource === source.id
                    ? 'border-white/22 bg-white/[0.075] text-white'
                    : 'border-white/10 bg-white/[0.035] text-white/72',
                )}
              >
                <span aria-hidden="true" className="text-white/40">{source.icon}</span>
                {source.label}
              </button>
            ))}
          </div>
          {activeSource === 'ai' && <AssetAiForm onGenerate={onGenerate} />}
          {activeSource === 'canvas' && (
            <CanvasImageSource candidates={canvasImages} onSelect={onSelectCanvas} />
          )}
          {activeSource === 'upload' && <UploadImageSource onSelect={onSelectUpload} />}
          {activeSource === 'library' && <LibraryImageSource onSelect={onSelectLibrary} />}
          {activeSource === null && (
            <div className="flex min-h-[230px] items-center justify-center text-[11px] text-white/28">
              选择一种来源继续准备{label}资产
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function ScriptV2AssetDetailDialog({
  asset,
  onSave,
  onClose,
}: {
  asset: ScriptV2Asset | null
  onSave: (name: string, description: string) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setName(asset?.name ?? '')
    setDescription(asset?.description ?? '')
    setSaving(false)
  }, [asset])

  useEffect(() => {
    if (!asset) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [asset, onClose])

  if (!asset) return null
  const roleLabel = ROLE_LABEL[asset.role]
  return (
    <DialogLayer ariaLabel={`编辑${roleLabel}资产`} testId="script-v2-asset-detail-dialog">
      <header className="flex h-16 items-center border-b border-white/8 px-6">
        <div>
          <h2 className="text-[15px] font-medium text-white/90">编辑{roleLabel}资产</h2>
          <p className="mt-0.5 text-[10px] text-white/30">稳定 ID 保持不变，引用会随名称同步</p>
        </div>
        <DialogClose onClose={onClose} />
      </header>
      <div className="space-y-4 p-6">
        <label className="block">
          <span className="mb-1.5 block text-[10px] text-white/40">资产名称</span>
          <input
            aria-label="资产名称"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-10 w-full rounded-xl border border-white/10 bg-black/15 px-3 text-[12px] text-white/82 outline-none focus:border-white/24"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[10px] text-white/40">资产描述</span>
          <textarea
            aria-label="资产描述"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={5}
            className="w-full resize-none rounded-xl border border-white/10 bg-black/15 p-3 text-[12px] leading-relaxed text-white/82 outline-none focus:border-white/24"
          />
        </label>
      </div>
      <footer className="flex items-center justify-end gap-2 border-t border-white/8 px-6 py-4">
        <button type="button" onClick={onClose} className="h-9 rounded-lg px-4 text-[11px] text-white/52 hover:bg-white/7">
          取消
        </button>
        <button
          type="button"
          disabled={!name.trim() || saving}
          onClick={async () => {
            setSaving(true)
            try {
              await onSave(name.trim(), description.trim())
            } finally {
              setSaving(false)
            }
          }}
          className="h-9 rounded-lg bg-white px-4 text-[11px] font-medium text-[#202020] disabled:opacity-30"
        >
          {saving ? '保存中' : '保存修改'}
        </button>
      </footer>
    </DialogLayer>
  )
}

export function ScriptV2AssetDeleteDialog({
  asset,
  mode,
  onModeChange,
  onConfirm,
  onClose,
}: {
  asset: ScriptV2Asset | null
  mode: ScriptV2AssetRemovalMode
  onModeChange: (mode: ScriptV2AssetRemovalMode) => void
  onConfirm: () => Promise<void>
  onClose: () => void
}) {
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!asset) setDeleting(false)
  }, [asset])

  useEffect(() => {
    if (!asset) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [asset, onClose])

  if (!asset) return null
  const options: Array<{
    id: ScriptV2AssetRemovalMode
    title: string
    description: string
  }> = [
    {
      id: 'keep-text',
      title: '仅删除资产，保留分镜中的文字',
      description: '仅解除资产引用，镜头中已经写好的文字保持不变。',
    },
    {
      id: 'remove-references',
      title: '同时从分镜角色列表中移除',
      description: `同步移除镜头里的 @${asset.name} 引用文字和角色关联。`,
    },
  ]
  return (
    <DialogLayer ariaLabel={`删除「${asset.name}」`} testId="script-v2-asset-delete-dialog" width="max-w-[520px]">
      <header className="flex h-16 items-center border-b border-white/8 px-6">
        <span className="mr-3 flex h-9 w-9 items-center justify-center rounded-xl bg-red-400/10 text-red-300">
          <IconTrash size={16} />
        </span>
        <div>
          <h2 className="text-[15px] font-medium text-white/90">删除「{asset.name}」</h2>
          <p className="mt-0.5 text-[10px] text-white/30">选择如何处理已经使用该资产的分镜</p>
        </div>
        <DialogClose onClose={onClose} />
      </header>
      <div role="radiogroup" aria-label="删除影响" className="space-y-2 p-6">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={mode === option.id}
            onClick={() => onModeChange(option.id)}
            className={cn(
              'flex w-full gap-3 rounded-xl border p-3.5 text-left',
              mode === option.id
                ? 'border-white/28 bg-white/[0.075]'
                : 'border-white/10 bg-white/[0.025] hover:border-white/18',
            )}
          >
            <span className={cn(
              'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
              mode === option.id ? 'border-white bg-white text-[#202020]' : 'border-white/25',
            )}>
              {mode === option.id && <IconCheck size={10} />}
            </span>
            <span>
              <span className="block text-[12px] font-medium text-white/78">{option.title}</span>
              <span className="mt-1 block text-[10px] leading-relaxed text-white/35">{option.description}</span>
            </span>
          </button>
        ))}
        <p className="px-1 pt-2 text-[10px] leading-relaxed text-white/30">
          两种方式都会让受影响镜头的最终提示词进入需重算状态。
        </p>
      </div>
      <footer className="flex items-center justify-end gap-2 border-t border-white/8 px-6 py-4">
        <button type="button" onClick={onClose} className="h-9 rounded-lg px-4 text-[11px] text-white/52 hover:bg-white/7">
          取消
        </button>
        <button
          type="button"
          disabled={deleting}
          onClick={async () => {
            setDeleting(true)
            try {
              await onConfirm()
            } finally {
              setDeleting(false)
            }
          }}
          className="h-9 rounded-lg bg-red-500 px-4 text-[11px] font-medium text-white disabled:opacity-40"
        >
          {deleting ? '删除中' : '确认删除'}
        </button>
      </footer>
    </DialogLayer>
  )
}

export interface ScriptV2BatchAssetRequest {
  asset: ScriptV2Asset
  prompt: string
}

export interface ScriptV2BatchAssetResult {
  assetId: string
  name: string
  status: 'succeeded' | 'failed'
  error?: string
}

type SharedAssetGenerationSettings = Omit<ScriptV2AssetGenerationSettings, 'prompt'>

export function ScriptV2BatchAssetDialog({
  open,
  assets,
  onGenerate,
  onClose,
}: {
  open: boolean
  assets: ScriptV2Asset[]
  onGenerate: (
    requests: ScriptV2BatchAssetRequest[],
    settings: SharedAssetGenerationSettings,
  ) => Promise<ScriptV2BatchAssetResult[]>
  onClose: () => void
}) {
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [prompts, setPrompts] = useState<Record<string, string>>({})
  const [modelId, setModelId] = useState('lib-image-2')
  const [quality, setQuality] = useState<ImageQuality>('standard')
  const [resolution, setResolution] = useState<ImageResolution>('2K')
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>('2:1')
  const [quote, setQuote] = useState<number | null>(null)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<ScriptV2BatchAssetResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const wasOpen = useRef(false)
  const model = MODELS_BY_ID.get(modelId)
  const capabilities = useMemo(() => imageModelOutputOptions(modelId), [modelId])
  const selectedAssets = assets.filter((asset) => selected[asset.id])

  useEffect(() => {
    if (open && !wasOpen.current) {
      setSelected(Object.fromEntries(assets.map((asset) => [asset.id, true])))
      setPrompts(Object.fromEntries(assets.map((asset) => [asset.id, asset.description || asset.name])))
      setModelId('lib-image-2')
      setQuality('standard')
      setResolution('2K')
      setAspectRatio('2:1')
      setResults(null)
      setRunning(false)
      setError(null)
    }
    wasOpen.current = open
  }, [assets, open])

  useEffect(() => {
    if (!open) return
    if (selectedAssets.length === 0) {
      setQuote(0)
      return
    }
    const controller = new AbortController()
    setQuote(null)
    void client.scriptV2
      .quote(
        {
          operation: 'generate-asset',
          modelId,
          assetCount: selectedAssets.length,
          quality,
          resolution,
          aspectRatio,
        },
        { signal: controller.signal },
      )
      .then((response) => setQuote(response.quote.credits))
      .catch((reason: unknown) => {
        if (reason instanceof Error && reason.name === 'AbortError') return
        setError(reason instanceof Error ? reason.message : '报价失败')
      })
    return () => controller.abort()
  }, [aspectRatio, modelId, open, quality, resolution, selectedAssets.length])

  useEffect(() => {
    if (!open || running) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      if (catalogOpen) {
        setCatalogOpen(false)
        return
      }
      onClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [catalogOpen, onClose, open, running])

  if (!open) return null
  const complete = results !== null
  const allSelected = assets.length > 0 && selectedAssets.length === assets.length
  const succeeded = results?.filter((result) => result.status === 'succeeded').length ?? 0
  const failed = results?.filter((result) => result.status === 'failed').length ?? 0

  const selectModel = (next: ModelDefinition) => {
    const nextCapabilities = imageModelOutputOptions(next.id)
    if (!nextCapabilities) return
    setModelId(next.id)
    setQuality(nextCapabilities.qualities.includes(quality) ? quality : nextCapabilities.defaults.quality)
    setResolution(nextCapabilities.resolutions.includes(resolution) ? resolution : nextCapabilities.defaults.resolution)
    setAspectRatio(
      nextCapabilities.aspectRatios.includes(aspectRatio)
        ? aspectRatio
        : nextCapabilities.aspectRatios.includes('2:1')
          ? '2:1'
          : nextCapabilities.defaults.aspectRatio,
    )
    setCatalogOpen(false)
  }

  return (
    <DialogLayer ariaLabel="一键生成资产" testId="script-v2-batch-asset-dialog" width="max-w-[800px]">
      <header className="flex h-16 items-center border-b border-white/8 px-6">
        <div>
          <h2 className="text-[15px] font-medium text-white/90">一键生成资产</h2>
          <p className="mt-0.5 text-[10px] text-white/30">按角色、场景、道具顺序串行生成，本地任务互不覆盖</p>
        </div>
        {!running && <DialogClose onClose={onClose} />}
      </header>

      <div className="grid max-h-[calc(100vh-150px)] grid-cols-1 overflow-y-auto sm:max-h-[560px] sm:grid-cols-[1fr_250px] sm:overflow-hidden">
        <div className="thin-scrollbar overflow-y-auto border-b border-white/8 p-4 sm:border-b-0 sm:border-r sm:p-5">
          <label className="mb-4 flex items-center gap-2 text-[11px] text-white/62">
            <input
              type="checkbox"
              aria-label="全选资产"
              checked={allSelected}
              onChange={(event) => setSelected(Object.fromEntries(assets.map((asset) => [asset.id, event.target.checked])))}
              className="accent-white"
            />
            全选
            <span className="ml-auto text-white/32">已选择 {selectedAssets.length} 个资产</span>
          </label>
          <div className="space-y-5">
            {(['character', 'scene', 'prop'] as const).map((role) => {
              const roleAssets = assets.filter((asset) => asset.role === role)
              return (
                <section key={role} role="region" aria-label={ROLE_LABEL[role]} className="space-y-2">
                  <h3 className="text-[11px] font-medium text-white/48">{ROLE_LABEL[role]} · {roleAssets.length}</h3>
                  {roleAssets.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-white/8 px-3 py-4 text-center text-[10px] text-white/22">暂无{ROLE_LABEL[role]}</div>
                  ) : roleAssets.map((asset) => (
                    <div key={asset.id} className="rounded-xl border border-white/9 bg-white/[0.025] p-3">
                      <label className="flex items-center gap-2 text-[11px] font-medium text-white/68">
                        <input
                          type="checkbox"
                          aria-label={`选择 ${asset.name}`}
                          checked={Boolean(selected[asset.id])}
                          onChange={(event) => setSelected((current) => ({ ...current, [asset.id]: event.target.checked }))}
                          className="accent-white"
                        />
                        {asset.name}
                        <span className="ml-auto text-[9px] text-white/28">{asset.status === 'ready' ? '将覆盖' : '待生成'}</span>
                      </label>
                      <textarea
                        aria-label={`${asset.name}生成提示词`}
                        value={prompts[asset.id] ?? ''}
                        onChange={(event) => setPrompts((current) => ({ ...current, [asset.id]: event.target.value }))}
                        rows={2}
                        disabled={!selected[asset.id] || running}
                        className="mt-2 w-full resize-none rounded-lg border border-white/8 bg-black/12 p-2 text-[10px] leading-relaxed text-white/64 outline-none disabled:opacity-35"
                      />
                    </div>
                  ))}
                </section>
              )
            })}
          </div>
        </div>

        <aside className="relative flex min-w-0 flex-col p-4 sm:p-5">
          <h3 className="text-[11px] font-medium text-white/58">统一生成设置</h3>
          <div className="mt-4 space-y-3">
            <Control label="模型">
              <button
                type="button"
                aria-label={`图片模型 ${model?.label ?? modelId}`}
                disabled={running}
                onClick={() => setCatalogOpen((current) => !current)}
                className="h-9 w-full rounded-lg border border-white/10 bg-white/[0.035] px-2.5 text-left text-[11px] text-white/72"
              >
                {model?.label ?? modelId}
              </button>
            </Control>
            <Control label="画质">
              <select aria-label="画质" value={quality} disabled={running} onChange={(event) => setQuality(event.target.value as ImageQuality)} className="h-9 w-full rounded-lg border border-white/10 bg-[#303030] px-2 text-[11px] text-white/72">
                {(capabilities?.qualities ?? ['low', 'standard', 'high']).map((value) => <option key={value} value={value}>{({ low: '低', standard: '标准', high: '高' } as const)[value]}</option>)}
              </select>
            </Control>
            <Control label="分辨率">
              <select aria-label="分辨率" value={resolution} disabled={running} onChange={(event) => setResolution(event.target.value as ImageResolution)} className="h-9 w-full rounded-lg border border-white/10 bg-[#303030] px-2 text-[11px] text-white/72">
                {(capabilities?.resolutions ?? ['1K', '2K', '4K']).map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </Control>
            <Control label="画幅">
              <select aria-label="画幅" value={aspectRatio} disabled={running} onChange={(event) => setAspectRatio(event.target.value as ImageAspectRatio)} className="h-9 w-full rounded-lg border border-white/10 bg-[#303030] px-2 text-[11px] text-white/72">
                {(capabilities?.aspectRatios ?? ['1:1', '2:1', '16:9']).map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </Control>
          </div>

          <div className="mt-5 rounded-xl border border-white/8 bg-black/10 p-3">
            <div className="flex items-center justify-between text-[10px] text-white/38">
              <span>预计消耗</span>
              <span className="font-medium text-white/74"><span aria-hidden="true">◆ </span><span data-testid="script-v2-batch-asset-quote">{quote ?? '—'}</span></span>
            </div>
          </div>

          {results && (
            <div className="mt-4">
              <p className="text-[11px] font-medium text-white/72">生成完成：成功 {succeeded}，失败 {failed}</p>
              <div className="mt-2 space-y-1.5">
                {results.map((result) => (
                  <p key={result.assetId} data-testid="script-v2-batch-asset-result" className={cn('text-[9px]', result.status === 'succeeded' ? 'text-emerald-300' : 'text-red-300')}>
                    {result.name}{result.status === 'succeeded' ? '生成成功' : `生成失败${result.error ?? ''}`}
                  </p>
                ))}
              </div>
            </div>
          )}
          {error && <p role="alert" className="mt-3 text-[10px] text-red-300">{error}</p>}

          <button
            type="button"
            disabled={!complete && (running || selectedAssets.length === 0 || quote === null || selectedAssets.some((asset) => !(prompts[asset.id] ?? '').trim()))}
            onClick={async () => {
              if (complete) {
                onClose()
                return
              }
              setRunning(true)
              setError(null)
              try {
                const generated = await onGenerate(
                  selectedAssets.map((asset) => ({ asset, prompt: (prompts[asset.id] ?? '').trim() })),
                  { modelId, quality, resolution, aspectRatio },
                )
                setResults(generated)
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : '批量生成失败')
              } finally {
                setRunning(false)
              }
            }}
            className="mt-auto h-10 rounded-xl bg-white text-[11px] font-medium text-[#202020] disabled:cursor-not-allowed disabled:opacity-30"
          >
            {complete ? '完成' : running ? `正在生成 ${selectedAssets.length} 个资产` : `生成 ${selectedAssets.length} 个资产`}
          </button>

          {catalogOpen && (
            <ImageModelCatalog
              currentId={modelId}
              onSelect={selectModel}
              onClose={() => setCatalogOpen(false)}
              className="absolute right-[238px] top-12 z-20 h-[360px] w-[460px]"
            />
          )}
        </aside>
      </div>
    </DialogLayer>
  )
}

type ScriptV2BatchMode = NonNullable<ScriptV2BatchMaterializeOptions['mode']>

/**
 * Configure a graph batch before it is materialized.
 *
 * The dialog deliberately owns only transient selection/settings.  The graph
 * remains untouched until the user confirms and the parent commits the single
 * mutation transaction.  Keeping that boundary here makes the card and the
 * full-screen workspace share exactly the same confirmation semantics.
 */
export interface ScriptV2BatchMaterializeDialogProps {
  open: boolean
  state: ScriptV2State
  kind: ScriptV2BatchKind
  onConfirm: (options: ScriptV2BatchMaterializeOptions) => Promise<void>
  onClose: () => void
}

export function ScriptV2BatchMaterializeDialog({
  open,
  state,
  kind,
  onConfirm,
  onClose,
}: ScriptV2BatchMaterializeDialogProps) {
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [modelId, setModelId] = useState(kind === 'image' ? 'lib-image-2' : 'seedance-2-5')
  const [quality, setQuality] = useState<ImageQuality>('standard')
  const [resolution, setResolution] = useState<ModelResolution>('2K')
  const [aspectRatio, setAspectRatio] = useState<ModelAspectRatio>('16:9')
  const [withAudio, setWithAudio] = useState(false)
  const [videoMode, setVideoMode] = useState<ScriptV2BatchMode>('text2video')
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selectAllRef = useRef<HTMLInputElement>(null)
  const resetKeyRef = useRef<string | null>(null)

  const imageCapabilities = useMemo(() => imageModelOutputOptions(modelId), [modelId])
  const videoCapabilities = useMemo(() => modelOutputOptions(modelId), [modelId])
  const rows = state.rows
  const selectedRows = rows.filter((row) => Boolean(selected[row.id]))
  const selectedIds = selectedRows.map((row) => row.id)
  const allSelected = rows.length > 0 && selectedRows.length === rows.length
  const partiallySelected = selectedRows.length > 0 && !allSelected

  // A new opening, media kind, or row topology starts a clean transaction.
  // Ordinary state updates (typing/prompt progress) keep the user's choices.
  useEffect(() => {
    if (!open) {
      resetKeyRef.current = null
      return
    }
    const key = `${kind}:${state.identitySeed}:${rows.map((row) => row.id).join('|')}`
    if (resetKeyRef.current === key) return
    resetKeyRef.current = key
    setSelected(Object.fromEntries(rows.map((row) => [row.id, true])))
    setCatalogOpen(false)
    setSubmitting(false)
    setError(null)

    if (kind === 'image') {
      const capabilities = imageModelOutputOptions('lib-image-2')
      setModelId('lib-image-2')
      setQuality(capabilities?.defaults.quality ?? 'standard')
      setResolution(capabilities?.defaults.resolution ?? '2K')
      setAspectRatio(capabilities?.defaults.aspectRatio ?? '16:9')
      setWithAudio(false)
      setVideoMode('text2video')
    } else {
      const capabilities = modelOutputOptions('seedance-2-5')
      setModelId('seedance-2-5')
      setQuality('standard')
      setResolution(capabilities?.defaults.resolution ?? '720p')
      setAspectRatio(capabilities?.aspectRatios.includes('16:9') ? '16:9' : (capabilities?.defaults.aspectRatio ?? '16:9'))
      setWithAudio(capabilities?.audio === 'required')
      setVideoMode(capabilities?.modes.includes('text2video') ? 'text2video' : (capabilities?.defaults.mode ?? 'text2video'))
    }
  }, [kind, open, rows, state.identitySeed])

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = partiallySelected
  }, [partiallySelected])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      if (catalogOpen) {
        setCatalogOpen(false)
        return
      }
      if (!submitting) onClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [catalogOpen, onClose, open, submitting])

  const rowReasons = useMemo(
    () => new Map(rows.map((row) => [row.id, scriptV2BatchRowBlockedReason(state, kind, row.id)])),
    [kind, rows, state],
  )
  const invalidSelectedRows = selectedRows.filter((row) => rowReasons.get(row.id))
  const modelSupportsBatch = kind === 'image'
    ? Boolean(imageCapabilities)
    : Boolean(videoCapabilities?.modes.includes('text2video'))
  const modelReason = modelSupportsBatch
    ? null
    : kind === 'video'
      ? '批量分镜视频需要选择支持文生视频的模型'
      : '当前图片模型不可用'
  const validationError = modelReason ?? (invalidSelectedRows[0] ? rowReasons.get(invalidSelectedRows[0].id) ?? null : null)

  const estimatedCredits = useMemo(() => {
    if (selectedRows.length === 0) return 0
    return selectedRows.reduce((total, row) => {
      const output = kind === 'image'
        ? { aspectRatio, resolution, quality, count: 1 as const }
        : {
            aspectRatio,
            resolution,
            durationSeconds: row.durationSeconds,
            count: 1 as const,
            withAudio,
            mode: videoMode,
          }
      return total + quoteCredits(modelId, output).credits
    }, 0)
  }, [aspectRatio, kind, modelId, quality, resolution, selectedRows, videoMode, withAudio])

  if (!open) return null

  const model = MODELS_BY_ID.get(modelId)
  const selectModel = (next: ModelDefinition) => {
    if (kind === 'image') {
      const capabilities = imageModelOutputOptions(next.id)
      if (!capabilities) return
      setModelId(next.id)
      setQuality(capabilities.qualities.includes(quality) ? quality : capabilities.defaults.quality)
      setResolution(capabilities.resolutions.includes(resolution as ImageResolution)
        ? resolution
        : capabilities.defaults.resolution)
      setAspectRatio(capabilities.aspectRatios.includes(aspectRatio as ImageAspectRatio)
        ? aspectRatio
        : capabilities.defaults.aspectRatio)
    } else {
      const capabilities = modelOutputOptions(next.id)
      if (!capabilities) return
      setModelId(next.id)
      setResolution(capabilities.resolutions.includes(resolution) ? resolution : capabilities.defaults.resolution)
      setAspectRatio(capabilities.aspectRatios.includes(aspectRatio) ? aspectRatio : capabilities.defaults.aspectRatio)
      setWithAudio(capabilities.audio === 'required' || (capabilities.audio === 'optional' && withAudio))
      setVideoMode(
        capabilities.modes.includes(videoMode)
          ? videoMode
          : capabilities.modes.includes('text2video')
            ? 'text2video'
            : capabilities.defaults.mode,
      )
    }
    setError(null)
    setCatalogOpen(false)
  }

  const confirm = async () => {
    if (selectedRows.length === 0 || validationError || submitting) return
    setSubmitting(true)
    setError(null)
    const options: ScriptV2BatchMaterializeOptions = {
      rowIds: selectedIds,
      modelId,
      ...(kind === 'image'
        ? {
            aspectRatio,
            resolution,
            quality,
          }
        : {
            aspectRatio,
            resolution,
            withAudio,
            mode: videoMode,
          }),
    }
    try {
      await onConfirm(options)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '批量生成失败')
      setSubmitting(false)
    }
  }

  const image = kind === 'image'
  const videoAudio = videoCapabilities?.audio ?? 'unsupported'
  return (
    <DialogLayer
      ariaLabel={image ? '批量生成分镜' : '批量生视频'}
      testId="script-v2-batch-materialize-dialog"
      width="max-w-[920px]"
    >
      <header className="flex min-h-16 items-center gap-3 border-b border-white/8 px-6">
        <span className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
          image ? 'bg-cyan-300/10 text-cyan-200' : 'bg-violet-300/10 text-violet-200',
        )}>
          {image ? <IconImage size={17} /> : <IconVideo size={17} />}
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-medium text-white/90">{image ? '批量生成分镜' : '批量生视频'}</h2>
          <p className="mt-0.5 text-[10px] text-white/32">
            先选择镜头与输出参数；确认后一次性创建节点、连线和分组
          </p>
        </div>
        {!submitting && <DialogClose onClose={onClose} />}
      </header>

      <div className="grid max-h-[calc(100vh-150px)] min-h-0 grid-cols-1 overflow-y-auto sm:max-h-[590px] sm:min-h-[430px] sm:grid-cols-[minmax(0,1fr)_292px] sm:overflow-hidden">
        <section className="thin-scrollbar overflow-y-auto border-b border-white/8 p-4 sm:border-b-0 sm:border-r sm:p-5" aria-label="镜头选择">
          <div className="mb-3 flex items-center gap-2">
            <label className="flex items-center gap-2 text-[11px] text-white/65">
              <input
                ref={selectAllRef}
                type="checkbox"
                aria-label="全选镜头"
                checked={allSelected}
                onChange={(event) => setSelected(Object.fromEntries(rows.map((row) => [row.id, event.target.checked])))}
                className="h-4 w-4 accent-white"
              />
              全选镜头
            </label>
            <span data-testid="script-v2-batch-selection-count" className="ml-auto text-[10px] tabular-nums text-white/38">
              已选{selectedRows.length}/{rows.length}
            </span>
          </div>

          <div className="space-y-2">
            {rows.map((row) => {
              const isSelected = Boolean(selected[row.id])
              const reason = rowReasons.get(row.id) ?? null
              return (
                <article
                  key={row.id}
                  data-testid={`script-v2-batch-row-${row.id}`}
                  className={cn(
                    'rounded-xl border p-3 transition-colors',
                    isSelected ? 'border-white/20 bg-white/[0.045]' : 'border-white/9 bg-white/[0.018]',
                  )}
                >
                  <label className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      aria-label={`选择镜头 ${row.shotNumber}`}
                      data-testid={`script-v2-batch-row-select-${row.id}`}
                      checked={isSelected}
                      onChange={(event) => setSelected((current) => ({ ...current, [row.id]: event.target.checked }))}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-white"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-[11px] font-medium text-white/78">镜头 {row.shotNumber}</span>
                        <span className="text-[9px] text-white/32">{row.durationSeconds}s · {row.shotSize}</span>
                        <span className="ml-auto text-[9px] text-white/28">{image ? '分镜图' : '运动视频'}</span>
                      </span>
                      <span className="mt-1 block line-clamp-2 text-[10px] leading-relaxed text-white/48">
                        {row.plotDescription || '未填写画面描述'}
                      </span>
                      <span className="mt-2 flex flex-wrap gap-1.5 text-[9px]">
                        <span className={cn('rounded-full px-1.5 py-0.5', row.imageGenerationPrompt ? 'bg-emerald-300/10 text-emerald-200/75' : 'bg-white/7 text-white/30')}>
                          图像提示词 {row.imageGenerationPrompt ? '就绪' : '缺失'}
                        </span>
                        <span className={cn('rounded-full px-1.5 py-0.5', row.videoMotionPrompt ? 'bg-emerald-300/10 text-emerald-200/75' : 'bg-white/7 text-white/30')}>
                          视频提示词 {row.videoMotionPrompt ? '就绪' : '缺失'}
                        </span>
                      </span>
                    </span>
                  </label>
                  {reason && (
                    <p
                      data-testid={`script-v2-batch-invalid-reason-${row.id}`}
                      className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-300/8 px-2 py-1.5 text-[9px] leading-relaxed text-amber-200/80"
                    >
                      <IconWarning size={12} className="mt-px shrink-0" />
                      {reason}
                    </p>
                  )}
                </article>
              )
            })}
            {rows.length === 0 && (
              <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-white/10 text-[11px] text-white/30">
                请先在脚本工作区添加镜头
              </div>
            )}
          </div>
        </section>

        <aside className="relative flex min-w-0 flex-col p-4 sm:p-5">
          <h3 className="text-[11px] font-medium text-white/64">统一输出设置</h3>
          <div className="mt-4 space-y-3">
            <Control label="模型">
              <button
                type="button"
                data-testid="script-v2-batch-model"
                aria-label={`${image ? '图片' : '视频'}模型 ${model?.label ?? modelId}`}
                aria-expanded={catalogOpen}
                disabled={submitting}
                onClick={() => setCatalogOpen((current) => !current)}
                className="flex h-9 w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-2.5 text-left text-[11px] text-white/72 hover:bg-white/[0.065] disabled:opacity-35"
              >
                {image ? <IconImage size={13} /> : <IconVideo size={13} />}
                <span className="min-w-0 flex-1 truncate">{model?.label ?? modelId}</span>
                <IconChevronDown size={12} />
              </button>
            </Control>

            {image ? (
              <>
                <Control label="画质">
                  <select
                    aria-label="画质"
                    value={quality}
                    disabled={submitting}
                    onChange={(event) => setQuality(event.target.value as ImageQuality)}
                    className="h-9 w-full rounded-lg border border-white/10 bg-[#303030] px-2 text-[11px] text-white/72 outline-none"
                  >
                    {(imageCapabilities?.qualities ?? ['low', 'standard', 'high']).map((value) => (
                      <option key={value} value={value}>{({ low: '低', standard: '标准', high: '高' } as const)[value]}</option>
                    ))}
                  </select>
                </Control>
                <Control label="分辨率">
                  <select
                    aria-label="分辨率"
                    value={resolution}
                    disabled={submitting}
                    onChange={(event) => setResolution(event.target.value as ModelResolution)}
                    className="h-9 w-full rounded-lg border border-white/10 bg-[#303030] px-2 text-[11px] text-white/72 outline-none"
                  >
                    {(imageCapabilities?.resolutions ?? ['1K', '2K', '4K']).map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </Control>
                <Control label="画幅">
                  <select
                    aria-label="画幅"
                    value={aspectRatio}
                    disabled={submitting}
                    onChange={(event) => setAspectRatio(event.target.value as ModelAspectRatio)}
                    className="h-9 w-full rounded-lg border border-white/10 bg-[#303030] px-2 text-[11px] text-white/72 outline-none"
                  >
                    {(imageCapabilities?.aspectRatios ?? ['1:1', '2:1', '16:9']).map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </Control>
              </>
            ) : (
              <>
                <Control label="生成模式">
                  <select
                    aria-label="生成模式"
                    value={videoMode}
                    disabled={submitting}
                    onChange={(event) => setVideoMode(event.target.value as ScriptV2BatchMode)}
                    className="h-9 w-full rounded-lg border border-white/10 bg-[#303030] px-2 text-[11px] text-white/72 outline-none"
                  >
                    {(videoCapabilities?.modes ?? ['text2video']).map((value) => <option key={value} value={value}>{VIDEO_MODE_LABELS[value] ?? value}</option>)}
                  </select>
                </Control>
                <Control label="分辨率">
                  <select
                    aria-label="分辨率"
                    value={resolution}
                    disabled={submitting}
                    onChange={(event) => setResolution(event.target.value as ModelResolution)}
                    className="h-9 w-full rounded-lg border border-white/10 bg-[#303030] px-2 text-[11px] text-white/72 outline-none"
                  >
                    {(videoCapabilities?.resolutions ?? ['480p', '720p', '1080p']).map((value) => <option key={value} value={value}>{value.toUpperCase()}</option>)}
                  </select>
                </Control>
                <Control label="画幅">
                  <select
                    aria-label="画幅"
                    value={aspectRatio}
                    disabled={submitting}
                    onChange={(event) => setAspectRatio(event.target.value as ModelAspectRatio)}
                    className="h-9 w-full rounded-lg border border-white/10 bg-[#303030] px-2 text-[11px] text-white/72 outline-none"
                  >
                    {(videoCapabilities?.aspectRatios ?? ['auto', '16:9', '9:16']).map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </Control>
                <label className={cn('flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-white/[0.025] px-2.5 py-2 text-[10px] text-white/58', videoAudio === 'unsupported' && 'opacity-40')}>
                  <span>
                    <span className="block text-[11px] text-white/68">生成音频</span>
                    <span className="mt-0.5 block text-[9px] text-white/30">脚本镜头沿用原有时长</span>
                  </span>
                  <input
                    type="checkbox"
                    aria-label="生成音频"
                    checked={videoAudio === 'required' || withAudio}
                    disabled={submitting || videoAudio === 'unsupported' || videoAudio === 'required'}
                    onChange={(event) => setWithAudio(event.target.checked)}
                    className="h-4 w-4 accent-white"
                  />
                </label>
              </>
            )}
          </div>

          <div className="mt-5 rounded-xl border border-white/8 bg-black/10 p-3">
            <div className="flex items-center justify-between text-[10px] text-white/38">
              <span>预计消耗</span>
              <span className="flex items-center gap-1 font-medium tabular-nums text-white/78">
                <IconCredit size={12} className="text-amber-300" />
                <span data-testid="script-v2-batch-materialize-quote">{estimatedCredits}</span>
              </span>
            </div>
            <p className="mt-2 text-[9px] leading-relaxed text-white/28">
              {image ? '按选中镜头逐个创建分镜图节点。' : '按每个镜头的时长分别计价，创建后仍需逐个确认生成。'}
            </p>
          </div>

          {catalogOpen && (
            image ? (
              <ImageModelCatalog
                currentId={modelId}
                onSelect={selectModel}
                onClose={() => setCatalogOpen(false)}
                className="absolute bottom-14 right-4 z-30 h-[380px] w-[460px]"
              />
            ) : (
              <VideoModelCatalog
                currentId={modelId}
                onSelect={selectModel}
                onClose={() => setCatalogOpen(false)}
                className="absolute bottom-14 right-4 z-30 h-[420px] w-[460px]"
              />
            )
          )}
        </aside>
      </div>

      <footer className="flex min-h-[68px] flex-wrap items-center gap-3 border-t border-white/8 bg-[#2a2a2a] px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          {validationError ? (
            <p data-testid="script-v2-batch-validation-error" className="flex items-start gap-1.5 text-[10px] leading-relaxed text-amber-200/80">
              <IconWarning size={13} className="mt-px shrink-0" />
              {selectedRows.length === 0 ? '请至少选择一个镜头' : validationError}
            </p>
          ) : error ? (
            <p role="alert" className="text-[10px] text-red-300">{error}</p>
          ) : (
            <p className="text-[10px] text-white/34">确认后将作为一个撤销步骤写入画布</p>
          )}
        </div>
        <button
          type="button"
          data-testid="script-v2-batch-cancel"
          disabled={submitting}
          onClick={onClose}
          className="h-9 rounded-lg px-4 text-[11px] text-white/52 hover:bg-white/7 hover:text-white/82 disabled:opacity-35"
        >
          取消
        </button>
        <button
          type="button"
          data-testid="script-v2-batch-confirm"
          disabled={selectedRows.length === 0 || Boolean(validationError) || submitting}
          onClick={() => void confirm()}
          className="flex h-9 min-w-[104px] items-center justify-center gap-1.5 rounded-lg bg-white px-4 text-[11px] font-medium text-[#202020] disabled:cursor-not-allowed disabled:opacity-30"
        >
          {submitting ? <><Spinner size={13} /> 创建中</> : '确认生成'}
        </button>
      </footer>
    </DialogLayer>
  )
}

function DialogLayer({
  ariaLabel,
  testId,
  width = 'max-w-[560px]',
  children,
}: {
  ariaLabel: string
  testId: string
  width?: string
  children: ReactNode
}) {
  const dialogRef = useScriptV2DialogFocus(true)

  return (
    <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/58 p-3 backdrop-blur-[1px] sm:p-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        data-testid={testId}
        tabIndex={-1}
        className={cn('max-h-[calc(100vh-24px)] w-full overflow-y-auto rounded-2xl border border-white/10 bg-[#242424] shadow-[0_24px_90px_rgba(0,0,0,.54)] sm:max-h-[calc(100vh-48px)]', width)}
      >
        {children}
      </div>
    </div>
  )
}

function DialogClose({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      aria-label="关闭"
      onClick={onClose}
      className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-white/38 hover:bg-white/8 hover:text-white/78"
    >
      <IconClose size={16} />
    </button>
  )
}

function CanvasImageSource({
  candidates,
  onSelect,
}: {
  candidates: ScriptV2CanvasImageCandidate[]
  onSelect: (candidate: ScriptV2CanvasImageCandidate) => Promise<void>
}) {
  return (
    <SourceGrid empty={candidates.length === 0 ? '当前画布暂无可用图片节点' : null}>
      {candidates.map((candidate) => (
        <SourceImageButton
          key={candidate.nodeId}
          name={candidate.name}
          url={candidate.url}
          onClick={() => onSelect(candidate)}
        />
      ))}
    </SourceGrid>
  )
}

function UploadImageSource({ onSelect }: { onSelect: (file: File) => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="mt-4 border-t border-white/8 pt-4">
      <label className="flex min-h-[210px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/16 bg-black/10 text-center hover:border-white/30 hover:bg-white/[0.025]">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.055] text-white/40">
          <IconUpload size={20} />
        </span>
        <span className="text-[12px] font-medium text-white/70">{busy ? '正在读取图片' : '点击选择本地图片'}</span>
        <span className="text-[10px] text-white/30">支持 JPG、PNG、WEBP；仅保存在本地画布</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="选择本地图片"
          className="sr-only"
          disabled={busy}
          onChange={async (event) => {
            const file = event.target.files?.[0]
            if (!file) return
            setBusy(true)
            setError(null)
            try {
              await onSelect(file)
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : '读取图片失败')
              setBusy(false)
            }
          }}
        />
      </label>
      {error && <p role="alert" className="mt-2 text-center text-[10px] text-red-300">{error}</p>}
    </div>
  )
}

function LibraryImageSource({ onSelect }: { onSelect: (asset: Asset) => Promise<void> }) {
  const [assets, setAssets] = useState<Asset[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void client.raw
      .get<{ assets: Asset[] }>('/api/assets?namespace=personal&kind=image')
      .then((response) => {
        if (live) setAssets(response.assets)
      })
      .catch((reason: unknown) => {
        if (live) setError(reason instanceof Error ? reason.message : '个人资产加载失败')
      })
    return () => {
      live = false
    }
  }, [])

  if (error) {
    return <SourceGrid empty={error}>{null}</SourceGrid>
  }
  if (assets === null) {
    return <SourceGrid empty="正在加载个人资产…">{null}</SourceGrid>
  }
  return (
    <SourceGrid empty={assets.length === 0 ? '个人资产库暂无图片' : null}>
      {assets.map((asset) => (
        <SourceImageButton
          key={asset.id}
          name={asset.name}
          url={asset.thumbnailUrl ?? asset.url}
          onClick={() => onSelect(asset)}
        />
      ))}
    </SourceGrid>
  )
}

function SourceGrid({ empty, children }: { empty: string | null; children: ReactNode }) {
  return (
    <div className="mt-4 min-h-[230px] border-t border-white/8 pt-4">
      {empty ? (
        <div className="flex h-[210px] items-center justify-center rounded-xl border border-dashed border-white/10 text-[11px] text-white/28">
          {empty}
        </div>
      ) : (
        <div className="thin-scrollbar grid max-h-[230px] grid-cols-4 gap-3 overflow-y-auto pr-1">{children}</div>
      )}
    </div>
  )
}

function SourceImageButton({ name, url, onClick }: { name: string; url: string; onClick: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      aria-label={name}
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await onClick()
        } finally {
          setBusy(false)
        }
      }}
      className="group overflow-hidden rounded-xl border border-white/10 bg-white/[0.035] text-left hover:border-white/22 disabled:opacity-50"
    >
      {/* Local fixture and canvas URLs are already sanitized by their owning surfaces. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="h-[108px] w-full object-cover" />
      <span className="block truncate px-2.5 py-2 text-[10px] text-white/66 group-hover:text-white/88">{name}</span>
    </button>
  )
}

function AssetAiForm({
  onGenerate,
}: {
  onGenerate: (prompt: string, settings: ScriptV2AssetGenerationSettings) => Promise<void>
}) {
  const [prompt, setPrompt] = useState('')
  const [modelId, setModelId] = useState('lib-image-2')
  const [quality, setQuality] = useState<ImageQuality>('standard')
  const [resolution, setResolution] = useState<ImageResolution>('2K')
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>('2:1')
  const [quote, setQuote] = useState<number | null>(null)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const model = MODELS_BY_ID.get(modelId)
  const capabilities = useMemo(() => imageModelOutputOptions(modelId), [modelId])

  useEffect(() => {
    const controller = new AbortController()
    setQuote(null)
    void client.scriptV2
      .quote(
        {
          operation: 'generate-asset',
          modelId,
          assetCount: 1,
          quality,
          resolution,
          aspectRatio,
        },
        { signal: controller.signal },
      )
      .then((response) => setQuote(response.quote.credits))
      .catch((reason: unknown) => {
        if (reason instanceof Error && reason.name === 'AbortError') return
        setError(reason instanceof Error ? reason.message : '报价失败')
      })
    return () => controller.abort()
  }, [aspectRatio, modelId, quality, resolution])

  const selectModel = (next: ModelDefinition) => {
    const nextCapabilities = imageModelOutputOptions(next.id)
    if (!nextCapabilities) return
    setModelId(next.id)
    setQuality(nextCapabilities.qualities.includes(quality) ? quality : nextCapabilities.defaults.quality)
    setResolution(nextCapabilities.resolutions.includes(resolution) ? resolution : nextCapabilities.defaults.resolution)
    setAspectRatio(
      nextCapabilities.aspectRatios.includes(aspectRatio)
        ? aspectRatio
        : nextCapabilities.aspectRatios.includes('2:1')
          ? '2:1'
          : nextCapabilities.defaults.aspectRatio,
    )
    setCatalogOpen(false)
  }

  const settings: ScriptV2AssetGenerationSettings = {
    modelId,
    prompt,
    quality,
    resolution,
    aspectRatio,
  }

  return (
    <div data-testid="script-v2-asset-ai-form" className="relative mt-4 border-t border-white/8 pt-4">
      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="开始你的设计"
        rows={6}
        className="h-[170px] w-full resize-none rounded-xl border border-white/10 bg-black/15 p-3 text-[12px] leading-relaxed text-white/82 outline-none placeholder:text-white/25 focus:border-white/24"
      />

      <div className="mt-3 grid grid-cols-[1.25fr_1fr_1fr_1fr_auto] items-end gap-2">
        <Control label="模型">
          <button
            type="button"
            aria-label={`图片模型 ${model?.label ?? modelId}`}
            onClick={() => setCatalogOpen((current) => !current)}
            className="h-9 w-full rounded-lg border border-white/10 bg-white/[0.035] px-2.5 text-left text-[11px] text-white/72 hover:bg-white/[0.065]"
          >
            {model?.label ?? modelId}
          </button>
        </Control>
        <Control label="画质">
          <select
            aria-label="画质"
            value={quality}
            onChange={(event) => setQuality(event.target.value as ImageQuality)}
            className="h-9 w-full rounded-lg border border-white/10 bg-[#303030] px-2 text-[11px] text-white/72 outline-none"
          >
            {(capabilities?.qualities ?? ['low', 'standard', 'high']).map((value) => (
              <option key={value} value={value}>{({ low: '低', standard: '标准', high: '高' } as const)[value]}</option>
            ))}
          </select>
        </Control>
        <Control label="分辨率">
          <select
            aria-label="分辨率"
            value={resolution}
            onChange={(event) => setResolution(event.target.value as ImageResolution)}
            className="h-9 w-full rounded-lg border border-white/10 bg-[#303030] px-2 text-[11px] text-white/72 outline-none"
          >
            {(capabilities?.resolutions ?? ['1K', '2K', '4K']).map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </Control>
        <Control label="画幅">
          <select
            aria-label="画幅"
            value={aspectRatio}
            onChange={(event) => setAspectRatio(event.target.value as ImageAspectRatio)}
            className="h-9 w-full rounded-lg border border-white/10 bg-[#303030] px-2 text-[11px] text-white/72 outline-none"
          >
            {(capabilities?.aspectRatios ?? ['1:1', '2:1', '16:9']).map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </Control>
        <button
          type="button"
          disabled={!prompt.trim() || quote === null || submitting}
          onClick={async () => {
            setSubmitting(true)
            setError(null)
            try {
              await onGenerate(prompt.trim(), settings)
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : '生成失败')
              setSubmitting(false)
            }
          }}
          className="h-9 min-w-[92px] rounded-lg bg-white px-3 text-[11px] font-medium text-[#202020] disabled:cursor-not-allowed disabled:opacity-30"
        >
          {submitting ? '生成中' : '确认生成'}
        </button>
      </div>

      <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-white/38">
        <span aria-hidden="true">◆</span>
        <span data-testid="script-v2-asset-quote">{quote ?? '—'}</span>
      </div>
      {error && <p role="alert" className="mt-1 text-right text-[10px] text-red-300">{error}</p>}

      {catalogOpen && (
        <ImageModelCatalog
          currentId={modelId}
          onSelect={selectModel}
          onClose={() => setCatalogOpen(false)}
          className="absolute bottom-12 left-0 z-20 h-[360px] w-[460px]"
        />
      )}
    </div>
  )
}

function Control({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[9px] text-white/34">{label}</span>
      {children}
    </label>
  )
}

export { ROLE_LABEL as SCRIPT_V2_ASSET_ROLE_LABELS }
