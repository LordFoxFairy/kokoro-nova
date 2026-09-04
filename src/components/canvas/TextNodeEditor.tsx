'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useStore as useFlowStore } from '@xyflow/react'
import { MODELS_BY_ID, quoteCredits, textModelOutputOptions, type ModelDefinition } from '@/domain/models'
import {
  normalizeTextAuthoringState,
  readTextAuthoringState,
  textDocumentPlainText,
  type TextAuthoringState,
  type TextBackground,
  type TextBlock,
  type TextBlockKind,
  type TextMark,
} from '@/domain/text-authoring'
import { newId } from '@/domain/ids'
import { MEDIA_OF_NODE } from '@/domain/nodes'
import { canvasReferenceLabel, orderedCanvasReferences } from '@/domain/video-references'
import type { GenerationJob, NodeData, WorkflowNode } from '@/domain/types'
import { cn } from '@/lib/cn'
import { useEditor } from '@/lib/editor-store'
import { TextModelCatalog, TextModelMark } from '../text/TextModelCatalog'
import {
  IconClose,
  IconCredit,
  IconImage,
  IconLink,
  IconPlay,
  IconStop,
  IconText,
} from '../icons'
import { ProgressBar, Spinner } from '../ui/controls'

interface TextNodeEditorProps {
  node: WorkflowNode
  job: GenerationJob | null
  onRun: (nodeId: string) => void
  onCancel: (jobId: string) => void
  selectionMode: 'reference' | 'element' | null
  onStartSelection: (kind: 'reference' | 'element', targetNodeId: string) => void
  onExitSelection: () => void
  onRemoveReference: (targetNodeId: string, sourceNodeId: string) => void
  onLocateReference: (nodeId: string) => void
}

const GENERATOR_PLACEHOLDER =
  '写下你想讲的故事、场景或角色设定。例如：一个来自未来的机器人，在城市屋顶看星星。'

const BACKGROUNDS: Array<{ id: TextBackground; label: string; color: string }> = [
  { id: 'charcoal', label: '炭黑', color: '#242424' },
  { id: 'slate', label: '深灰', color: '#31343b' },
  { id: 'indigo', label: '靛蓝', color: '#293149' },
  { id: 'paper', label: '纸张', color: '#eee9dd' },
  { id: 'sand', label: '沙色', color: '#d8c6a6' },
]

const DOCUMENT_SURFACE: Record<TextBackground, CSSProperties> = {
  charcoal: { backgroundColor: '#242424', color: 'rgba(255,255,255,.86)' },
  slate: { backgroundColor: '#31343b', color: 'rgba(255,255,255,.88)' },
  indigo: { backgroundColor: '#293149', color: 'rgba(255,255,255,.9)' },
  paper: { backgroundColor: '#eee9dd', color: '#28251f' },
  sand: { backgroundColor: '#d8c6a6', color: '#30291f' },
}

function blockClass(block: TextBlock): string {
  return cn(
    'min-h-[1.55em] w-full rounded px-1 outline-none empty:before:content-[attr(data-placeholder)] empty:before:opacity-35',
    block.kind === 'heading-1' && 'text-[22px] font-semibold leading-tight',
    block.kind === 'heading-2' && 'text-[18px] font-semibold leading-tight',
    block.kind === 'heading-3' && 'text-[15px] font-semibold leading-snug',
    block.kind === 'paragraph' && 'text-[12px] leading-relaxed',
    block.kind === 'bullet-list' && 'ml-4 list-item list-disc text-[12px] leading-relaxed',
    block.kind === 'ordered-list' && 'ml-4 list-item list-decimal text-[12px] leading-relaxed',
    block.marks.includes('bold') && 'font-bold',
    block.marks.includes('italic') && 'italic',
  )
}

function RichDocumentSurface({
  state,
  activeBlockId,
  onActiveBlock,
  onChange,
  onCommit,
  testId,
  expanded = false,
}: {
  state: TextAuthoringState
  activeBlockId: string
  onActiveBlock: (id: string) => void
  onChange: (state: TextAuthoringState) => void
  onCommit: (state: TextAuthoringState) => void
  testId: string
  expanded?: boolean
}) {
  const dirty = useRef(false)
  const refs = useRef(new Map<string, HTMLDivElement>())

  const updateText = (id: string, text: string) => {
    dirty.current = true
    onChange({
      ...state,
      document: {
        ...state.document,
        blocks: state.document.blocks.map((block) => (block.id === id ? { ...block, text } : block)),
      },
    })
  }

  const splitBlock = (block: TextBlock) => {
    const index = state.document.blocks.findIndex((item) => item.id === block.id)
    const id = newId('text-block')
    const nextBlocks = [...state.document.blocks]
    nextBlocks.splice(index + 1, 0, { id, kind: 'paragraph', text: '', marks: [] })
    const next = { ...state, document: { ...state.document, blocks: nextBlocks } }
    dirty.current = false
    onChange(next)
    onCommit(next)
    onActiveBlock(id)
    window.requestAnimationFrame(() => refs.current.get(id)?.focus())
  }

  return (
    <div
      data-testid={testId}
      data-background={state.document.background}
      className={cn(
        'thin-scrollbar overflow-y-auto rounded-2xl ring-1 ring-white/10',
        expanded ? 'h-full px-10 py-9' : 'h-full px-4 py-4',
      )}
      style={DOCUMENT_SURFACE[state.document.background]}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <div className={cn('mx-auto flex min-h-full flex-col gap-1', expanded && 'max-w-[820px]')}>
        {state.document.blocks.map((block, index) =>
          block.kind === 'divider' ? (
            <button
              key={block.id}
              type="button"
              aria-label={`选择分割线 ${index + 1}`}
              onClick={() => onActiveBlock(block.id)}
              className={cn(
                'my-2 h-px w-full bg-current opacity-20 outline-none',
                activeBlockId === block.id && 'ring-1 ring-[#6d9eff] ring-offset-2 ring-offset-transparent',
              )}
            />
          ) : (
            <div
              key={block.id}
              ref={(element) => {
                if (element) refs.current.set(block.id, element)
                else refs.current.delete(block.id)
              }}
              role="textbox"
              aria-label={`文本块 ${index + 1}`}
              aria-multiline="false"
              contentEditable
              suppressContentEditableWarning
              spellCheck={false}
              data-placeholder={index === 0 ? '输入内容…' : ''}
              className={cn(blockClass(block), activeBlockId === block.id && 'bg-white/[0.035]')}
              onFocus={() => onActiveBlock(block.id)}
              onInput={(event) => updateText(block.id, event.currentTarget.textContent ?? '')}
              onPaste={(event) => {
                event.preventDefault()
                const text = event.clipboardData.getData('text/plain')
                globalThis.document.execCommand('insertText', false, text)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  splitBlock(block)
                }
              }}
              onBlur={() => {
                if (!dirty.current) return
                dirty.current = false
                onCommit(state)
              }}
            >
              {block.text}
            </div>
          ),
        )}
      </div>
    </div>
  )
}

function DocumentToolbar({
  state,
  activeBlockId,
  onState,
  onCopy,
  onExpand,
  testId,
}: {
  state: TextAuthoringState
  activeBlockId: string
  onState: (next: TextAuthoringState) => void
  onCopy: () => void
  onExpand: () => void
  testId: string
}) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const active = state.document.blocks.find((block) => block.id === activeBlockId) ?? state.document.blocks[0]

  const updateActive = (producer: (block: TextBlock) => TextBlock) => {
    if (!active) return
    onState({
      ...state,
      document: {
        ...state.document,
        blocks: state.document.blocks.map((block) => (block.id === active.id ? producer(block) : block)),
      },
    })
  }

  const setKind = (kind: TextBlockKind) => updateActive((block) => ({ ...block, kind }))
  const toggleMark = (mark: TextMark) => updateActive((block) => ({
    ...block,
    marks: block.marks.includes(mark) ? block.marks.filter((item) => item !== mark) : [...block.marks, mark],
  }))
  const addDivider = () => {
    const index = Math.max(0, state.document.blocks.findIndex((block) => block.id === active?.id))
    const blocks = [...state.document.blocks]
    blocks.splice(index + 1, 0, { id: newId('text-block'), kind: 'divider', text: '', marks: [] })
    onState({ ...state, document: { ...state.document, blocks } })
  }

  const button = 'h-8 shrink-0 rounded-lg px-2 text-[11px] text-white/72 hover:bg-white/10 hover:text-white'
  return (
    <div
      data-testid={testId}
      className="relative flex items-center gap-0.5 rounded-xl border border-white/10 bg-[#292929] p-1.5 shadow-[0_12px_35px_rgba(0,0,0,0.5)]"
      onMouseDown={(event) => event.preventDefault()}
    >
      <button type="button" className={button} onClick={() => setPaletteOpen((open) => !open)}>背景色</button>
      <span className="mx-0.5 h-5 w-px bg-white/10" />
      <button type="button" className={cn(button, active?.kind === 'heading-1' && 'bg-white/12 text-white')} onClick={() => setKind('heading-1')}>标题 1</button>
      <button type="button" className={cn(button, active?.kind === 'heading-2' && 'bg-white/12 text-white')} onClick={() => setKind('heading-2')}>标题 2</button>
      <button type="button" className={cn(button, active?.kind === 'heading-3' && 'bg-white/12 text-white')} onClick={() => setKind('heading-3')}>标题 3</button>
      <button type="button" className={cn(button, active?.kind === 'paragraph' && 'bg-white/12 text-white')} onClick={() => setKind('paragraph')}>正文</button>
      <span className="mx-0.5 h-5 w-px bg-white/10" />
      <button type="button" aria-pressed={active?.marks.includes('bold')} className={cn(button, active?.marks.includes('bold') && 'bg-white/12 text-white')} onClick={() => toggleMark('bold')}>粗体</button>
      <button type="button" aria-pressed={active?.marks.includes('italic')} className={cn(button, active?.marks.includes('italic') && 'bg-white/12 text-white')} onClick={() => toggleMark('italic')}>斜体</button>
      <button type="button" className={cn(button, active?.kind === 'bullet-list' && 'bg-white/12 text-white')} onClick={() => setKind('bullet-list')}>无序列表</button>
      <button type="button" className={cn(button, active?.kind === 'ordered-list' && 'bg-white/12 text-white')} onClick={() => setKind('ordered-list')}>有序列表</button>
      <button type="button" className={button} onClick={addDivider}>分割线</button>
      <span className="mx-0.5 h-5 w-px bg-white/10" />
      <button type="button" className={button} onClick={onCopy}>复制内容</button>
      <button type="button" className={button} onClick={onExpand}>展开编辑</button>

      {paletteOpen && (
        <div
          data-testid="text-background-popover"
          className="absolute left-0 top-11 z-50 flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#292929] p-2 shadow-[0_14px_35px_rgba(0,0,0,.5)]"
        >
          {BACKGROUNDS.map((background) => (
            <button
              key={background.id}
              type="button"
              aria-label={background.label}
              title={background.label}
              onClick={() => {
                setPaletteOpen(false)
                onState({
                  ...state,
                  document: { ...state.document, background: background.id },
                })
              }}
              className={cn(
                'h-7 w-7 rounded-full ring-1 ring-white/20',
                state.document.background === background.id && 'ring-2 ring-[#77a6ff] ring-offset-2 ring-offset-[#292929]',
              )}
              style={{ backgroundColor: background.color }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** Node-attached Text generator and rich-document editor. */
export function TextNodeEditor({
  node,
  job,
  onRun,
  onCancel,
  selectionMode,
  onStartSelection,
  onExitSelection,
  onRemoveReference,
  onLocateReference,
}: TextNodeEditorProps) {
  const zoom = useFlowStore((state) => state.transform[2])
  const commitWith = useEditor((state) => state.commitWith)
  const inspect = useEditor((state) => state.inspect)
  const toast = useEditor((state) => state.toast)
  const document = useEditor((state) => state.document)
  const persistedAuthoring = readTextAuthoringState(node.data.extra)
  const [authoring, setAuthoring] = useState<TextAuthoringState>(persistedAuthoring)
  const [prompt, setPrompt] = useState(node.data.prompt ?? '')
  const [modelsOpen, setModelsOpen] = useState(false)
  const [activeBlockId, setActiveBlockId] = useState(persistedAuthoring.document.blocks[0]?.id ?? 'block-1')
  const skipNextPromptBlur = useRef(false)
  const modelId = node.data.modelId ?? 'gvlm-3.1'
  const model = MODELS_BY_ID.get(modelId)
  const capabilities = textModelOutputOptions(modelId)
  const references = useMemo(() => orderedCanvasReferences(document, node.id), [document, node.id])
  const running = job?.status === 'running' || job?.status === 'queued'
  const artifact = node.data.artifacts?.find((item) => item.kind === 'text') ?? null
  const canRun = prompt.trim().length > 0 || references.some(({ node: source }) => {
    const media = source.type === 'assetLibrary'
      ? (source.data.extra?.assetKind as 'image' | 'video' | 'audio' | undefined)
      : MEDIA_OF_NODE[source.type]
    if (media === 'image') {
      return source.data.artifacts?.some((item) => item.kind === 'image') ?? false
    }
    if (media !== 'text') return false
    if (source.type === 'text') {
      const sourceAuthoring = readTextAuthoringState(source.data.extra)
      return (
        sourceAuthoring.mode === 'document'
          ? textDocumentPlainText(sourceAuthoring)
          : (source.data.prompt ?? '')
      ).trim().length > 0
    }
    return (source.data.prompt ?? '').trim().length > 0
  })

  const patchNode = (
    patchOrProducer: Partial<NodeData> | ((current: NodeData) => Partial<NodeData>),
    label = '编辑文本节点',
  ) => {
    return commitWith((currentDocument) => {
      const current = currentDocument.nodes.find((item) => item.id === node.id)
      if (!current) return []
      const patch = typeof patchOrProducer === 'function' ? patchOrProducer(current.data) : patchOrProducer
      return [{
        op: 'updateNode',
        nodeId: current.id,
        patch: {
          data: {
            ...current.data,
            ...patch,
            ...(patch.extra ? { extra: { ...current.data.extra, ...patch.extra } } : {}),
          },
        },
      }]
    }, label)
  }

  const persistAuthoring = (nextValue: TextAuthoringState, label = '编辑文本内容') => {
    const next = normalizeTextAuthoringState(nextValue)
    setAuthoring(next)
    void patchNode({ extra: { textAuthoring: next, intent: next.intent } }, label)
  }

  const copyDocument = () => {
    const text = textDocumentPlainText(authoring)
    void navigator.clipboard?.writeText(text).catch(() => undefined)
    toast('文本内容已复制', 'success')
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      if (modelsOpen) {
        setModelsOpen(false)
        return
      }
      if (authoring.expanded) {
        persistAuthoring({ ...authoring, expanded: false }, '收起文本编辑')
        return
      }
      if (selectionMode) {
        onExitSelection()
        return
      }
      inspect(null)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
    // `persistAuthoring` intentionally resolves the current store node itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authoring, inspect, modelsOpen, onExitSelection, selectionMode])

  if (authoring.mode === 'document') {
    const applyState = (next: TextAuthoringState) => persistAuthoring(next)
    return (
      <>
        <div
          data-testid="text-document-editor"
          data-background={authoring.document.background}
          className="node-floating-ui nodrag nowheel nopan absolute left-0 top-[27px] z-20"
          style={{ width: node.size.width, height: node.size.height }}
        >
          <div
            className="absolute bottom-full left-0 z-30 mb-2 origin-bottom-left"
            style={{ transform: `scale(${1 / Math.max(zoom, 0.01)})` }}
          >
            <DocumentToolbar
              testId="text-document-toolbar"
              state={authoring}
              activeBlockId={activeBlockId}
              onState={applyState}
              onCopy={copyDocument}
              onExpand={() => persistAuthoring({ ...authoring, expanded: true }, '展开文本编辑')}
            />
          </div>
          <RichDocumentSurface
            state={authoring}
            activeBlockId={activeBlockId}
            onActiveBlock={setActiveBlockId}
            onChange={setAuthoring}
            onCommit={persistAuthoring}
            testId="text-document-surface"
          />
        </div>

        {authoring.expanded && typeof window !== 'undefined' && createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="展开文本编辑"
            data-testid="text-expanded-editor"
            className="fixed inset-0 z-[120] flex flex-col bg-[#171717]/96 px-10 py-8 backdrop-blur-xl"
          >
            <header className="mx-auto mb-4 flex w-full max-w-[1120px] items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/7 text-white/75"><IconText size={17} /></span>
              <div>
                <h2 className="text-[15px] font-medium text-white/90">{node.name}</h2>
                <p className="text-[11px] text-white/40">本地富文本文档 · 自动保存</p>
              </div>
              <button
                type="button"
                aria-label="关闭展开文本编辑"
                onClick={() => persistAuthoring({ ...authoring, expanded: false }, '收起文本编辑')}
                className="ml-auto flex h-9 w-9 items-center justify-center rounded-xl text-white/50 hover:bg-white/8 hover:text-white"
              >
                <IconClose size={17} />
              </button>
            </header>
            <div className="mx-auto mb-3 w-full max-w-[1120px] overflow-x-auto pb-1">
              <DocumentToolbar
                testId="text-expanded-toolbar"
                state={authoring}
                activeBlockId={activeBlockId}
                onState={applyState}
                onCopy={copyDocument}
                onExpand={() => undefined}
              />
            </div>
            <div className="mx-auto min-h-0 w-full max-w-[1120px] flex-1">
              <RichDocumentSurface
                state={authoring}
                activeBlockId={activeBlockId}
                onActiveBlock={setActiveBlockId}
                onChange={setAuthoring}
                onCommit={persistAuthoring}
                testId="text-expanded-surface"
                expanded
              />
            </div>
          </div>,
          globalThis.document.body,
        )}
      </>
    )
  }

  const selectModel = (next: ModelDefinition) => {
    void patchNode({ modelId: next.id }, '选择文本模型')
    setModelsOpen(false)
  }

  const runWithCurrentPrompt = async () => {
    if (prompt !== (node.data.prompt ?? '')) {
      const persisted = await patchNode({ prompt }, '编辑文本提示词')
      if (!persisted) return
    }
    onRun(node.id)
  }

  return (
    <div
      data-testid="text-node-editor"
      data-zoom-compensation={(1 / Math.max(zoom, 0.01)).toFixed(5)}
      className="node-floating-ui nodrag nowheel nopan absolute bottom-14 left-1/2 z-30 w-[660px] -translate-x-1/2 translate-y-full origin-top"
      style={{ transform: `scale(${1 / Math.max(zoom, 0.01)})` }}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <section className="relative flex min-h-[244px] w-full flex-col rounded-2xl border border-white/10 bg-[#242424] shadow-[0_14px_45px_rgba(0,0,0,0.45)]">
        <div className="flex items-center gap-1.5 px-3 pt-3">
          <button
            type="button"
            aria-pressed={selectionMode === 'reference'}
            onClick={() => onStartSelection('reference', node.id)}
            className={cn(
              'flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] text-ink-500 hover:bg-white/8 hover:text-ink-800',
              selectionMode === 'reference' && 'bg-[#1769e8]/24 text-[#8db8ff]',
            )}
          >
            <IconLink size={13} />参考图
          </button>
          <button
            type="button"
            aria-label="关闭文本编辑器"
            onClick={() => inspect(null)}
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-ink-400 hover:bg-white/8 hover:text-ink-800"
          >
            <IconClose size={15} />
          </button>
        </div>

        {references.length > 0 && (
          <div data-testid="text-reference-strip" className="flex min-h-12 items-center gap-1.5 overflow-x-auto px-3 pt-1">
            {references.map(({ node: reference }, index) => {
              const label = canvasReferenceLabel(reference, index)
              const image = reference.data.artifacts?.[0]?.thumbnailUrl ?? reference.data.artifacts?.[0]?.url
              return (
                <div key={reference.id} className="group/reference relative flex h-10 min-w-[118px] items-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-2 pr-7">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-black/20 text-ink-500">
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image} alt="" className="h-full w-full object-cover" />
                    ) : reference.type === 'image' ? <IconImage size={13} /> : <IconText size={13} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[10px] text-ink-700">{label}</span>
                  <button type="button" aria-label={`定位参考 ${reference.name}`} onClick={() => onLocateReference(reference.id)} className="absolute bottom-0.5 right-0.5 h-4 w-4 rounded bg-black/45 text-[9px] text-white opacity-0 group-hover/reference:opacity-100">↗</button>
                  <button type="button" aria-label={`移除参考 ${reference.name}`} onClick={() => onRemoveReference(node.id, reference.id)} className="absolute right-0.5 top-0.5 h-4 w-4 rounded bg-black/45 text-[11px] text-white opacity-0 group-hover/reference:opacity-100">×</button>
                </div>
              )
            })}
          </div>
        )}

        <textarea
          data-testid="text-prompt"
          value={prompt}
          maxLength={capabilities?.maxCharacters ?? 20_000}
          rows={6}
          placeholder={GENERATOR_PLACEHOLDER}
          onChange={(event) => setPrompt(event.target.value)}
          onBlur={() => {
            if (skipNextPromptBlur.current) {
              skipNextPromptBlur.current = false
              return
            }
            if (prompt !== (node.data.prompt ?? '')) void patchNode({ prompt })
          }}
          className="mx-3 min-h-[118px] flex-1 resize-none bg-transparent px-1 py-2 text-[13px] leading-relaxed text-ink-800 outline-none placeholder:text-ink-400"
        />

        {artifact?.textContent && (
          <div data-testid="text-result" className="mx-3 mb-2 max-h-28 overflow-y-auto rounded-xl border border-white/8 bg-black/15 p-3 text-[11px] leading-relaxed whitespace-pre-wrap text-ink-700">
            {artifact.textContent}
          </div>
        )}

        <div className="relative flex h-12 items-center gap-1 border-t border-white/[0.06] px-3">
          <button
            type="button"
            data-testid="text-model-selector"
            aria-haspopup="dialog"
            aria-expanded={modelsOpen}
            onClick={() => setModelsOpen((open) => !open)}
            className="flex h-8 min-w-[150px] items-center gap-2 rounded-lg px-2 text-[12px] text-ink-800 hover:bg-white/8"
          >
            <TextModelMark label={model?.label} />
            <span className="truncate font-medium">{model?.label ?? '选择模型'}</span>
            <span className="text-[10px] text-ink-400">⌄</span>
          </button>
          <button
            type="button"
            data-testid="text-translate"
            aria-label="中英翻译"
            aria-pressed={authoring.translationEnabled}
            title="中英翻译"
            disabled={!capabilities?.supportsTranslation}
            onClick={() => persistAuthoring({ ...authoring, translationEnabled: !authoring.translationEnabled }, '切换文本翻译')}
            className={cn(
              'flex h-8 items-center gap-0.5 rounded-lg px-2 text-[11px] hover:bg-white/8',
              authoring.translationEnabled ? 'bg-[#1769e8]/20 text-[#8db8ff]' : 'text-ink-500',
            )}
          >
            <span>中</span><span className="text-[9px] opacity-55">/</span><span>A</span>
          </button>

          {modelsOpen && (
            <TextModelCatalog selectedId={modelId} onSelect={selectModel} onClose={() => setModelsOpen(false)} />
          )}

          {running ? (
            <div className="ml-auto flex items-center gap-2 text-[11px] text-ink-500">
              <Spinner size={13} />
              <span>{job?.progress ?? 0}%</span>
              <div className="w-20"><ProgressBar value={job?.progress ?? 0} /></div>
              <button type="button" aria-label="取消文本生成" onClick={() => job && onCancel(job.id)} className="rounded-full p-1.5 text-ink-400 hover:bg-white/8 hover:text-danger"><IconStop size={13} /></button>
            </div>
          ) : (
            <>
              <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-ink-500">
                <IconCredit size={12} /><span data-testid="text-credit">{quoteCredits(modelId, node.data.output).credits}</span>
              </span>
              <button
                type="button"
                data-testid="text-run"
                aria-label="生成文本"
                disabled={!canRun}
                onPointerDown={() => {
                  skipNextPromptBlur.current = globalThis.document.activeElement?.getAttribute('data-testid') === 'text-prompt'
                }}
                onClick={() => void runWithCurrentPrompt()}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f3f3f3] text-[#202020] transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-25"
              >
                <IconPlay size={13} />
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  )
}

/** Read-only card projection used when the document editor is closed. */
export function TextDocumentPreview({ node }: { node: WorkflowNode }) {
  const state = readTextAuthoringState(node.data.extra)
  const visible = state.document.blocks.filter((block) => block.kind !== 'divider' && block.text.trim())
  if (visible.length === 0) {
    return <p className="flex h-full items-center justify-center text-[12px] text-ink-400">请编写内容，开始你的创作。</p>
  }
  return (
    <div className="h-full overflow-hidden rounded-xl px-2 py-1" style={DOCUMENT_SURFACE[state.document.background]}>
      {visible.slice(0, 8).map((block) => (
        <div key={block.id} className={blockClass(block)}>{block.text}</div>
      ))}
    </div>
  )
}
