'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  SkillComposerContextResponseSchema,
  SkillComposerModesResponseSchema,
  type SkillComposerAsset,
  type SkillComposerMode,
  type SkillComposerSkill,
} from '@/contracts/skills'
import { SKILL_COLLECTIONS, type SkillCollection } from '@/domain/skills'
import { api, ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import { Chip, EmptyState, Spinner } from '../ui/controls'
import { Dialog } from '../ui/Dialog'
import { Menu, useMenuAnchor } from '../ui/Menu'
import {
  IconAttachment,
  IconAudio,
  IconCheck,
  IconCharacter,
  IconChevronDown,
  IconClose,
  IconImage,
  IconLink,
  IconPlus,
  IconRefresh,
  IconScript,
  IconSend,
  IconSkill,
  IconSparkle,
  IconStyle,
  IconUpload,
  IconVideo,
  IconWarning,
} from '../icons'

type DrawerKind = 'attachments' | 'references' | 'skills'
type DrawerState = 'idle' | 'loading' | 'ready' | 'empty' | 'error'

const DRAWER_COPY: Record<DrawerKind, { title: string; description: string; search: string }> = {
  attachments: {
    title: '添加素材',
    description: '从本地素材库挑选一项，作为这次创作的输入。',
    search: '搜索素材',
  },
  references: {
    title: '添加参考',
    description: '把角色、风格、画面或声音参考带入创作上下文。',
    search: '搜索参考',
  },
  skills: {
    title: '选择 Skill',
    description: 'Skill 是版本化的执行契约，选择后会随本次创作一起提交。',
    search: '搜索 Skill',
  },
}

export function SkillMarketComposer() {
  const [draft, setDraft] = useState('')
  const [selectedSkill, setSelectedSkill] = useState<SkillComposerSkill | null>(null)
  const [selectedAttachments, setSelectedAttachments] = useState<SkillComposerAsset[]>([])
  const [selectedReferences, setSelectedReferences] = useState<SkillComposerAsset[]>([])
  const [mode, setMode] = useState<SkillComposerMode['id']>('manual')
  const [modeLabel, setModeLabel] = useState('手动规划')
  const [loginGateOpen, setLoginGateOpen] = useState(false)

  const attachmentMenu = useMenuAnchor()
  const modeMenu = useMenuAnchor()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [drawer, setDrawer] = useState<DrawerKind | null>(null)
  const [drawerState, setDrawerState] = useState<DrawerState>('idle')
  const [drawerError, setDrawerError] = useState<string | null>(null)
  const [drawerQuery, setDrawerQuery] = useState('')
  const [drawerRetry, setDrawerRetry] = useState(0)
  const [skillCollection, setSkillCollection] = useState<SkillCollection>('全部')
  const [skillItems, setSkillItems] = useState<SkillComposerSkill[]>([])
  const [assetItems, setAssetItems] = useState<SkillComposerAsset[]>([])

  const openDrawer = (kind: DrawerKind) => {
    setDrawerQuery('')
    setDrawerError(null)
    setDrawerState('idle')
    setDrawer((current) => (current === kind ? null : kind))
  }

  const loadDrawer = useCallback(async () => {
    if (!drawer) return
    setDrawerState('loading')
    setDrawerError(null)

    try {
      const params = new URLSearchParams({ composer: drawer })
      params.set('retry', String(drawerRetry))
      if (drawer === 'skills') {
        params.set('collection', skillCollection)
        if (drawerQuery.trim()) params.set('q', drawerQuery.trim())
      }
      const body = await api.get<unknown>(`/api/skills?${params.toString()}`)
      const parsed = SkillComposerContextResponseSchema.parse(body)
      if (parsed.kind === 'skills') {
        setSkillItems(parsed.items)
      } else {
        setAssetItems(parsed.items)
      }
      const size = parsed.items.length
      setDrawerState(size > 0 ? 'ready' : 'empty')
    } catch (cause: unknown) {
      setDrawerState('error')
      setDrawerError(cause instanceof ApiError ? cause.message : '上下文加载失败，请稍后重试')
    }
  }, [drawer, drawerQuery, drawerRetry, skillCollection])

  useEffect(() => {
    if (!drawer) return
    void loadDrawer()
  }, [drawer, loadDrawer])

  useEffect(() => {
    let cancelled = false
    const stored = window.localStorage.getItem('libtv.skill.composer')
    if (!stored) return
    try {
      const value = JSON.parse(stored) as { id?: unknown; version?: unknown }
      if (typeof value.id !== 'string') return
      void api
        .get<{ skill: SkillComposerSkill }>(`/api/skills/${encodeURIComponent(value.id)}`)
        .then((result) => {
          if (!cancelled) setSelectedSkill(result.skill)
        })
        .catch(() => undefined)
    } catch {
      window.localStorage.removeItem('libtv.skill.composer')
    }
    return () => {
      cancelled = true
    }
  }, [])

  const chooseAttachment = (asset: SkillComposerAsset) => {
    setSelectedAttachments((current) => current.some((item) => item.id === asset.id) ? current : [...current, asset])
    setDrawer(null)
  }

  const chooseReference = (asset: SkillComposerAsset) => {
    setSelectedReferences((current) => current.some((item) => item.id === asset.id) ? current : [...current, asset])
    setDrawer(null)
  }

  const chooseSkill = (skill: SkillComposerSkill) => {
    setSelectedSkill(skill)
    window.localStorage.setItem('libtv.skill.composer', JSON.stringify({ id: skill.id, version: skill.version }))
    setDrawer(null)
  }

  const removeSkill = () => {
    setSelectedSkill(null)
    window.localStorage.removeItem('libtv.skill.composer')
  }

  const handleFile = (file: File | undefined) => {
    if (!file) return
    const type = file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : file.type.startsWith('image/') ? 'image' : 'document'
    const asset: SkillComposerAsset = {
      id: `upload-${file.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'local-file'}`,
      label: file.name,
      description: '刚从本地设备添加的素材。',
      type,
      meta: `${file.type || '文件'} · ${formatBytes(file.size)}`,
      thumbnail: '/fixtures/libtv/skills/example-01.svg',
    }
    setSelectedAttachments((current) => [...current.filter((item) => item.id !== asset.id), asset])
  }

  const submit = () => {
    if (!draft.trim()) return
    setLoginGateOpen(true)
  }

  const allContextCount = selectedAttachments.length + selectedReferences.length + (selectedSkill ? 1 : 0)
  const selectedContext = [
    ...selectedAttachments.map((item) => `素材：${item.label}`),
    ...selectedReferences.map((item) => `参考：${item.label}`),
    ...(selectedSkill ? [`Skill：${selectedSkill.name} v${selectedSkill.version}`] : []),
  ]

  return (
    <>
      <form
        data-testid="skill-composer"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        className="mx-auto mt-7 max-w-[860px] rounded-2xl border border-white/[0.14] bg-[#202020] p-3 shadow-[0_18px_70px_rgba(0,0,0,.18)] transition-colors focus-within:border-white/[0.24]"
      >
        {(allContextCount > 0 || mode !== 'manual') && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5" data-testid="skill-composer-context">
            {selectedSkill && (
              <Chip
                testId="skill-composer-selected-skill"
                tone="accent"
                icon={<IconSkill size={11} />}
                onRemove={removeSkill}
              >
                {selectedSkill.name} · v{selectedSkill.version}
              </Chip>
            )}
            {selectedAttachments.map((asset) => (
              <Chip
                key={asset.id}
                testId={`skill-composer-selected-attachment-${asset.id}`}
                icon={<IconAttachment size={11} />}
                onRemove={() => setSelectedAttachments((current) => current.filter((item) => item.id !== asset.id))}
              >
                {asset.label}
              </Chip>
            ))}
            {selectedReferences.map((asset) => (
              <Chip
                key={asset.id}
                testId={`skill-composer-selected-reference-${asset.id}`}
                icon={<IconLink size={11} />}
                onRemove={() => setSelectedReferences((current) => current.filter((item) => item.id !== asset.id))}
              >
                {asset.label}
              </Chip>
            ))}
            {mode !== 'manual' && <span data-testid="skill-composer-mode-chip" className="rounded-full bg-white/[0.07] px-2 py-[3px] text-[11px] text-white/55">{modeLabel}</span>}
          </div>
        )}

        <label htmlFor="skill-composer-input" className="sr-only">输入创作灵感</label>
        <textarea
          id="skill-composer-input"
          data-testid="skill-composer-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              submit()
            }
          }}
          placeholder="请输入你的创作灵感，或从下方挑选一个 Skill 开始"
          rows={3}
          className="min-h-[82px] w-full resize-none bg-transparent px-1 py-1 text-[13px] leading-relaxed text-white/85 outline-none placeholder:text-white/30"
        />
        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-1 text-white/45">
            <button
              type="button"
              data-testid="skill-composer-attachment"
              aria-label="添加素材"
              title="添加素材"
              aria-haspopup="menu"
              aria-expanded={Boolean(attachmentMenu.anchor)}
              onClick={(event) => attachmentMenu.openFrom(event, 'above')}
              className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.07] hover:text-white"
            >
              <IconAttachment size={17} />
            </button>
            <button
              type="button"
              data-testid="skill-composer-skill"
              aria-label="选择 Skill"
              title="选择 Skill"
              aria-haspopup="dialog"
              aria-expanded={drawer === 'skills'}
              onClick={() => openDrawer('skills')}
              className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.07] hover:text-white"
            >
              <IconSkill size={17} />
            </button>
            <button
              type="button"
              data-testid="skill-composer-reference"
              aria-label="添加参考"
              title="添加参考"
              aria-haspopup="dialog"
              aria-expanded={drawer === 'references'}
              onClick={() => openDrawer('references')}
              className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.07] hover:text-white"
            >
              <IconLink size={17} />
            </button>
            <button
              type="button"
              data-testid="skill-composer-mode"
              aria-label="生成模式"
              title="生成模式"
              aria-haspopup="menu"
              aria-expanded={Boolean(modeMenu.anchor)}
              onClick={(event) => modeMenu.openFrom(event, 'above')}
              className="ml-1 flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] transition-colors hover:bg-white/[0.07] hover:text-white"
            >
              <IconSparkle size={14} />
              <span>{modeLabel}</span>
              <IconChevronDown size={12} />
            </button>
          </div>
          <button type="submit" data-testid="skill-composer-submit" aria-label="开始创作" disabled={!draft.trim()} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/65 text-[#191919] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-white/25 disabled:text-white/45"><IconSend size={17} /></button>
        </div>
        <input ref={fileInputRef} data-testid="skill-composer-file-input" type="file" className="sr-only" onChange={(event) => { handleFile(event.target.files?.[0]); event.target.value = '' }} aria-label="选择本地素材文件" />
      </form>

      {attachmentMenu.anchor && (
        <div data-testid="skill-composer-attachment-menu">
          <Menu
            anchor={attachmentMenu.anchor}
            placement="above"
            width={230}
            onClose={attachmentMenu.close}
            sections={[{
              title: '添加到创作上下文',
              items: [
                { id: 'upload', label: '上传本地素材', shortcut: '⌘U', icon: <IconUpload size={15} />, onSelect: () => fileInputRef.current?.click() },
                { id: 'library', label: '从素材库选择', icon: <IconImage size={15} />, onSelect: () => openDrawer('attachments') },
                { id: 'recent', label: '选择最近产物', icon: <IconVideo size={15} />, onSelect: () => openDrawer('attachments') },
              ],
            }]}
          />
        </div>
      )}

      {modeMenu.anchor && (
        <div data-testid="skill-composer-mode-menu">
          <ModeMenu
            anchor={modeMenu.anchor}
            selected={mode}
            onClose={modeMenu.close}
            onSelect={(next) => {
              setMode(next.id)
              setModeLabel(next.label)
            }}
          />
        </div>
      )}

      <ComposerContextDrawer
        kind={drawer}
        state={drawerState}
        error={drawerError}
        query={drawerQuery}
        setQuery={setDrawerQuery}
        retry={() => setDrawerRetry((current) => current + 1)}
        skillCollection={skillCollection}
        setSkillCollection={setSkillCollection}
        skills={skillItems}
        attachments={assetItems}
        selectedSkill={selectedSkill}
        selectedAttachments={selectedAttachments}
        selectedReferences={selectedReferences}
        onClose={() => setDrawer(null)}
        onChooseSkill={chooseSkill}
        onChooseAttachment={chooseAttachment}
        onChooseReference={chooseReference}
        onRequireLogin={() => setLoginGateOpen(true)}
      />

      <ComposerLoginGate
        open={loginGateOpen}
        draft={draft}
        context={selectedContext}
        onClose={() => setLoginGateOpen(false)}
      />
    </>
  )
}

function ModeMenu({
  anchor,
  selected,
  onClose,
  onSelect,
}: {
  anchor: { x: number; y: number }
  selected: SkillComposerMode['id']
  onClose: () => void
  onSelect: (mode: SkillComposerMode) => void
}) {
  const [modes, setModes] = useState<SkillComposerMode[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target || !(target instanceof Element) || !target.closest('[data-testid="skill-composer-mode-menu"]')) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    void api
      .get<unknown>('/api/skills?composer=modes')
      .then((body) => {
        const parsed = SkillComposerModesResponseSchema.parse(body)
        if (!cancelled) setModes(parsed.items)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof ApiError ? cause.message : '生成模式加载失败')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return <div data-testid="skill-composer-mode-error" className="panel fixed z-[70] w-[236px] px-3 py-3 text-[12px] text-ink-600" style={{ left: anchor.x, top: anchor.y }} role="alert">{error}</div>
  }

  if (modes.length === 0) {
    return <div data-testid="skill-composer-mode-loading" className="panel fixed z-[70] flex w-[236px] items-center gap-2 px-3 py-3 text-[12px] text-ink-500" style={{ left: anchor.x, top: anchor.y }} role="status"><Spinner size={13} />正在加载生成模式…</div>
  }

  return (
    <Menu
      anchor={anchor}
      placement="above"
      width={260}
      onClose={onClose}
      sections={[{
        title: '生成模式',
        items: modes.map((item) => ({
          id: item.id,
          label: item.label,
          checked: item.id === selected,
          shortcut: item.hint,
          icon: <IconSparkle size={14} />,
          onSelect: () => onSelect(item),
        })),
      }]}
    />
  )
}

function ComposerContextDrawer({
  kind,
  state,
  error,
  query,
  setQuery,
  retry,
  skillCollection,
  setSkillCollection,
  skills,
  attachments,
  selectedSkill,
  selectedAttachments,
  selectedReferences,
  onClose,
  onChooseSkill,
  onChooseAttachment,
  onChooseReference,
  onRequireLogin,
}: {
  kind: DrawerKind | null
  state: DrawerState
  error: string | null
  query: string
  setQuery: (value: string) => void
  retry: () => void
  skillCollection: SkillCollection
  setSkillCollection: (value: SkillCollection) => void
  skills: SkillComposerSkill[]
  attachments: SkillComposerAsset[]
  selectedSkill: SkillComposerSkill | null
  selectedAttachments: SkillComposerAsset[]
  selectedReferences: SkillComposerAsset[]
  onClose: () => void
  onChooseSkill: (skill: SkillComposerSkill) => void
  onChooseAttachment: (asset: SkillComposerAsset) => void
  onChooseReference: (asset: SkillComposerAsset) => void
  onRequireLogin: () => void
}) {
  const copy = kind ? DRAWER_COPY[kind] : DRAWER_COPY.skills
  const visibleAssets = useMemo(() => attachments.filter((asset) => {
    const value = `${asset.label} ${asset.description} ${asset.meta}`.toLowerCase()
    return value.includes(query.trim().toLowerCase())
  }), [attachments, query])

  if (!kind) return null

  return (
    <Dialog open onClose={onClose} title={copy.title} variant="panel" width={680} testId={`skill-composer-${kind}-drawer`}>
      <div className="space-y-4 px-5 pb-5 pt-3">
        <p className="text-[12px] leading-relaxed text-ink-500">{copy.description}</p>
        {kind === 'skills' && (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1 rounded-xl bg-ink-100 p-1" role="tablist" aria-label="Skill 集合">
              {SKILL_COLLECTIONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={skillCollection === item}
                  data-testid={`skill-composer-collection-${item}`}
                  onClick={() => {
                    if (item !== '全部') {
                      onRequireLogin()
                      return
                    }
                    setSkillCollection(item)
                  }}
                  className={cn('rounded-lg px-3 py-1.5 text-[12px] transition-colors', skillCollection === item ? 'bg-surface font-medium text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700')}
                >
                  {item}
                </button>
              ))}
            </div>
            <button type="button" data-testid="skill-composer-create" onClick={onRequireLogin} className="inline-flex items-center gap-1 rounded-lg border border-ink-200 px-2.5 py-1.5 text-[12px] text-ink-600 hover:bg-ink-50"><IconPlus size={13} />创建 Skill</button>
          </div>
        )}
        <div className="flex h-9 items-center gap-2 rounded-xl border border-ink-200 px-3 focus-within:border-accent">
          <IconSkill size={14} className="text-ink-400" />
          <label htmlFor={`skill-composer-${kind}-search`} className="sr-only">{copy.search}</label>
          <input id={`skill-composer-${kind}-search`} data-testid={`skill-composer-${kind}-search`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.search} className="min-w-0 flex-1 bg-transparent text-[12px] text-ink-800 outline-none placeholder:text-ink-400" />
          {query && <button type="button" aria-label="清除搜索" onClick={() => setQuery('')} className="rounded-full p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"><IconClose size={12} /></button>}
        </div>

        {state === 'loading' && <div data-testid="skill-composer-drawer-loading" className="flex items-center justify-center gap-2 py-16 text-[12px] text-ink-400" role="status"><Spinner size={18} />正在加载…</div>}
        {state === 'error' && <div data-testid="skill-composer-drawer-error"><EmptyState icon={<IconWarning size={27} />} title="上下文暂时加载失败" description={error ?? '请检查本地 mock 服务后重试。'} action={<button type="button" data-testid="skill-composer-drawer-retry" onClick={retry} className="inline-flex items-center gap-1.5 rounded-lg bg-ink-900 px-3.5 py-2 text-[12px] font-medium text-white"><IconRefresh size={13} />重试</button>} /></div>}
        {state === 'empty' && <div data-testid="skill-composer-drawer-empty"><EmptyState icon={<IconSearchIcon />} title={query ? '没有匹配的内容' : '这里还没有可选内容'} description={query ? '换个关键词试试，或清除搜索查看全部。' : '本地 fixture 暂未准备可用的上下文。'} action={query ? <button type="button" onClick={() => setQuery('')} className="rounded-lg bg-ink-900 px-3.5 py-2 text-[12px] font-medium text-white">清除搜索</button> : undefined} /></div>}
        {state === 'ready' && kind === 'skills' && <div className="grid gap-2" data-testid="skill-composer-skill-options">{skills.map((skill) => <SkillOption key={skill.id} skill={skill} selected={selectedSkill?.id === skill.id} onChoose={() => onChooseSkill(skill)} />)}</div>}
        {state === 'ready' && kind !== 'skills' && <div className="grid gap-2" data-testid={`skill-composer-${kind}-options`}>{visibleAssets.map((asset) => <AssetOption key={asset.id} asset={asset} selected={(kind === 'attachments' ? selectedAttachments : selectedReferences).some((item) => item.id === asset.id)} onChoose={() => kind === 'attachments' ? onChooseAttachment(asset) : onChooseReference(asset)} />)}</div>}
        {state === 'ready' && kind !== 'skills' && visibleAssets.length === 0 && <div data-testid="skill-composer-drawer-empty"><EmptyState icon={<IconSearchIcon />} title="没有匹配的内容" description="换个关键词试试，或清除搜索查看全部。" /></div>}
      </div>
    </Dialog>
  )
}

function SkillOption({ skill, selected, onChoose }: { skill: SkillComposerSkill; selected: boolean; onChoose: () => void }) {
  return (
    <div className={cn('flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors', selected ? 'border-accent/40 bg-accent-soft' : 'border-ink-100 hover:border-ink-200 hover:bg-ink-50')} data-testid={`skill-composer-skill-option-${skill.id}`}>
      <button type="button" aria-pressed={selected} onClick={onChoose} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink"><IconSkill size={17} /></span>
        <span className="min-w-0"><span className="flex items-center gap-2"><span className="truncate text-[13px] font-medium text-ink-800">{skill.name}</span><span className="shrink-0 rounded bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-400">v{skill.version}</span></span><span className="mt-1 block line-clamp-2 text-[11px] leading-relaxed text-ink-500">{skill.summary}</span></span>
      </button>
      <div className="flex shrink-0 items-center gap-2"><span className="hidden text-[10px] text-ink-400 sm:inline">{skill.category}</span>{selected && <IconCheck size={15} className="text-accent" />}<Link href={`/skills/${skill.id}`} aria-label={`查看 ${skill.name} 详情`} onClick={(event) => event.stopPropagation()} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"><IconLink size={14} /></Link></div>
    </div>
  )
}

function AssetOption({ asset, selected, onChoose }: { asset: SkillComposerAsset; selected: boolean; onChoose: () => void }) {
  return (
    <button type="button" data-testid={`skill-composer-asset-option-${asset.id}`} aria-pressed={selected} onClick={onChoose} className={cn('flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors', selected ? 'border-accent/40 bg-accent-soft' : 'border-ink-100 hover:border-ink-200 hover:bg-ink-50')}>
      <span className="h-11 w-16 shrink-0 overflow-hidden rounded-lg bg-ink-100">
        {/* eslint-disable-next-line @next/next/no-img-element -- deterministic local SVG fixture. */}
        <img src={asset.thumbnail} alt="" className="h-full w-full object-cover" />
      </span>
      <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium text-ink-800">{asset.label}</span><span className="mt-1 block line-clamp-2 text-[11px] leading-relaxed text-ink-500">{asset.description}</span></span>
      <span className="flex shrink-0 items-center gap-2"><span className="hidden text-[10px] text-ink-400 sm:inline">{asset.meta}</span>{assetIcon(asset.type)}{selected && <IconCheck size={15} className="text-accent" />}</span>
    </button>
  )
}

function assetIcon(type: SkillComposerAsset['type']) {
  if (type === 'image') return <IconImage size={14} className="text-ink-400" />
  if (type === 'video') return <IconVideo size={14} className="text-ink-400" />
  if (type === 'audio') return <IconAudio size={14} className="text-ink-400" />
  if (type === 'character') return <IconCharacter size={14} className="text-ink-400" />
  if (type === 'style') return <IconStyle size={14} className="text-ink-400" />
  return <IconScript size={14} className="text-ink-400" />
}

function IconSearchIcon() {
  return <span className="text-[22px] text-ink-300">⌕</span>
}

function ComposerLoginGate({ open, draft, context, onClose }: { open: boolean; draft: string; context: string[]; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="登录后开始创作" testId="skill-composer-login-gate">
      <div data-testid="skill-composer-session-intent" className="space-y-3 text-[13px] leading-relaxed text-ink-600">
        <p>你的灵感和上下文已经保留在当前页面。登录 LibTV 后，Agent 才能创建会话并继续创作。</p>
        <p className="rounded-xl bg-ink-50 px-3.5 py-2.5 text-[12px] text-ink-700">「{draft}」</p>
        {context.length > 0 && <div className="flex flex-wrap gap-1.5">{context.map((item) => <span key={item} className="rounded-full bg-accent-soft px-2 py-1 text-[11px] text-accent-ink">{item}</span>)}</div>}
        <p className="text-[11px] text-ink-400">当前生成模式：会在登录后按选择的模式执行。</p>
      </div>
      <div className="flex items-center justify-end gap-2 pt-5"><button type="button" onClick={onClose} className="rounded-lg px-3.5 py-2 text-[12px] text-ink-600 hover:bg-ink-50">继续浏览</button><Link href="/account" data-testid="skill-composer-open-login" className="rounded-lg bg-ink-900 px-3.5 py-2 text-[12px] font-medium text-white">注册 / 登录</Link></div>
    </Dialog>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
