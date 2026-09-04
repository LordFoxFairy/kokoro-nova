'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import Link from 'next/link'

import { client } from '@/api/client'
import type { ModelCatalogResponse } from '@/contracts/models'
import type { SkillCardContract, SkillListResponse } from '@/contracts/skills'
import type { Asset } from '@/domain/types'
import { cn } from '@/lib/cn'
import {
  IconAssetLibrary,
  IconAttachment,
  IconCheck,
  IconChevronDown,
  IconClose,
  IconImage,
  IconPlus,
  IconSearch,
  IconSend,
  IconSkill,
  IconSparkle,
  IconUpload,
  IconVideo,
  IconWarning,
} from '@/components/icons'
import { Dialog } from '@/components/ui/Dialog'
import { Spinner } from '@/components/ui/controls'

export type HomeAgentContextKind = 'asset' | 'model' | 'skill'

export type HomeAgentContext = {
  id: string
  kind: HomeAgentContextKind
  label: string
  thumbnailUrl?: string | null
}

export type HomeAgentRequest = {
  text: string
  context: HomeAgentContext[]
  modelId: string | null
  modelLabel: string | null
  generationMode: 'manual' | 'auto'
}

export type HomeComposerPopover = 'attachments' | 'model' | 'skill' | 'mode' | null

export function buildHomeAgentBrief(request: HomeAgentRequest): string {
  const lines = [request.text.trim()]
  if (request.context.length > 0) lines.push(`上下文：${request.context.map((item) => item.label).join('、')}`)
  if (request.modelLabel) lines.push(`模型：${request.modelLabel}`)
  lines.push(`生成模式：${request.generationMode === 'auto' ? '自动' : '手动'}`)
  return lines.join('\n')
}

export function nextHomeComposerEscapeState(input: {
  expanded: boolean
  activePopover: HomeComposerPopover
}): { expanded: boolean; activePopover: HomeComposerPopover; handled: boolean } {
  if (input.activePopover) return { expanded: input.expanded, activePopover: null, handled: true }
  if (input.expanded) return { expanded: false, activePopover: null, handled: true }
  return { expanded: false, activePopover: null, handled: false }
}

type HomeAgentComposerProps = {
  skills: Array<{ id: string; name: string; summary: string; coverUrl: string }>
  submitting?: boolean
  publicMode?: boolean
  onLoginRequired?: () => void
  onSubmit: (request: HomeAgentRequest) => void
}

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

type ModelState = {
  status: LoadStatus
  items: ModelCatalogResponse['items']
  error: string | null
}

type SkillState = {
  status: LoadStatus
  items: SkillListResponse['skills']
  error: string | null
}

type AssetState = {
  status: LoadStatus
  items: Asset[]
  error: string | null
}

const MEDIA_TABS: Array<{ value: 'image' | 'video'; label: string }> = [
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
]

const SKILL_COLLECTIONS: Array<{ value: '全部' | '收藏' | '我的'; label: string }> = [
  { value: '全部', label: '通用' },
  { value: '收藏', label: '收藏' },
  { value: '我的', label: '我的' },
]

const ASSET_CATEGORIES = ['全部', '其它', '人物', '场景', '物品', '风格', '音效'] as const

const emptyModelState = (): ModelState => ({ status: 'idle', items: [], error: null })

function modelIcon(model: { media: string }, size = 15) {
  return model.media === 'video' ? <IconVideo size={size} /> : <IconImage size={size} />
}

function modeLabel(mode: 'manual' | 'auto') {
  return mode === 'auto' ? '自动模式' : '手动模式'
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback
}

export function HomeAgentComposer({
  skills,
  submitting = false,
  publicMode = false,
  onLoginRequired,
  onSubmit,
}: HomeAgentComposerProps) {
  const composerRef = useRef<HTMLElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const objectUrlsRef = useRef<string[]>([])
  const [draft, setDraft] = useState('')
  const [focused, setFocused] = useState(false)
  const [activePopover, setActivePopover] = useState<HomeComposerPopover>(null)
  const [assetLibraryOpen, setAssetLibraryOpen] = useState(false)
  const [assetSearch, setAssetSearch] = useState('')
  const [assetCategory, setAssetCategory] = useState<(typeof ASSET_CATEGORIES)[number]>('全部')
  const [assetState, setAssetState] = useState<AssetState>({ status: 'idle', items: [], error: null })
  const [attachments, setAttachments] = useState<HomeAgentContext[]>([])
  const [selectedSkill, setSelectedSkill] = useState<HomeAgentContext | null>(null)
  const [selectedModel, setSelectedModel] = useState<{ id: string; label: string } | null>(null)
  const [generationMode, setGenerationMode] = useState<'manual' | 'auto'>('manual')
  const [modelMedia, setModelMedia] = useState<'image' | 'video'>('image')
  const [modelStates, setModelStates] = useState<Record<'image' | 'video', ModelState>>({
    image: emptyModelState(),
    video: emptyModelState(),
  })
  const [skillCollection, setSkillCollection] = useState<'全部' | '收藏' | '我的'>('全部')
  const [skillSearch, setSkillSearch] = useState('')
  const [skillState, setSkillState] = useState<SkillState>({ status: 'idle', items: [], error: null })

  const expanded = focused || draft.trim().length > 0 || attachments.length > 0 || Boolean(selectedSkill) || Boolean(activePopover)
  const context = useMemo(
    () => (selectedSkill ? [...attachments, selectedSkill] : attachments),
    [attachments, selectedSkill],
  )
  const valid = draft.trim().length > 0 && !submitting

  const guardPrivateAction = useCallback(() => {
    if (!publicMode) return false
    onLoginRequired?.()
    setActivePopover(null)
    return true
  }, [onLoginRequired, publicMode])

  const loadAssets = useCallback(async () => {
    setAssetState((current) => ({ ...current, status: 'loading', error: null }))
    try {
      const response = await client.raw.get<{ assets: Asset[] }>('/api/assets?namespace=personal')
      setAssetState({ status: 'ready', items: response.assets, error: null })
    } catch (reason) {
      setAssetState({ status: 'error', items: [], error: errorMessage(reason, '个人资产库加载失败') })
    }
  }, [])

  const loadModels = useCallback(async (media: 'image' | 'video', force = false) => {
    const current = modelStates[media]
    if (!force && (current.status === 'loading' || current.status === 'ready')) return
    setModelStates((states) => ({ ...states, [media]: { ...states[media], status: 'loading', error: null } }))
    try {
      const response = await client.models.list({ media })
      setModelStates((states) => ({ ...states, [media]: { status: 'ready', items: response.items, error: null } }))
    } catch (reason) {
      setModelStates((states) => ({
        ...states,
        [media]: { status: 'error', items: [], error: errorMessage(reason, '模型目录加载失败') },
      }))
    }
  }, [modelStates])

  const loadSkills = useCallback(async (collection: '全部' | '收藏' | '我的', query: string) => {
    setSkillState((current) => ({ ...current, status: 'loading', error: null }))
    try {
      const response = await client.skills.list({ collection, query })
      setSkillState({ status: 'ready', items: response.skills, error: null })
    } catch (reason) {
      setSkillState({ status: 'error', items: [], error: errorMessage(reason, 'Skill 目录加载失败') })
    }
  }, [])

  useEffect(() => {
    if (!assetLibraryOpen || assetState.status === 'ready' || assetState.status === 'loading') return
    void loadAssets()
  }, [assetLibraryOpen, assetState.status, loadAssets])

  useEffect(() => {
    if (activePopover !== 'model') return
    void loadModels(modelMedia)
  }, [activePopover, loadModels, modelMedia])

  useEffect(() => {
    if (activePopover !== 'skill') return
    const timer = window.setTimeout(() => void loadSkills(skillCollection, skillSearch), 160)
    return () => window.clearTimeout(timer)
  }, [activePopover, loadSkills, skillCollection, skillSearch])

  useEffect(() => {
    const objectUrls = objectUrlsRef.current
    return () => {
      for (const url of objectUrls) URL.revokeObjectURL(url)
    }
  }, [])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (assetLibraryOpen) return
      if (!composerRef.current?.contains(event.target as Node | null)) {
        setActivePopover(null)
        if (!draft.trim() && context.length === 0) setFocused(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || assetLibraryOpen) return
      const next = nextHomeComposerEscapeState({ expanded, activePopover })
      if (!next.handled) return
      event.preventDefault()
      event.stopPropagation()
      setActivePopover(next.activePopover)
      setFocused(next.expanded)
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [activePopover, assetLibraryOpen, context.length, draft, expanded])

  const openPopover = (popover: Exclude<HomeComposerPopover, null>) => {
    if (guardPrivateAction()) return
    setFocused(true)
    setActivePopover((current) => (current === popover ? null : popover))
  }

  const addAttachment = (next: HomeAgentContext) => {
    setAttachments((current) => (current.some((item) => item.id === next.id) ? current : [...current, next]))
    setFocused(true)
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const previewUrl = URL.createObjectURL(file)
    objectUrlsRef.current.push(previewUrl)
    addAttachment({
      id: `upload-${file.name}-${file.lastModified}-${file.size}`,
      kind: 'asset',
      label: file.name,
      thumbnailUrl: file.type.startsWith('image/') ? previewUrl : null,
    })
    setActivePopover(null)
    setAssetLibraryOpen(false)
  }

  const handleSubmit = () => {
    if (!valid) return
    if (guardPrivateAction()) return
    onSubmit({
      text: draft.trim(),
      context: context.map((item) => ({ ...item })),
      modelId: selectedModel?.id ?? null,
      modelLabel: selectedModel?.label ?? null,
      generationMode,
    })
  }

  const selectedSkillId = selectedSkill?.id ?? null
  const currentModels = modelStates[modelMedia]
  const filteredAssets = useMemo(() => {
    const query = assetSearch.trim().toLocaleLowerCase('zh-CN')
    return assetState.items.filter((asset) => {
      const categoryMatch = assetCategory === '全部' || asset.tags.includes(assetCategory)
      const searchMatch = !query || asset.name.toLocaleLowerCase('zh-CN').includes(query)
      return categoryMatch && searchMatch
    })
  }, [assetCategory, assetSearch, assetState.items])

  return (
    <section
      ref={composerRef}
      aria-label="LibTV Agent 创作入口"
      data-testid="home-agent-composer"
      data-state={expanded ? 'expanded' : 'collapsed'}
      className={cn(
        'relative mt-6 flex flex-col items-center justify-center rounded-[22px] bg-[#1b1b1b] px-5 transition-[height] duration-200',
        expanded ? 'h-[190px]' : 'h-[150px]',
      )}
    >
      <div className="relative w-full max-w-[720px]">
        {expanded && (
          <div
            data-testid="home-composer-state"
            className="mb-2 flex items-center gap-2 px-2 text-[10px] text-white/38"
            aria-live="polite"
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', valid ? 'bg-[#60c9ef]' : 'bg-white/25')} aria-hidden="true" />
            <span>{valid ? '准备发送到 Agent' : '输入创意开始'}</span>
            <span className="text-white/18">·</span>
            <span>{modeLabel(generationMode)} · {generationMode === 'auto' ? '可能消耗积分' : '生成前询问'}</span>
            {selectedModel && <span className="truncate text-white/52">· {selectedModel.label}</span>}
            {context.length > 0 && <span className="shrink-0">· 已附加 {context.length} 项上下文</span>}
          </div>
        )}

        <div
          className={cn(
            'relative w-full rounded-[18px] bg-[#292929] shadow-[inset_0_1px_0_rgba(255,255,255,.035)] transition-[min-height,border-color]',
            expanded ? 'min-h-[128px] border border-white/[0.08]' : 'h-12 border border-transparent',
            focused && 'border-white/[0.16]',
          )}
        >
          {expanded && context.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-3 pt-2.5" data-testid="home-context-rail">
              {context.map((item) => (
                <ContextPill
                  key={item.id}
                  item={item}
                  onRemove={() => {
                    if (item.kind === 'skill') setSelectedSkill(null)
                    else setAttachments((current) => current.filter((candidate) => candidate.id !== item.id))
                  }}
                />
              ))}
            </div>
          )}
          <textarea
            value={draft}
            data-testid="home-composer"
            aria-label="描述创作内容"
            rows={expanded ? 3 : 1}
            onFocus={() => setFocused(true)}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                handleSubmit()
              }
            }}
            placeholder="说出你的创意，或者从一个 skill 开始创作"
            className={cn(
              'block w-full resize-none bg-transparent px-3 text-[13px] leading-relaxed text-white/86 outline-none placeholder:text-white/30',
              expanded ? 'min-h-[74px] pb-1 pt-2.5' : 'h-12 py-[14px]',
            )}
          />

          {expanded && (
            <div className="flex items-center justify-between px-2 pb-2">
              <ComposerToolButton
                label="添加附件"
                active={activePopover === 'attachments'}
                testId="home-attachment-trigger"
                onClick={() => openPopover('attachments')}
              >
                <IconAttachment size={16} />
              </ComposerToolButton>
              <div className="flex items-center gap-0.5">
                <ComposerToolButton
                  label={selectedModel?.label ?? '选择模型'}
                  active={activePopover === 'model'}
                  testId="home-model-trigger"
                  onClick={() => openPopover('model')}
                >
                  {selectedModel ? modelIcon({ media: modelMedia }, 15) : <IconImage size={16} />}
                  <span className="max-w-[116px] truncate text-[11px]">{selectedModel?.label ?? '模型'}</span>
                  <IconChevronDown size={11} />
                </ComposerToolButton>
                <ComposerToolButton
                  label="添加 Skill 上下文"
                  active={activePopover === 'skill'}
                  testId="home-skill-trigger"
                  onClick={() => openPopover('skill')}
                >
                  <IconSkill size={16} />
                </ComposerToolButton>
                <ComposerToolButton
                  label={`生成模式：${modeLabel(generationMode)}`}
                  active={activePopover === 'mode'}
                  testId="home-mode-trigger"
                  onClick={() => openPopover('mode')}
                >
                  <span className="text-[11px]">{generationMode === 'auto' ? '自动' : '手动'}</span>
                  <IconChevronDown size={11} />
                </ComposerToolButton>
              </div>
              <button
                type="button"
                aria-label="开始创作"
                data-testid="home-agent-send"
                disabled={!valid}
                onClick={handleSubmit}
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60c9ef]',
                  valid ? 'bg-white text-[#181818] hover:bg-white/88' : 'cursor-not-allowed bg-white/[0.09] text-white/36',
                )}
              >
                {submitting ? <Spinner size={15} /> : <IconSend size={16} />}
              </button>
            </div>
          )}
          {!expanded && (
            <button
              type="button"
              aria-label="开始创作"
              data-testid="home-agent-send"
              disabled={!valid}
              onClick={handleSubmit}
              className={cn(
                'absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60c9ef]',
                valid ? 'bg-white text-[#181818] hover:bg-white/88' : 'bg-white/[0.09] text-white/36',
              )}
            >
              {submitting ? <Spinner size={15} /> : <IconSend size={16} />}
            </button>
          )}
        </div>

        {!expanded && (
          <div className="pointer-events-none absolute left-3 top-3.5 text-white/22">
            <IconPlus size={18} />
          </div>
        )}

        {activePopover === 'attachments' && (
          <ComposerPopover testId="home-attachment-menu" title="添加素材" className="left-0 w-[210px]">
            <PopoverAction
              icon={<IconUpload size={16} />}
              label="本地上传"
              description="图片、视频或音频"
              onClick={() => uploadInputRef.current?.click()}
              testId="home-upload-local"
            />
            <PopoverAction
              icon={<IconAssetLibrary size={16} />}
              label="素材库添加"
              description="从个人资产库引用"
              onClick={() => {
                setActivePopover(null)
                setAssetLibraryOpen(true)
              }}
              testId="home-asset-library"
            />
          </ComposerPopover>
        )}

        {activePopover === 'model' && (
          <ComposerPopover testId="home-model-menu" title="选择模型" className="left-0 w-[330px]">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-white/[0.05] p-1" role="tablist" aria-label="模型类型">
              {MEDIA_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={modelMedia === tab.value}
                  data-testid={`home-model-tab-${tab.value}`}
                  onClick={() => setModelMedia(tab.value)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-[12px] transition-colors',
                    modelMedia === tab.value ? 'bg-white text-[#191919] shadow-sm' : 'text-white/44 hover:text-white/80',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between px-1">
              <span className="text-[10px] text-white/32">{modelMedia === 'image' ? '图片' : '视频'}模型目录</span>
              <span className="text-[10px] text-white/25">本地版本目录</span>
            </div>
            <ModelList
              state={currentModels}
              selectedId={selectedModel?.id ?? null}
              media={modelMedia}
              onRetry={() => void loadModels(modelMedia, true)}
              onSelect={(model) => {
                setSelectedModel({ id: model.id, label: model.label })
                setActivePopover(null)
                setFocused(true)
              }}
            />
          </ComposerPopover>
        )}

        {activePopover === 'skill' && (
          <ComposerPopover testId="home-skill-menu" title="Skill 上下文" className="left-0 w-[390px]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1" role="tablist" aria-label="Skill 范围">
                {SKILL_COLLECTIONS.map((collection) => (
                  <button
                    key={collection.value}
                    type="button"
                    role="tab"
                    aria-selected={skillCollection === collection.value}
                    data-testid={`home-skill-collection-${collection.value}`}
                    onClick={() => setSkillCollection(collection.value)}
                    className={cn(
                      'rounded-md px-2 py-1 text-[11px] transition-colors',
                      skillCollection === collection.value ? 'bg-white/[0.1] text-white' : 'text-white/42 hover:text-white/75',
                    )}
                  >
                    {collection.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <Link href="/skills" className="rounded-md px-2 py-1 text-[11px] text-white/55 hover:bg-white/[0.06] hover:text-white">创建</Link>
                <Link href="/skills" className="rounded-md px-2 py-1 text-[11px] text-white/55 hover:bg-white/[0.06] hover:text-white">全部</Link>
              </div>
            </div>
            <label className="mt-2 flex h-8 items-center gap-2 rounded-lg bg-white/[0.06] px-2.5 text-white/35">
              <IconSearch size={14} />
              <span className="sr-only">搜索 Skill</span>
              <input
                value={skillSearch}
                aria-label="搜索 Skill"
                data-testid="home-skill-search"
                onChange={(event) => setSkillSearch(event.target.value)}
                placeholder="搜索 Skill"
                className="min-w-0 flex-1 bg-transparent text-[12px] text-white/82 outline-none placeholder:text-white/30"
              />
              {skillSearch && (
                <button type="button" aria-label="清除 Skill 搜索" onClick={() => setSkillSearch('')} className="text-white/35 hover:text-white/70">
                  <IconClose size={13} />
                </button>
              )}
            </label>
            <SkillList
              state={skillState}
              selectedId={selectedSkillId}
              onRetry={() => void loadSkills(skillCollection, skillSearch)}
              onSelect={(skill) => {
                if (guardPrivateAction()) return
                setSelectedSkill({ id: skill.id, kind: 'skill', label: skill.name })
                setActivePopover(null)
                setFocused(true)
              }}
            />
            <Link href="/skills" className="mt-2 flex items-center justify-center border-t border-white/[0.07] pt-2 text-[11px] text-[#60c9ef] hover:text-[#8cdbf5]">查看全部 Skill</Link>
          </ComposerPopover>
        )}

        {activePopover === 'mode' && (
          <ComposerPopover testId="home-mode-menu" title="生成模式" className="right-0 w-[230px]">
            <div role="menu" aria-label="生成模式选项" className="space-y-1">
              <ModeOption
                mode="manual"
                selected={generationMode === 'manual'}
                onSelect={() => {
                  setGenerationMode('manual')
                  setActivePopover(null)
                }}
                title="手动模式"
                description="Agent 在每次生成前询问"
              />
              <ModeOption
                mode="auto"
                selected={generationMode === 'auto'}
                onSelect={() => {
                  setGenerationMode('auto')
                  setActivePopover(null)
                }}
                title="自动模式"
                description="Agent 完全自动生成，可能消耗积分"
              />
            </div>
          </ComposerPopover>
        )}
      </div>

      <div className="mt-3 flex max-w-full items-center justify-center gap-2">
        {skills.map((skill) => {
          const selected = selectedSkillId === skill.id
          return (
            <button
              key={skill.id}
              type="button"
              data-testid="home-skill-chip"
              data-selected={selected ? 'true' : 'false'}
              onClick={() => {
                if (guardPrivateAction()) return
                setSelectedSkill(selected ? null : { id: skill.id, kind: 'skill', label: skill.name, thumbnailUrl: skill.coverUrl })
                setFocused(true)
              }}
              className={cn(
                'flex h-8 max-w-[210px] items-center gap-2 rounded-full border px-2 pr-3 text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60c9ef]',
                selected
                  ? 'border-[#60c9ef]/60 bg-[#60c9ef]/12 text-white'
                  : 'border-transparent bg-white/[0.045] text-white/62 hover:bg-white/[0.075] hover:text-white/82',
              )}
            >
              <span className="h-6 w-6 shrink-0 overflow-hidden rounded-full bg-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={skill.coverUrl} alt="" className="h-full w-full object-cover" />
              </span>
              <span className="truncate">{skill.name}</span>
            </button>
          )
        })}
        <Link href="/skills" aria-label="全部Skill" className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-white/[0.045] px-3 text-[12px] text-white/65 transition-colors hover:bg-white/[0.08] hover:text-white">
          全部 Skill <span aria-hidden="true">›</span>
        </Link>
      </div>

      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*,video/*,audio/*"
        className="sr-only"
        tabIndex={-1}
        onChange={handleFileChange}
      />

      <AssetLibraryDialog
        open={assetLibraryOpen}
        state={assetState}
        search={assetSearch}
        category={assetCategory}
        filteredAssets={filteredAssets}
        onClose={() => setAssetLibraryOpen(false)}
        onRetry={() => void loadAssets()}
        onSearch={setAssetSearch}
        onCategory={setAssetCategory}
        onUpload={() => uploadInputRef.current?.click()}
        onSelect={(asset) => {
          addAttachment({ id: asset.id, kind: 'asset', label: asset.name, thumbnailUrl: asset.thumbnailUrl })
          setAssetLibraryOpen(false)
        }}
      />
    </section>
  )
}

function ComposerToolButton({
  children,
  label,
  active,
  testId,
  onClick,
}: {
  children: ReactNode
  label: string
  active: boolean
  testId: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={active}
      data-testid={testId}
      onClick={onClick}
      className={cn(
        'flex h-8 items-center gap-1 rounded-lg px-2 text-white/42 transition-colors hover:bg-white/[0.07] hover:text-white/78 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60c9ef]',
        active && 'bg-white/[0.09] text-white/85',
      )}
    >
      {children}
    </button>
  )
}

function ComposerPopover({
  children,
  title,
  testId,
  className,
}: {
  children: ReactNode
  title: string
  testId: string
  className?: string
}) {
  return (
    <div
      role="dialog"
      aria-label={title}
      data-testid={testId}
      className={cn(
        'absolute bottom-[60px] z-40 rounded-2xl border border-white/[0.1] bg-[#242424] p-3 text-white shadow-[0_18px_48px_rgba(0,0,0,.34)]',
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-[13px] font-medium text-white/86">{title}</h2>
        <span className="text-[10px] text-white/25">Esc 关闭</span>
      </div>
      {children}
    </div>
  )
}

function PopoverAction({
  icon,
  label,
  description,
  onClick,
  testId,
}: {
  icon: ReactNode
  label: string
  description: string
  onClick: () => void
  testId: string
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60c9ef]"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/72">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[12px] text-white/84">{label}</span>
        <span className="mt-0.5 block truncate text-[10px] text-white/35">{description}</span>
      </span>
    </button>
  )
}

function ContextPill({ item, onRemove }: { item: HomeAgentContext; onRemove: () => void }) {
  return (
    <span data-testid="home-context-chip" className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full bg-[#60c9ef]/12 px-2 py-1 text-[10px] text-[#9be2fa]">
      {item.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.thumbnailUrl} alt="" className="h-4 w-4 rounded-full object-cover" />
      ) : item.kind === 'skill' ? <IconSkill size={11} /> : <IconAttachment size={11} />}
      <span className="truncate">{item.label}</span>
      <button type="button" aria-label={`移除${item.label}`} onClick={onRemove} className="rounded-full text-[#9be2fa]/60 hover:text-white">
        <IconClose size={10} />
      </button>
    </span>
  )
}

function ModelList({
  state,
  media,
  selectedId,
  onRetry,
  onSelect,
}: {
  state: ModelState
  media: 'image' | 'video'
  selectedId: string | null
  onRetry: () => void
  onSelect: (model: ModelCatalogResponse['items'][number]) => void
}) {
  if (state.status === 'loading') {
    return <div className="flex items-center justify-center gap-2 py-8 text-[11px] text-white/42" data-testid="home-model-loading"><Spinner size={14} /> 加载模型目录</div>
  }
  if (state.status === 'error') {
    return <InlineLoadError message={state.error ?? '模型目录加载失败'} onRetry={onRetry} testId="home-model-error" retryTestId="home-model-retry" />
  }
  if (state.items.length === 0) {
    return <InlineEmpty title={`${media === 'image' ? '图片' : '视频'}模型暂时为空`} description="请稍后刷新本地目录" testId="home-model-empty" />
  }
  return (
    <div className="thin-scrollbar mt-1 max-h-[238px] space-y-1 overflow-y-auto pr-1" data-testid="home-model-list">
      {state.items.map((model) => (
        <button
          type="button"
          key={model.id}
          data-testid="home-model-option"
          data-selected={selectedId === model.id ? 'true' : 'false'}
          onClick={() => onSelect(model)}
          className={cn(
            'flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60c9ef]',
            selectedId === model.id && 'bg-[#60c9ef]/10',
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.07] text-white/75">{modelIcon({ media }, 16)}</span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-[12px] text-white/86">
              <span className="truncate">{model.label}</span>
              {model.membershipTier === 'vip' && <span className="shrink-0 rounded bg-amber-300/15 px-1 text-[9px] text-amber-200">VIP</span>}
            </span>
            <span className="mt-0.5 block truncate text-[10px] text-white/35">{model.description}</span>
          </span>
          {selectedId === model.id && <IconCheck size={14} className="shrink-0 text-[#60c9ef]" />}
        </button>
      ))}
    </div>
  )
}

function SkillList({
  state,
  selectedId,
  onRetry,
  onSelect,
}: {
  state: SkillState
  selectedId: string | null
  onRetry: () => void
  onSelect: (skill: Pick<SkillCardContract, 'id' | 'name' | 'summary'>) => void
}) {
  if (state.status === 'loading') {
    return <div className="flex items-center justify-center gap-2 py-10 text-[11px] text-white/42" data-testid="home-skill-loading"><Spinner size={14} /> 加载 Skill 目录</div>
  }
  if (state.status === 'error') {
    return <InlineLoadError message={state.error ?? 'Skill 目录加载失败'} onRetry={onRetry} testId="home-skill-error" retryTestId="home-skill-retry" />
  }
  if (state.items.length === 0) {
    return <InlineEmpty title="暂无 Skill" description="可以从全部 Skill 中创建一个能力包" testId="home-skill-empty" />
  }
  return (
    <div className="thin-scrollbar mt-2 max-h-[240px] space-y-1 overflow-y-auto pr-1" data-testid="home-skill-list">
      {state.items.map((skill) => (
        <button
          type="button"
          key={skill.id}
          data-testid="home-skill-option"
          data-selected={selectedId === skill.id ? 'true' : 'false'}
          onClick={() => onSelect(skill)}
          className={cn(
            'flex w-full items-start gap-2 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60c9ef]',
            selectedId === skill.id && 'bg-[#60c9ef]/10',
          )}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.07] text-[#9be2fa]"><IconSkill size={14} /></span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-[12px] text-white/86">
              <span className="truncate">{skill.name}</span>
              <span className="shrink-0 rounded bg-white/[0.06] px-1 text-[9px] text-white/32">/{skill.id.replace(/^skill-/, '')}</span>
            </span>
            <span className="mt-0.5 block line-clamp-2 text-[10px] leading-relaxed text-white/35">{skill.summary}</span>
          </span>
          {selectedId === skill.id && <IconCheck size={14} className="mt-1 shrink-0 text-[#60c9ef]" />}
        </button>
      ))}
    </div>
  )
}

function ModeOption({
  mode,
  selected,
  onSelect,
  title,
  description,
}: {
  mode: 'manual' | 'auto'
  selected: boolean
  onSelect: () => void
  title: string
  description: string
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      data-testid={`home-mode-option-${mode}`}
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-2 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60c9ef]',
        selected && 'bg-white/[0.06]',
      )}
    >
      <span className={cn('mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border', selected ? 'border-[#60c9ef] bg-[#60c9ef] text-[#17242a]' : 'border-white/25 text-transparent')}>
        <IconCheck size={10} />
      </span>
      <span className="min-w-0">
        <span className="block text-[12px] text-white/84">{title}</span>
        <span className="mt-0.5 block text-[10px] text-white/35">{description}</span>
      </span>
    </button>
  )
}

function InlineEmpty({ title, description, testId }: { title: string; description: string; testId: string }) {
  return (
    <div data-testid={testId} className="flex flex-col items-center justify-center gap-1 py-8 text-center">
      <IconSparkle size={19} className="text-white/20" />
      <p className="text-[11px] text-white/52">{title}</p>
      <p className="text-[10px] text-white/28">{description}</p>
    </div>
  )
}

function InlineLoadError({ message, onRetry, testId, retryTestId }: { message: string; onRetry: () => void; testId: string; retryTestId: string }) {
  return (
    <div data-testid={testId} role="alert" className="my-2 flex items-start gap-2 rounded-xl border border-red-300/15 bg-red-300/[0.06] p-2.5 text-[10px] text-red-200/78">
      <IconWarning size={14} className="mt-px shrink-0" />
      <span className="min-w-0 flex-1">{message}</span>
      <button type="button" data-testid={retryTestId} onClick={onRetry} className="shrink-0 rounded px-1.5 py-0.5 font-medium text-red-100 hover:bg-red-200/10">重试</button>
    </div>
  )
}

function AssetLibraryDialog({
  open,
  state,
  search,
  category,
  filteredAssets,
  onClose,
  onRetry,
  onSearch,
  onCategory,
  onUpload,
  onSelect,
}: {
  open: boolean
  state: AssetState
  search: string
  category: (typeof ASSET_CATEGORIES)[number]
  filteredAssets: Asset[]
  onClose: () => void
  onRetry: () => void
  onSearch: (value: string) => void
  onCategory: (value: (typeof ASSET_CATEGORIES)[number]) => void
  onUpload: () => void
  onSelect: (asset: Asset) => void
}) {
  return (
    <Dialog open={open} onClose={onClose} variant="panel" width={880} hideHeader testId="home-asset-library-dialog">
      <div className="flex min-h-[520px] flex-col text-white">
        <header className="flex items-center justify-between border-b border-white/[0.08] px-1 pb-3">
          <div>
            <h2 className="text-[15px] font-semibold text-white/88">资产管理</h2>
            <p className="mt-1 text-[11px] text-white/35">个人资产库 · 选择素材作为 Agent 上下文</p>
          </div>
          <button type="button" aria-label="关闭" onClick={onClose} className="rounded-lg p-1.5 text-white/45 hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60c9ef]"><IconClose size={17} /></button>
        </header>
        <div className="flex items-center gap-2 py-3">
          <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 text-white/35 focus-within:border-[#60c9ef]/60">
            <IconSearch size={15} />
            <span className="sr-only">搜索资产</span>
            <input value={search} aria-label="搜索资产" data-testid="home-asset-search" onChange={(event) => onSearch(event.target.value)} placeholder="请输入搜索内容" className="min-w-0 flex-1 bg-transparent text-[12px] text-white/82 outline-none placeholder:text-white/28" />
          </label>
          <button type="button" data-testid="home-asset-upload" onClick={onUpload} className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 text-[12px] font-medium text-[#181818] hover:bg-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60c9ef]"><IconUpload size={14} /> 上传资产</button>
        </div>
        <div className="flex flex-wrap items-center gap-1 border-b border-white/[0.08] pb-3" role="tablist" aria-label="资产分类">
          {ASSET_CATEGORIES.map((item) => (
            <button key={item} type="button" role="tab" aria-selected={category === item} data-testid={`home-asset-category-${item}`} onClick={() => onCategory(item)} className={cn('rounded-lg px-3 py-1.5 text-[11px] transition-colors', category === item ? 'bg-white/[0.1] text-white' : 'text-white/42 hover:bg-white/[0.05] hover:text-white/75')}>{item}</button>
          ))}
        </div>
        <div className="thin-scrollbar flex-1 overflow-y-auto">
          {state.status === 'loading' ? (
            <div data-testid="home-asset-loading" className="flex min-h-[330px] items-center justify-center gap-2 text-[12px] text-white/42"><Spinner size={16} /> 加载个人资产库</div>
          ) : state.status === 'error' ? (
            <div className="flex min-h-[330px] items-center justify-center"><InlineLoadError message={state.error ?? '个人资产库加载失败'} onRetry={onRetry} testId="home-asset-error" retryTestId="home-asset-retry" /></div>
          ) : filteredAssets.length === 0 ? (
            <div data-testid="home-asset-empty" className="flex min-h-[330px] flex-col items-center justify-center gap-2 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.06] text-white/24"><IconAssetLibrary size={27} /></span>
              <p className="text-[13px] text-white/70">当前暂无资产</p>
              <p className="text-[11px] text-white/32">上传一张参考图，或从生成结果中保存资产</p>
              <button type="button" onClick={onUpload} className="mt-1 rounded-lg bg-white px-3 py-1.5 text-[11px] font-medium text-[#181818] hover:bg-white/85">上传资产</button>
            </div>
          ) : (
            <div data-testid="home-asset-list" className="grid grid-cols-4 gap-3 py-4">
              {filteredAssets.map((asset) => (
                <button key={asset.id} type="button" data-testid="home-asset-option" onClick={() => onSelect(asset)} className="group overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.035] text-left transition-colors hover:border-[#60c9ef]/55 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60c9ef]">
                  <span className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-black/20 text-white/20">
                    {asset.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={asset.thumbnailUrl} alt="" className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]" />
                    ) : <IconAttachment size={23} />}
                  </span>
                  <span className="block truncate px-2.5 py-2 text-[11px] text-white/75">{asset.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  )
}
