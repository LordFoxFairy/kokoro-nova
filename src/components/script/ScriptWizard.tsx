'use client'

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { CAMERA_MOVES, SHOT_SIZES } from '@/domain/libraries'
import { cn } from '@/lib/cn'
import { useEditor } from '@/lib/editor-store'
import { Dialog } from '../ui/Dialog'
import { Menu, useMenuAnchor } from '../ui/Menu'
import { Tooltip } from '../ui/Tooltip'
import { Chip, EmptyState, Field, SegmentedControl } from '../ui/controls'
import {
  IconCharacter,
  IconCheck,
  IconChevronDown,
  IconClose,
  IconImage,
  IconLayers,
  IconMore,
  IconPlus,
  IconRefresh,
  IconScript,
  IconSparkle,
  IconTrash,
  IconUpload,
  IconVideo,
} from '../icons'
import {
  AI_ASPECT_RATIOS,
  AI_RESOLUTIONS,
  ASSET_KINDS,
  ASSET_KIND_LABEL,
  ASSET_SOURCE_LABEL,
  DEFAULT_AI_ASSET_FORM,
  MAX_SHOT_SECONDS,
  MIN_SHOT_SECONDS,
  appendShot,
  assetFromAiForm,
  batchBlockReason,
  clampDuration,
  composeAllPrompts,
  composePrompt,
  createAsset,
  draftForManualEntry,
  draftFromCharacter,
  draftFromScreenplay,
  emptyDraft,
  extractAssets,
  hueFromName,
  isAiAssetFormValid,
  mergeAssets,
  moveShot,
  removeAssetFrom,
  removeShot,
  syncAssetRefs,
  updateShot,
  type AiAssetForm,
  type AssetRemovalMode,
  type ScriptAsset,
  type ScriptAssetKind,
  type ScriptDraft,
  type Shot,
  type ShotSize,
} from './script-model'

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

export interface ScriptWizardProps {
  /** Controls the full-screen sheet. Nothing renders while false. */
  open: boolean
  /** Called on Escape, backdrop click, 关闭 and after a successful action. */
  onClose: () => void
  /**
   * Draft to resume. A draft with shots opens straight on 第 1 步; an empty one
   * (or omitted) opens the entry screen. Only read when `open` flips to true,
   * so the caller may pass a fresh object on every render.
   */
  initialDraft?: ScriptDraft
  /**
   * Hand the finished draft back. `save` just persists, `batch-image` and
   * `batch-video` additionally ask the caller to enqueue one generation per
   * shot — both only fire once every shot carries a final prompt.
   * The wizard closes itself right after.
   */
  onApply: (draft: ScriptDraft, action: 'save' | 'batch-image' | 'batch-video') => void
}

type Step = 'entry' | 'shots' | 'assets' | 'prompts'

const STEPS: { key: Exclude<Step, 'entry'>; label: string }[] = [
  { key: 'shots', label: '确认镜头' },
  { key: 'assets', label: '准备资产' },
  { key: 'prompts', label: '合成提示词' },
]

const SAMPLE_SCREENPLAY = `雨夜追踪

场景一：老城区窄巷 - 夜
运镜：跟随
@林夏 撑着黑伞快步穿过积水的窄巷，霓虹在水面碎成一片。
音效：雨声、远处的警笛
林夏：他已经走了三个路口了。

场景二：窄巷尽头 - 夜
景别：特写
@林夏 停下，手里的 @旧怀表 指针停在十一点。
时长：8秒

场景三：天台 - 夜
远景。@林夏 爬上天台，整座老城区在脚下铺开。
「我知道你在看着我。」`

/* ------------------------------------------------------------------ *
 * Shared bits
 * ------------------------------------------------------------------ */

const CELL_INPUT =
  'w-full rounded-lg border border-ink-200 bg-surface px-2 py-1.5 text-[12px] leading-snug text-ink-800 outline-none transition-colors focus:border-accent placeholder:text-ink-300'

const SHOT_GRID =
  'grid grid-cols-[56px_84px_minmax(200px,2fr)_100px_minmax(140px,1.1fr)_minmax(120px,0.9fr)_minmax(130px,1fr)_minmax(190px,1.5fr)_76px] gap-2'

const CAMERA_DATALIST_ID = 'script-wizard-camera-moves'

function PrimaryButton({
  children,
  onClick,
  testId,
  tone = 'ink',
}: {
  children: ReactNode
  onClick: () => void
  testId?: string
  tone?: 'ink' | 'accent'
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-85',
        tone === 'accent' ? 'bg-accent' : 'bg-ink-900',
      )}
    >
      {children}
    </button>
  )
}

function GhostButton({
  children,
  onClick,
  testId,
}: {
  children: ReactNode
  onClick: () => void
  testId?: string
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg bg-ink-100 px-3 py-2 text-[13px] font-medium text-ink-700 transition-colors hover:bg-ink-200"
    >
      {children}
    </button>
  )
}

/**
 * A button that can be blocked with an explanation.
 *
 * `disabled` is deliberately not used: browsers swallow pointer events on
 * disabled controls, so the tooltip that explains *why* it is blocked would
 * never appear — which is the whole point of blocking it visibly.
 */
function BlockableButton({
  children,
  onClick,
  blockedReason,
  testId,
  tone = 'ink',
}: {
  children: ReactNode
  onClick: () => void
  blockedReason: string | null
  testId?: string
  tone?: 'ink' | 'accent'
}) {
  const blocked = Boolean(blockedReason)
  const button = (
    <button
      type="button"
      data-testid={testId}
      aria-disabled={blocked}
      title={blockedReason ?? undefined}
      onClick={() => {
        if (!blocked) onClick()
      }}
      className={cn(
        'flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-opacity',
        blocked
          ? 'cursor-not-allowed bg-ink-100 text-ink-400'
          : cn('text-white hover:opacity-85', tone === 'accent' ? 'bg-accent' : 'bg-ink-900'),
      )}
    >
      {children}
    </button>
  )

  if (!blocked) return button
  return (
    <Tooltip label={blockedReason} side="top" delay={120}>
      {button}
    </Tooltip>
  )
}

function AssetPreview({ asset, className }: { asset: ScriptAsset; className?: string }) {
  if (asset.referenceUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={asset.referenceUrl} alt={asset.name} className={cn('object-cover', className)} />
  }
  return (
    <div
      className={className}
      style={{
        background: `linear-gradient(148deg, hsl(${asset.previewHue} 58% 66%), hsl(${(asset.previewHue + 42) % 360} 54% 44%))`,
      }}
    />
  )
}

/* ------------------------------------------------------------------ *
 * ScriptWizard
 * ------------------------------------------------------------------ */

export function ScriptWizard({ open, onClose, initialDraft, onApply }: ScriptWizardProps) {
  const [draft, setDraft] = useState<ScriptDraft>(() => initialDraft ?? emptyDraft())
  // Resolved during the first render, not in an effect, so resuming a draft
  // never flashes the entry screen before switching to the table.
  const [step, setStep] = useState<Step>(() => ((initialDraft?.shots.length ?? 0) > 0 ? 'shots' : 'entry'))
  const [entryMode, setEntryMode] = useState<'screenplay' | 'character' | null>(null)

  // Auto-extraction runs once per session; otherwise assets the user removed in
  // 第 2 步 would reappear every time they walk back to 第 1 步 and forward again.
  const autoExtractedRef = useRef((initialDraft?.assets.length ?? 0) > 0)
  const wasOpenRef = useRef(false)

  // Object URLs for locally uploaded references are owned here rather than in
  // AssetStage: that stage unmounts on every step change, so revoking there
  // would kill the preview of an asset that is still in the draft.
  const objectUrlsRef = useRef<string[]>([])
  useEffect(
    () => () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
      objectUrlsRef.current = []
    },
    [],
  )

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      wasOpenRef.current = true
      const next = initialDraft ?? emptyDraft()
      setDraft(next)
      setStep(next.shots.length > 0 ? 'shots' : 'entry')
      setEntryMode(null)
      autoExtractedRef.current = next.assets.length > 0
    }
    if (!open) wasOpenRef.current = false
  }, [open, initialDraft])

  const patchShot = (shotId: string, patch: Partial<Shot>) =>
    setDraft((current) => ({ ...current, shots: updateShot(current.shots, shotId, patch) }))

  const goToAssets = () => {
    setDraft((current) => {
      const withProposals = autoExtractedRef.current
        ? current
        : { ...current, assets: mergeAssets(current.assets, extractAssets(current.shots)) }
      return syncAssetRefs(withProposals)
    })
    autoExtractedRef.current = true
    setStep('assets')
  }

  const goToPrompts = () => {
    setDraft((current) => syncAssetRefs(current))
    setStep('prompts')
  }

  const apply = (action: 'save' | 'batch-image' | 'batch-video') => {
    onApply(draft, action)
    onClose()
  }

  const blockReason = useMemo(() => batchBlockReason(draft), [draft])

  return (
    <Dialog open={open} onClose={onClose} variant="panel" width={1280} hideHeader testId="script-wizard">
      <datalist id={CAMERA_DATALIST_ID}>
        {CAMERA_MOVES.map((move) => (
          <option key={move.id} value={move.name} />
        ))}
      </datalist>

      <div className="flex h-[78vh] flex-col">
        <header className="flex shrink-0 items-center gap-5 border-b border-ink-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <IconScript size={18} className="text-ink-500" />
            <h2 className="text-[15px] font-semibold text-ink-900">脚本 V2</h2>
          </div>
          <StepIndicator
            step={step}
            reachable={draft.shots.length > 0}
            onJump={(target) => {
              if (target === 'assets') goToAssets()
              else if (target === 'prompts') goToPrompts()
              else setStep(target)
            }}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="ml-auto rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-700"
          >
            <IconClose size={16} />
          </button>
        </header>

        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto">
          {step === 'entry' && (
            <EntryScreen
              mode={entryMode}
              onModeChange={setEntryMode}
              onStart={(next) => {
                setDraft(next)
                setStep('shots')
              }}
            />
          )}
          {step === 'shots' && (
            <ShotTable
              shots={draft.shots}
              onPatch={patchShot}
              onReorder={(from, to) =>
                setDraft((current) => ({ ...current, shots: moveShot(current.shots, from, to) }))
              }
              onRemove={(shotId) =>
                setDraft((current) => ({ ...current, shots: removeShot(current.shots, shotId) }))
              }
              onAdd={() => setDraft((current) => ({ ...current, shots: appendShot(current.shots) }))}
              onCompose={(shot) =>
                patchShot(shot.id, { finalPrompt: composePrompt(shot, draft.assets) })
              }
            />
          )}
          {step === 'assets' && (
            <AssetStage
              draft={draft}
              onChange={setDraft}
              onTrackObjectUrl={(url) => objectUrlsRef.current.push(url)}
              onReextract={() =>
                setDraft((current) =>
                  syncAssetRefs({
                    ...current,
                    assets: mergeAssets(current.assets, extractAssets(current.shots)),
                  }),
                )
              }
            />
          )}
          {step === 'prompts' && (
            <PromptStage
              draft={draft}
              onPatch={patchShot}
              onComposeAll={() => setDraft((current) => composeAllPrompts(syncAssetRefs(current)))}
            />
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-ink-100 px-6 py-3.5">
          <div className="text-[12px] text-ink-400">
            {draft.shots.length > 0
              ? `${draft.shots.length} 个镜头 · ${draft.assets.length} 个资产 · 总时长约 ${draft.shots.reduce((sum, shot) => sum + clampDuration(shot.durationSeconds), 0)} 秒`
              : '还没有镜头'}
          </div>
          <div className="flex items-center gap-2">
            {step === 'shots' && draft.shots.length > 0 && (
              <>
                <GhostButton onClick={() => apply('save')} testId="script-save">
                  保存脚本
                </GhostButton>
                <PrimaryButton onClick={goToAssets} testId="script-next-assets">
                  下一步：准备资产
                </PrimaryButton>
              </>
            )}
            {step === 'assets' && (
              <>
                <GhostButton onClick={() => setStep('shots')}>上一步</GhostButton>
                <PrimaryButton onClick={goToPrompts} testId="script-next-prompts">
                  下一步：合成提示词
                </PrimaryButton>
              </>
            )}
            {step === 'prompts' && (
              <>
                <GhostButton onClick={() => setStep('assets')}>上一步</GhostButton>
                <GhostButton onClick={() => apply('save')} testId="script-save">
                  保存脚本
                </GhostButton>
                <BlockableButton
                  blockedReason={blockReason}
                  onClick={() => apply('batch-image')}
                  testId="script-batch-image"
                >
                  <IconImage size={15} />
                  批量生图
                </BlockableButton>
                <BlockableButton
                  tone="accent"
                  blockedReason={blockReason}
                  onClick={() => apply('batch-video')}
                  testId="script-batch-video"
                >
                  <IconVideo size={15} />
                  批量生视频
                </BlockableButton>
              </>
            )}
          </div>
        </footer>
      </div>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ *
 * Step indicator
 * ------------------------------------------------------------------ */

function StepIndicator({
  step,
  reachable,
  onJump,
}: {
  step: Step
  reachable: boolean
  onJump: (step: Exclude<Step, 'entry'>) => void
}) {
  const activeIndex = STEPS.findIndex((entry) => entry.key === step)

  return (
    <div className="flex items-center gap-1" data-testid="script-steps">
      {STEPS.map((entry, index) => {
        const active = index === activeIndex
        const done = activeIndex > index
        const enabled = reachable || index === 0
        return (
          <div key={entry.key} className="flex items-center gap-1">
            {index > 0 && <span className="mx-1 h-px w-6 bg-ink-200" />}
            <button
              type="button"
              data-testid={`script-step-${entry.key}`}
              aria-current={active ? 'step' : undefined}
              onClick={() => {
                if (enabled) onJump(entry.key)
              }}
              className={cn(
                'flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-colors',
                active ? 'bg-accent-soft' : enabled ? 'hover:bg-ink-50' : 'cursor-not-allowed opacity-50',
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold',
                  active
                    ? 'bg-accent text-white'
                    : done
                      ? 'bg-success/15 text-success'
                      : 'bg-ink-100 text-ink-500',
                )}
              >
                {done ? <IconCheck size={12} /> : index + 1}
              </span>
              <span
                className={cn(
                  'text-[12px] font-medium',
                  active ? 'text-accent-ink' : done ? 'text-ink-700' : 'text-ink-500',
                )}
              >
                {entry.label}
              </span>
            </button>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Entry screen
 * ------------------------------------------------------------------ */

function EntryScreen({
  mode,
  onModeChange,
  onStart,
}: {
  mode: 'screenplay' | 'character' | null
  onModeChange: (mode: 'screenplay' | 'character' | null) => void
  onStart: (draft: ScriptDraft) => void
}) {
  const [screenplay, setScreenplay] = useState('')
  const [character, setCharacter] = useState({ name: '', description: '', premise: '' })

  if (mode === 'screenplay') {
    const ready = screenplay.trim().length > 0
    return (
      <div className="mx-auto max-w-3xl px-6 py-6">
        <EntryHeading
          title="粘贴剧本"
          description="按空行、场景标题（场景一 / 第 3 场 / INT.）或编号段落切分成镜头，可用「对白：」「音效：」「运镜：」「景别：」「时长：」标注单行字段。"
          onBack={() => onModeChange(null)}
        />
        <textarea
          value={screenplay}
          onChange={(event) => setScreenplay(event.target.value)}
          rows={16}
          data-testid="script-screenplay-input"
          placeholder={'场景一：老城区窄巷 - 夜\n运镜：跟随\n@林夏 撑着黑伞快步穿过窄巷。\n音效：雨声'}
          className="thin-scrollbar w-full resize-none rounded-2xl border border-ink-200 bg-surface p-4 text-[13px] leading-relaxed text-ink-800 outline-none transition-colors focus:border-accent placeholder:text-ink-300"
        />
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setScreenplay(SAMPLE_SCREENPLAY)}
            className="text-[12px] text-ink-400 underline-offset-2 hover:text-ink-700 hover:underline"
          >
            填入示例剧本
          </button>
          <BlockableButton
            testId="script-parse-screenplay"
            blockedReason={ready ? null : '先粘贴或输入剧本内容'}
            onClick={() => onStart(draftFromScreenplay(screenplay))}
          >
            解析为镜头表
          </BlockableButton>
        </div>
      </div>
    )
  }

  if (mode === 'character') {
    const ready = character.name.trim().length > 0
    return (
      <div className="mx-auto max-w-xl px-6 py-6">
        <EntryHeading
          title="从角色出发"
          description="先立住人物，再生成建立 → 登场 → 转折 → 收束四个镜头，每个字段都可以继续改。"
          onBack={() => onModeChange(null)}
        />
        <div className="space-y-4">
          <Field label="角色名">
            <input
              value={character.name}
              onChange={(event) => setCharacter({ ...character, name: event.target.value })}
              data-testid="script-character-name"
              placeholder="林夏"
              className="w-full rounded-lg border border-ink-200 px-3 py-2 text-[13px] outline-none transition-colors focus:border-accent"
            />
          </Field>
          <Field label="角色设定" hint="外观、年龄、服装、气质，会直接进入最终提示词">
            <textarea
              value={character.description}
              onChange={(event) => setCharacter({ ...character, description: event.target.value })}
              rows={3}
              placeholder="二十五岁，短发，米色风衣，眼神警觉"
              className="w-full resize-none rounded-lg border border-ink-200 px-3 py-2 text-[13px] leading-relaxed outline-none transition-colors focus:border-accent"
            />
          </Field>
          <Field label="故事梗概" hint="可选">
            <input
              value={character.premise}
              onChange={(event) => setCharacter({ ...character, premise: event.target.value })}
              placeholder="雨夜里的一次跟踪"
              className="w-full rounded-lg border border-ink-200 px-3 py-2 text-[13px] outline-none transition-colors focus:border-accent"
            />
          </Field>
          <div className="flex justify-end">
            <BlockableButton
              testId="script-generate-character"
              blockedReason={ready ? null : '先填写角色名'}
              onClick={() =>
                onStart(draftFromCharacter(character.name, character.description, character.premise))
              }
            >
              生成四个镜头
            </BlockableButton>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 text-center">
        <div className="text-[16px] font-semibold text-ink-900">从哪里开始？</div>
        <div className="mt-1 text-[13px] text-ink-400">三种入口最终都会汇入同一张镜头表。</div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <EntryCard
          testId="script-entry-screenplay"
          icon={<IconScript size={22} />}
          title="剧本生成"
          description="粘贴一段剧本，自动切分场景与镜头，识别对白、音效与景别。"
          onClick={() => onModeChange('screenplay')}
        />
        <EntryCard
          testId="script-entry-character"
          icon={<IconCharacter size={22} />}
          title="角色生成"
          description="先定义角色，再展开成一组带起承转合的镜头。"
          onClick={() => onModeChange('character')}
        />
        <EntryCard
          testId="script-entry-manual"
          icon={<IconPlus size={22} />}
          title="自己编写"
          description="从一个空镜头开始，逐条手写画面、景别与运镜。"
          onClick={() => onStart(draftForManualEntry())}
        />
      </div>
    </div>
  )
}

function EntryHeading({
  title,
  description,
  onBack,
}: {
  title: string
  description: string
  onBack: () => void
}) {
  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={onBack}
        className="mb-2 flex items-center gap-1 text-[12px] text-ink-400 transition-colors hover:text-ink-700"
      >
        <IconChevronDown size={13} className="rotate-90" />
        返回入口
      </button>
      <div className="text-[15px] font-semibold text-ink-900">{title}</div>
      <div className="mt-1 text-[12px] leading-relaxed text-ink-400">{description}</div>
    </div>
  )
}

function EntryCard({
  icon,
  title,
  description,
  onClick,
  testId,
}: {
  icon: ReactNode
  title: string
  description: string
  onClick: () => void
  testId: string
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="group flex flex-col gap-2 rounded-2xl p-5 text-left ring-1 ring-ink-100 transition-shadow hover:shadow-[var(--shadow-float)]"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink-50 text-ink-500 transition-colors group-hover:bg-accent-soft group-hover:text-accent-ink">
        {icon}
      </span>
      <span className="text-[14px] font-semibold text-ink-900">{title}</span>
      <span className="text-[12px] leading-relaxed text-ink-400">{description}</span>
    </button>
  )
}

/* ------------------------------------------------------------------ *
 * Phase 1 — shot table
 * ------------------------------------------------------------------ */

function ShotTable({
  shots,
  onPatch,
  onReorder,
  onRemove,
  onAdd,
  onCompose,
}: {
  shots: Shot[]
  onPatch: (shotId: string, patch: Partial<Shot>) => void
  onReorder: (from: number, to: number) => void
  onRemove: (shotId: string) => void
  onAdd: () => void
  onCompose: (shot: Shot) => void
}) {
  // Rows only become draggable while the grip is held, so the textareas inside
  // keep normal text selection the rest of the time.
  const [armed, setArmed] = useState<number | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  if (shots.length === 0) {
    return (
      <EmptyState
        icon={<IconScript size={30} />}
        title="镜头表是空的"
        description="添加第一个镜头，或返回入口重新解析一段剧本。"
        action={<PrimaryButton onClick={onAdd} testId="script-add-shot">添加镜头</PrimaryButton>}
      />
    )
  }

  return (
    <div className="px-6 py-4">
      {/* Only a min-width here: the surrounding scroller owns both axes, which
          is what keeps the header row sticky while the table scrolls. */}
      <div className="min-w-[1120px]">
        <div
          className={cn(
            SHOT_GRID,
            'sticky top-0 z-10 border-b border-ink-100 bg-surface pb-2 text-[11px] font-medium text-ink-400',
          )}
        >
          <div className="pl-1">镜号</div>
          <div>时长</div>
          <div>画面</div>
          <div>景别</div>
          <div>对白</div>
          <div>音效</div>
          <div>运镜</div>
          <div>最终提示词</div>
          <div className="text-right">操作</div>
        </div>

        <div className="divide-y divide-ink-100">
          {shots.map((shot, index) => (
            <div
              key={shot.id}
              data-testid={`script-shot-row-${index + 1}`}
              draggable={armed === index}
              onDragStart={(event) => {
                setDragIndex(index)
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', String(index))
              }}
              onDragOver={(event) => {
                if (dragIndex === null || dragIndex === index) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                setOverIndex(index)
              }}
              onDrop={(event) => {
                event.preventDefault()
                if (dragIndex !== null) onReorder(dragIndex, index)
                setDragIndex(null)
                setOverIndex(null)
                setArmed(null)
              }}
              onDragEnd={() => {
                setDragIndex(null)
                setOverIndex(null)
                setArmed(null)
              }}
              className={cn(
                SHOT_GRID,
                'items-start py-2.5 transition-colors',
                dragIndex === index && 'opacity-40',
                overIndex === index && dragIndex !== index && 'bg-accent-soft/60',
              )}
            >
              <div className="flex items-center gap-1 pt-1.5">
                <button
                  type="button"
                  aria-label="拖动排序"
                  onPointerDown={() => setArmed(index)}
                  onPointerUp={() => setArmed(null)}
                  className="cursor-grab rounded p-0.5 text-ink-300 transition-colors hover:text-ink-600 active:cursor-grabbing"
                >
                  <IconMore size={14} className="rotate-90" />
                </button>
                <span className="font-mono text-[12px] text-ink-700">{shot.index}</span>
              </div>

              <div className="flex items-center gap-1 pt-0.5">
                <DurationInput
                  value={shot.durationSeconds}
                  label={`第 ${shot.index} 镜时长`}
                  onCommit={(durationSeconds) => onPatch(shot.id, { durationSeconds })}
                />
                <span className="text-[11px] text-ink-400">秒</span>
              </div>

              <textarea
                value={shot.description}
                onChange={(event) => onPatch(shot.id, { description: event.target.value })}
                rows={3}
                placeholder="这一镜看到什么，用 @ 标注角色 / 场景 / 道具"
                className={cn(CELL_INPUT, 'resize-none')}
              />

              <select
                value={shot.shotSize}
                aria-label={`第 ${shot.index} 镜景别`}
                onChange={(event) => onPatch(shot.id, { shotSize: event.target.value as ShotSize })}
                className={cn(CELL_INPUT, 'mt-0.5 h-8 cursor-pointer')}
              >
                {SHOT_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>

              <textarea
                value={shot.dialogue}
                onChange={(event) => onPatch(shot.id, { dialogue: event.target.value })}
                rows={3}
                placeholder="角色：台词"
                className={cn(CELL_INPUT, 'resize-none')}
              />

              <textarea
                value={shot.sfx}
                onChange={(event) => onPatch(shot.id, { sfx: event.target.value })}
                rows={3}
                placeholder="雨声、脚步"
                className={cn(CELL_INPUT, 'resize-none')}
              />

              <input
                value={shot.cameraMove}
                list={CAMERA_DATALIST_ID}
                aria-label={`第 ${shot.index} 镜运镜`}
                onChange={(event) => onPatch(shot.id, { cameraMove: event.target.value })}
                placeholder="跟随 / 推近"
                className={cn(CELL_INPUT, 'mt-0.5')}
              />

              <div className="space-y-1">
                <textarea
                  value={shot.finalPrompt}
                  onChange={(event) => onPatch(shot.id, { finalPrompt: event.target.value })}
                  rows={3}
                  placeholder="在第 3 步一键合成，也可以现在手写"
                  className={cn(CELL_INPUT, 'resize-none')}
                />
                <button
                  type="button"
                  onClick={() => onCompose(shot)}
                  className="text-[11px] text-ink-400 transition-colors hover:text-accent-ink"
                >
                  合成本镜
                </button>
              </div>

              <div className="flex items-start justify-end gap-0.5 pt-1">
                <button
                  type="button"
                  aria-label="上移"
                  onClick={() => onReorder(index, Math.max(0, index - 1))}
                  className={cn(
                    'rounded p-1 text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-700',
                    index === 0 && 'pointer-events-none opacity-30',
                  )}
                >
                  <IconChevronDown size={14} className="rotate-180" />
                </button>
                <button
                  type="button"
                  aria-label="下移"
                  onClick={() => onReorder(index, Math.min(shots.length - 1, index + 1))}
                  className={cn(
                    'rounded p-1 text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-700',
                    index === shots.length - 1 && 'pointer-events-none opacity-30',
                  )}
                >
                  <IconChevronDown size={14} />
                </button>
                <button
                  type="button"
                  aria-label="删除镜头"
                  data-testid={`script-shot-delete-${index + 1}`}
                  onClick={() => onRemove(shot.id)}
                  className="rounded p-1 text-ink-400 transition-colors hover:bg-danger/10 hover:text-danger"
                >
                  <IconTrash size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onAdd}
          data-testid="script-add-shot"
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-ink-200 py-2.5 text-[12px] text-ink-500 transition-colors hover:border-ink-300 hover:text-ink-700"
        >
          <IconPlus size={14} />
          添加镜头
        </button>
      </div>
    </div>
  )
}

/**
 * 时长 cell. The keystroke is kept locally and only clamped on blur — clamping
 * on every change makes the field impossible to retype, because an intermediate
 * "1" would immediately snap back to the 5 second floor.
 */
function DurationInput({
  value,
  label,
  onCommit,
}: {
  value: number
  label: string
  onCommit: (value: number) => void
}) {
  const [raw, setRaw] = useState(String(value))
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setRaw(String(value))
  }, [value])

  return (
    <input
      type="number"
      inputMode="numeric"
      min={MIN_SHOT_SECONDS}
      max={MAX_SHOT_SECONDS}
      value={raw}
      aria-label={label}
      onFocus={() => {
        focused.current = true
      }}
      onChange={(event) => {
        setRaw(event.target.value)
        const next = Number(event.target.value)
        if (event.target.value !== '' && next >= MIN_SHOT_SECONDS && next <= MAX_SHOT_SECONDS) {
          onCommit(next)
        }
      }}
      onBlur={() => {
        focused.current = false
        const next = clampDuration(Number(raw))
        setRaw(String(next))
        onCommit(next)
      }}
      className={cn(CELL_INPUT, 'w-14 text-center font-mono')}
    />
  )
}

/* ------------------------------------------------------------------ *
 * Phase 2 — assets
 * ------------------------------------------------------------------ */

function AssetStage({
  draft,
  onChange,
  onReextract,
  onTrackObjectUrl,
}: {
  draft: ScriptDraft
  onChange: (updater: (current: ScriptDraft) => ScriptDraft) => void
  onReextract: () => void
  /** Hands a freshly created object URL to the wizard, which revokes it on unmount. */
  onTrackObjectUrl: (url: string) => void
}) {
  const [tab, setTab] = useState<ScriptAssetKind>('character')
  const [aiForm, setAiForm] = useState<AiAssetForm | null>(null)
  const [canvasPickerOpen, setCanvasPickerOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<ScriptAsset | null>(null)
  const [removalMode, setRemovalMode] = useState<AssetRemovalMode>('keep-text')
  const addMenu = useMenuAnchor()
  const fileRef = useRef<HTMLInputElement>(null)

  const visible = draft.assets.filter((asset) => asset.kind === tab)
  const countOf = (kind: ScriptAssetKind) => draft.assets.filter((asset) => asset.kind === kind).length

  const addAsset = (asset: ScriptAsset) =>
    onChange((current) => syncAssetRefs({ ...current, assets: [...current.assets, asset] }))

  const patchAsset = (assetId: string, patch: Partial<ScriptAsset>) =>
    onChange((current) =>
      syncAssetRefs({
        ...current,
        assets: current.assets.map((asset) => (asset.id === assetId ? { ...asset, ...patch } : asset)),
      }),
    )

  const onUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const url = URL.createObjectURL(file)
    onTrackObjectUrl(url)
    addAsset(
      createAsset({
        name: file.name.replace(/\.[^.]+$/, ''),
        kind: tab,
        source: 'upload',
        referenceUrl: url,
      }),
    )
  }

  return (
    <div className="px-6 py-4">
      <div className="mb-4 flex items-center justify-between gap-4">
        <SegmentedControl
          size="sm"
          value={tab}
          onChange={setTab}
          options={ASSET_KINDS.map((kind) => ({
            value: kind,
            label: `${ASSET_KIND_LABEL[kind]} ${countOf(kind)}`,
            testId: `script-asset-tab-${kind}`,
          }))}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReextract}
            className="flex items-center gap-1.5 rounded-lg bg-ink-100 px-2.5 py-1.5 text-[12px] text-ink-600 transition-colors hover:bg-ink-200"
          >
            <IconRefresh size={13} />
            从镜头重新提取
          </button>
          <button
            type="button"
            data-testid="script-add-asset"
            onClick={(event) => addMenu.openFrom(event, 'below')}
            className="flex items-center gap-1.5 rounded-lg bg-ink-900 px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-85"
          >
            <IconPlus size={13} />
            添加{ASSET_KIND_LABEL[tab]}
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<IconLayers size={30} />}
          title={`还没有${ASSET_KIND_LABEL[tab]}资产`}
          description="资产用来锁住跨镜头的一致性：同一个角色、同一处场景、同一件道具，在每个镜头都长得一样。"
        />
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {visible.map((asset) => {
            const usedBy = draft.shots.filter((shot) => shot.assetRefs.includes(asset.id))
            return (
              <div
                key={asset.id}
                data-testid={`script-asset-${asset.id}`}
                className="overflow-hidden rounded-2xl ring-1 ring-ink-100 transition-shadow hover:shadow-[var(--shadow-float)]"
              >
                <AssetPreview asset={asset} className="h-28 w-full" />
                <div className="space-y-2 p-3">
                  <input
                    value={asset.name}
                    onChange={(event) => patchAsset(asset.id, { name: event.target.value })}
                    aria-label="资产名称"
                    className="w-full rounded-md border border-transparent px-1 py-0.5 text-[13px] font-medium text-ink-900 outline-none transition-colors hover:border-ink-200 focus:border-accent"
                  />
                  <div className="flex items-center gap-1.5 px-1">
                    <span className="rounded bg-ink-100 px-1.5 py-px text-[10px] text-ink-500">
                      {ASSET_SOURCE_LABEL[asset.source]}
                    </span>
                    <span className="text-[10px] text-ink-400">被 {usedBy.length} 个镜头引用</span>
                  </div>
                  <textarea
                    value={asset.description}
                    onChange={(event) => patchAsset(asset.id, { description: event.target.value })}
                    rows={3}
                    aria-label="资产描述"
                    placeholder="外观、材质、光线——这段文字会直接进入最终提示词"
                    className={cn(CELL_INPUT, 'resize-none')}
                  />
                  <div className="flex items-center justify-between pt-0.5">
                    <select
                      value={asset.kind}
                      aria-label="资产类型"
                      onChange={(event) => {
                        const nextKind = event.target.value as ScriptAssetKind
                        patchAsset(asset.id, { kind: nextKind })
                        setTab(nextKind)
                      }}
                      className="cursor-pointer rounded-md bg-ink-50 px-1.5 py-1 text-[11px] text-ink-600 outline-none"
                    >
                      {ASSET_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {ASSET_KIND_LABEL[kind]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      data-testid={`script-asset-delete-${asset.id}`}
                      onClick={() => {
                        setRemovalMode('keep-text')
                        setPendingDelete(asset)
                      }}
                      className="rounded p-1 text-ink-400 transition-colors hover:bg-danger/10 hover:text-danger"
                      aria-label="删除资产"
                    >
                      <IconTrash size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onUpload} />

      {addMenu.anchor && (
        <Menu
          anchor={addMenu.anchor}
          onClose={addMenu.close}
          align="end"
          width={188}
          sections={[
            {
              title: `新增${ASSET_KIND_LABEL[tab]}`,
              items: [
                {
                  id: 'ai',
                  label: 'AI 生成',
                  icon: <IconSparkle size={15} />,
                  onSelect: () => setAiForm(DEFAULT_AI_ASSET_FORM),
                },
                {
                  id: 'canvas',
                  label: '当前画布',
                  icon: <IconImage size={15} />,
                  onSelect: () => setCanvasPickerOpen(true),
                },
                {
                  id: 'upload',
                  label: '本地上传',
                  icon: <IconUpload size={15} />,
                  onSelect: () => fileRef.current?.click(),
                },
              ],
            },
          ]}
        />
      )}

      <AiAssetDialog
        form={aiForm}
        kind={tab}
        onChange={setAiForm}
        onClose={() => setAiForm(null)}
        onConfirm={(form) => {
          addAsset(assetFromAiForm(form, tab))
          setAiForm(null)
        }}
      />

      <CanvasPickerDialog
        open={canvasPickerOpen}
        onClose={() => setCanvasPickerOpen(false)}
        onPick={(asset) => {
          addAsset({ ...asset, kind: tab })
          setCanvasPickerOpen(false)
        }}
      />

      <AssetRemovalDialog
        asset={pendingDelete}
        mode={removalMode}
        onModeChange={setRemovalMode}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) {
            const assetId = pendingDelete.id
            onChange((current) => removeAssetFrom(current, assetId, removalMode))
          }
          setPendingDelete(null)
        }}
      />
    </div>
  )
}

function AiAssetDialog({
  form,
  kind,
  onChange,
  onClose,
  onConfirm,
}: {
  form: AiAssetForm | null
  kind: ScriptAssetKind
  onChange: (form: AiAssetForm) => void
  onClose: () => void
  onConfirm: (form: AiAssetForm) => void
}) {
  if (!form) return null
  const valid = isAiAssetFormValid(form)

  return (
    <Dialog
      open
      onClose={onClose}
      title={`AI 生成${ASSET_KIND_LABEL[kind]}`}
      width={460}
      testId="script-ai-asset-dialog"
    >
      <div className="space-y-4 py-1">
        <Field label="名称" hint="镜头里用 @名称 引用它">
          <input
            value={form.name}
            autoFocus
            data-testid="script-ai-name"
            onChange={(event) => onChange({ ...form, name: event.target.value })}
            placeholder={kind === 'character' ? '林夏' : kind === 'scene' ? '老城区窄巷' : '旧怀表'}
            className="w-full rounded-lg border border-ink-200 px-3 py-2 text-[13px] outline-none transition-colors focus:border-accent"
          />
        </Field>
        <Field label="提示词">
          <textarea
            value={form.prompt}
            rows={4}
            data-testid="script-ai-prompt"
            onChange={(event) => onChange({ ...form, prompt: event.target.value })}
            placeholder="二十五岁短发女性，米色风衣，湿冷夜色下的冷调布光"
            className="w-full resize-none rounded-lg border border-ink-200 px-3 py-2 text-[13px] leading-relaxed outline-none transition-colors focus:border-accent"
          />
        </Field>
        <Field label="画质">
          <SegmentedControl
            size="sm"
            value={form.quality}
            onChange={(quality) => onChange({ ...form, quality })}
            options={[
              { value: 'standard', label: '标准' },
              { value: 'high', label: '高清' },
            ]}
          />
        </Field>
        <Field label="分辨率">
          <div className="flex gap-1.5">
            {AI_RESOLUTIONS.map((resolution) => (
              <button
                key={resolution}
                type="button"
                onClick={() => onChange({ ...form, resolution })}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-[12px] transition-colors',
                  form.resolution === resolution
                    ? 'bg-ink-900 text-white'
                    : 'bg-ink-100 text-ink-600 hover:bg-ink-200',
                )}
              >
                {resolution}
              </button>
            ))}
          </div>
        </Field>
        <Field label="画幅比例">
          <div className="flex flex-wrap gap-1.5">
            {AI_ASPECT_RATIOS.map((aspectRatio) => (
              <button
                key={aspectRatio}
                type="button"
                onClick={() => onChange({ ...form, aspectRatio })}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-[12px] transition-colors',
                  form.aspectRatio === aspectRatio
                    ? 'bg-ink-900 text-white'
                    : 'bg-ink-100 text-ink-600 hover:bg-ink-200',
                )}
              >
                {aspectRatio}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <div className="flex items-center justify-end gap-2 pt-5">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-ink-600 transition-colors hover:bg-ink-50"
        >
          取消
        </button>
        <BlockableButton
          testId="script-ai-confirm"
          blockedReason={valid ? null : '名称和提示词都填写后才能确认'}
          onClick={() => onConfirm(form)}
        >
          确认添加
        </BlockableButton>
      </div>
    </Dialog>
  )
}

function CanvasPickerDialog({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (asset: ScriptAsset) => void
}) {
  const nodes = useEditor((state) => state.document.nodes)

  const candidates = useMemo(
    () =>
      nodes.filter((node) =>
        (['image', 'video', 'director', 'assetLibrary'] as const).includes(
          node.type as 'image' | 'video' | 'director' | 'assetLibrary',
        ),
      ),
    [nodes],
  )

  return (
    <Dialog open={open} onClose={onClose} title="从当前画布选择" width={680} testId="script-canvas-picker">
      {candidates.length === 0 ? (
        <EmptyState
          icon={<IconImage size={30} />}
          title="当前画布还没有可用素材"
          description="先在画布上生成或上传一张图片，它就会出现在这里。"
          compact
        />
      ) : (
        <div className="grid grid-cols-4 gap-3 py-1">
          {candidates.map((node) => {
            const artifact = node.data.artifacts?.[0]
            const preview = artifact?.thumbnailUrl ?? artifact?.url ?? null
            return (
              <button
                key={node.id}
                type="button"
                data-testid={`script-canvas-node-${node.id}`}
                onClick={() =>
                  onPick(
                    createAsset({
                      name: node.name,
                      description: node.data.prompt?.trim() ?? '',
                      source: 'canvas',
                      previewHue: hueFromName(node.name),
                      referenceUrl: preview,
                    }),
                  )
                }
                className="overflow-hidden rounded-xl text-left ring-1 ring-ink-100 transition-shadow hover:shadow-[var(--shadow-float)]"
              >
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="" className="h-24 w-full object-cover" />
                ) : (
                  <div
                    className="h-24 w-full"
                    style={{
                      background: `linear-gradient(148deg, hsl(${hueFromName(node.name)} 55% 68%), hsl(${(hueFromName(node.name) + 40) % 360} 50% 46%))`,
                    }}
                  />
                )}
                <div className="truncate p-2 text-[11px] text-ink-700">{node.name}</div>
              </button>
            )
          })}
        </div>
      )}
    </Dialog>
  )
}

function AssetRemovalDialog({
  asset,
  mode,
  onModeChange,
  onClose,
  onConfirm,
}: {
  asset: ScriptAsset | null
  mode: AssetRemovalMode
  onModeChange: (mode: AssetRemovalMode) => void
  onClose: () => void
  onConfirm: () => void
}) {
  if (!asset) return null

  const options: { value: AssetRemovalMode; title: string; description: string }[] = [
    {
      value: 'keep-text',
      title: '只删除资产',
      description: '镜头文字原样保留，仅解除引用关系。适合误识别出来的资产。',
    },
    {
      value: 'strip-references',
      title: '同时清除镜头里的引用',
      description: `把每个镜头中的 @${asset.name} 一并删掉。适合这个对象已经被从故事里拿掉。`,
    },
  ]

  return (
    <Dialog open onClose={onClose} title={`删除「${asset.name}」`} width={440} testId="script-asset-removal">
      <div className="space-y-2 py-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            data-testid={`script-removal-${option.value}`}
            onClick={() => onModeChange(option.value)}
            className={cn(
              'flex w-full gap-2.5 rounded-xl p-3 text-left transition-colors',
              mode === option.value ? 'bg-accent-soft ring-1 ring-accent' : 'bg-ink-50 hover:bg-ink-100',
            )}
          >
            <span
              className={cn(
                'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                mode === option.value ? 'border-accent bg-accent text-white' : 'border-ink-300',
              )}
            >
              {mode === option.value && <IconCheck size={10} />}
            </span>
            <span>
              <span className="block text-[13px] font-medium text-ink-900">{option.title}</span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-500">
                {option.description}
              </span>
            </span>
          </button>
        ))}
        <p className="px-1 pt-1 text-[11px] leading-relaxed text-ink-400">
          两种方式都会清空受影响镜头的最终提示词，避免已删除的资产继续留在提示词里。
        </p>
      </div>
      <div className="flex items-center justify-end gap-2 pt-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-ink-600 transition-colors hover:bg-ink-50"
        >
          取消
        </button>
        <button
          type="button"
          data-testid="script-removal-confirm"
          onClick={onConfirm}
          className="rounded-lg bg-danger px-3.5 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
        >
          删除
        </button>
      </div>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ *
 * Phase 3 — composed prompts
 * ------------------------------------------------------------------ */

function PromptStage({
  draft,
  onPatch,
  onComposeAll,
}: {
  draft: ScriptDraft
  onPatch: (shotId: string, patch: Partial<Shot>) => void
  onComposeAll: () => void
}) {
  const assetsById = useMemo(
    () => new Map(draft.assets.map((asset) => [asset.id, asset])),
    [draft.assets],
  )
  const missing = draft.shots.filter((shot) => !shot.finalPrompt.trim()).length

  if (draft.shots.length === 0) {
    return (
      <EmptyState
        icon={<IconScript size={30} />}
        title="没有可合成的镜头"
        description="回到第 1 步先建立镜头表。"
      />
    )
  }

  return (
    <div className="px-6 py-4">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="text-[12px] text-ink-400">
          {missing === 0 ? '全部镜头已有最终提示词' : `还有 ${missing} 个镜头没有最终提示词`}
        </div>
        <PrimaryButton onClick={onComposeAll} testId="script-compose-all">
          <IconSparkle size={15} />
          一键合成全部提示词
        </PrimaryButton>
      </div>

      <div className="space-y-3">
        {draft.shots.map((shot) => {
          const refs = shot.assetRefs
            .map((id) => assetsById.get(id))
            .filter((asset): asset is ScriptAsset => Boolean(asset))
          return (
            <div
              key={shot.id}
              data-testid={`script-prompt-row-${shot.index}`}
              className="grid grid-cols-[300px_1fr] gap-4 rounded-2xl p-3.5 ring-1 ring-ink-100"
            >
              <div className="min-w-0 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-ink-900 px-1.5 font-mono text-[11px] text-white">
                    {shot.index}
                  </span>
                  <span className="text-[11px] text-ink-400">
                    {shot.shotSize} · {clampDuration(shot.durationSeconds)} 秒
                    {shot.cameraMove ? ` · ${shot.cameraMove}` : ''}
                  </span>
                </div>
                <p className="line-clamp-3 text-[12px] leading-relaxed text-ink-600">
                  {shot.description || <span className="text-ink-300">（这一镜还没有画面描述）</span>}
                </p>
                {refs.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {refs.map((asset) => (
                      <Chip key={asset.id} tone="accent">
                        {ASSET_KIND_LABEL[asset.kind]}·{asset.name}
                      </Chip>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <textarea
                  value={shot.finalPrompt}
                  onChange={(event) => onPatch(shot.id, { finalPrompt: event.target.value })}
                  rows={4}
                  aria-label={`第 ${shot.index} 镜最终提示词`}
                  placeholder="点击「一键合成全部提示词」，或在这里手写"
                  className={cn(
                    CELL_INPUT,
                    'resize-none text-[12.5px] leading-relaxed',
                    !shot.finalPrompt.trim() && 'border-dashed',
                  )}
                />
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-ink-400">
                    {shot.finalPrompt.trim() ? `${shot.finalPrompt.trim().length} 字` : '尚未合成'}
                  </span>
                  <button
                    type="button"
                    data-testid={`script-compose-${shot.index}`}
                    onClick={() => onPatch(shot.id, { finalPrompt: composePrompt(shot, draft.assets) })}
                    className="flex items-center gap-1 rounded-lg bg-ink-100 px-2 py-1 text-[11px] text-ink-600 transition-colors hover:bg-ink-200"
                  >
                    <IconRefresh size={12} />
                    重新合成本镜
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
