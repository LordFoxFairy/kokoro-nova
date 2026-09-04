'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MODELS_BY_ID, modelsFor } from '@/domain/models'
import { SKILL_CATALOGUE } from '@/domain/skills'
import type {
  AgentContextChip,
  AgentMessage,
  AgentSession,
} from '@/domain/types'
import { agentApi } from '@/api/agent'
import { cn } from '@/lib/cn'
import { useEditor } from '@/lib/editor-store'
import { Menu, useMenuAnchor, type MenuSection } from '../ui/Menu'
import { Chip, EmptyState, SegmentedControl, Spinner } from '../ui/controls'
import {
  IconAt,
  IconAttachment,
  IconChevronDown,
  IconClose,
  IconHistory,
  IconPlus,
  IconRefresh,
  IconSend,
  IconShare,
  IconSkill,
  IconSparkle,
  IconTrash,
  IconWarning,
} from '../icons'
import { NODE_ICON } from '../canvas/node-visuals'

export type AgentRunState = 'idle' | 'running' | 'success' | 'error'

export function agentRunStateLabel(state: AgentRunState): string {
  if (state === 'running') return '运行中'
  if (state === 'success') return '已完成'
  if (state === 'error') return '需要重试'
  return '就绪'
}

export function shouldSubmitAgentKey(input: { key: string; shiftKey?: boolean }): boolean {
  return input.key === 'Enter' && !input.shiftKey
}

export function mergeAgentMessages(current: readonly AgentMessage[], incoming: readonly AgentMessage[]): AgentMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]))
  for (const message of incoming) byId.set(message.id, message)
  return [...byId.values()].sort((a, b) => a.seq - b.seq || a.id.localeCompare(b.id))
}

type AgentOperation =
  | { kind: 'send'; text: string; context: AgentContextChip[] }
  | {
      kind: 'resolve'
      messageId: string
      action: 'answer' | 'apply' | 'reject' | 'ignore'
      answer?: string
    }

/**
 * Agent side panel.
 *
 * Protocol rules made visible in the UI:
 *  - canvas selection becomes a locatable context chip, it does not silently
 *    stuff the prompt;
 *  - a mutation proposal is never auto-applied in 手动 mode — it renders a
 *    confirm card with 应用 / 取消;
 *  - running out of free turns produces an explicit gate rather than an error.
 */
export function AgentPanel() {
  const open = useEditor((s) => s.agentOpen)
  const setOpen = useEditor((s) => s.setAgentOpen)
  const projectId = useEditor((s) => s.projectId)
  const canvasId = useEditor((s) => s.canvasId)
  const document = useEditor((s) => s.document)
  const pendingRefs = useEditor((s) => s.pendingAgentRefs)
  const clearAgentRefs = useEditor((s) => s.clearAgentRefs)
  const applyServerDocument = useEditor((s) => s.applyServerDocument)
  const toast = useEditor((s) => s.toast)

  const [session, setSession] = useState<AgentSession | null>(null)
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [draft, setDraft] = useState('')
  const [chips, setChips] = useState<AgentContextChip[]>([])
  const [sending, setSending] = useState(false)
  const [runState, setRunState] = useState<AgentRunState>('idle')
  const [runError, setRunError] = useState<string | null>(null)
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [sessionsError, setSessionsError] = useState<string | null>(null)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  const modelMenu = useMenuAnchor()
  const skillMenu = useMenuAnchor()
  const mentionMenu = useMenuAnchor()
  const scrollRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const lastOperation = useRef<AgentOperation | null>(null)

  const ensureSession = useCallback(async (): Promise<AgentSession | null> => {
    if (session) return session
    if (!projectId) return null
    const created = await agentApi.create({ projectId, canvasId })
    setSession(created)
    setSessions((prev) => [created, ...prev.filter((item) => item.id !== created.id)])
    return created
  }, [session, projectId, canvasId])

  // Canvas selection → context chips.
  useEffect(() => {
    if (pendingRefs.length === 0) return
    setChips((prev) => {
      const next = [...prev]
      for (const ref of pendingRefs) {
        if (next.some((c) => c.refId === ref.id)) continue
        next.push({ id: `chip-${ref.id}`, kind: ref.kind, refId: ref.id, label: ref.label })
      }
      return next
    })
    clearAgentRefs()
  }, [pendingRefs, clearAgentRefs])

  const loadSessions = useCallback(async () => {
    if (!projectId) return
    setSessionsLoading(true)
    setSessionsError(null)
    try {
      const result = await agentApi.list(projectId)
      setSessions(result.sessions)
    } catch (error) {
      lastOperation.current = null
      setSessionsError(error instanceof Error ? error.message : '历史会话加载失败')
    } finally {
      setSessionsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (!open || !projectId) return
    void loadSessions()
  }, [open, projectId, loadSessions])

  useEffect(() => {
    if (open) return
    setHistoryOpen(false)
    setRunState('idle')
    setRunError(null)
    setResolvingId(null)
  }, [open])

  // This side panel is not a Dialog, so give it the same predictable Escape
  // affordance while allowing the floating Menu component to consume Escape
  // first in its capture-phase listener.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Menus and modal sheets own Escape. Without the dialog guard a
        // simultaneously open Director/Asset sheet could close underneath the
        // agent panel as well, leaving the focus stack in an unexpected state.
        if (window.document.querySelector('[data-testid="menu"], [role="dialog"]')) return
        event.preventDefault()
        setOpen(false)
        return
      }
      if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const target = event.target as HTMLElement | null
        if (
          target?.tagName === 'INPUT' ||
          target?.tagName === 'TEXTAREA' ||
          target?.isContentEditable ||
          window.document.querySelector('[role="dialog"]')
        ) return
        event.preventDefault()
        composerRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, setOpen])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const send = async (operation?: Extract<AgentOperation, { kind: 'send' }>) => {
    const text = (operation?.text ?? draft).trim()
    const context = operation?.context ?? chips
    if (!text || sending) return
    lastOperation.current = { kind: 'send', text, context: context.map((chip) => ({ ...chip })) }
    setSending(true)
    setRunState('running')
    setRunError(null)
    try {
      const active = await ensureSession()
      if (!active) throw new Error('当前没有绑定项目或画布')
      const result = await agentApi.send(active.id, { text, context })
      setSession(result.session)
      setMessages((prev) => mergeAgentMessages(prev, result.messages))
      setDraft('')
      setChips([])
      setRunState('success')
      lastOperation.current = null
    } catch (error) {
      const message = error instanceof Error ? error.message : '发送失败'
      setRunState('error')
      setRunError(message)
      toast(message, 'error')
    } finally {
      setSending(false)
    }
  }

  const resolve = async (
    messageId: string,
    action: 'answer' | 'apply' | 'reject' | 'ignore',
    answer?: string,
  ) => {
    if (!session || resolvingId) return
    lastOperation.current = { kind: 'resolve', messageId, action, answer }
    setResolvingId(messageId)
    setRunState('running')
    setRunError(null)
    try {
      const result = await agentApi.resolve(session.id, { messageId, action, answer })

      setSession(result.session)
      setMessages((prev) => mergeAgentMessages(prev, result.messages))
      if (result.document && typeof result.revision === 'number') {
        applyServerDocument(result.document, result.revision)
        toast('已应用到画布', 'success')
      }
      setRunState('success')
      lastOperation.current = null
    } catch (error) {
      const message = error instanceof Error ? error.message : '操作失败'
      setRunState('error')
      setRunError(message)
      toast(message, 'error')
    } finally {
      setResolvingId(null)
    }
  }

  const retryOperation = () => {
    const operation = lastOperation.current
    if (!operation) return
    if (operation.kind === 'send') {
      void send(operation)
      return
    }
    void resolve(operation.messageId, operation.action, operation.answer)
  }

  const updateSessionSettings = async (patch: {
    generationMode?: AgentSession['settings']['generationMode']
    modelId?: string
  }) => {
    try {
      const active = await ensureSession()
      if (!active) throw new Error('当前没有绑定项目或画布')
      const updated = await agentApi.update(active.id, patch)
      setSession(updated)
      setSessions((prev) => [updated, ...prev.filter((item) => item.id !== updated.id)])
    } catch (error) {
      const message = error instanceof Error ? error.message : '会话设置保存失败'
      lastOperation.current = null
      setRunState('error')
      setRunError(message)
      toast(message, 'error')
    }
  }

  const mentionSections: MenuSection[] = useMemo(
    () => [
      {
        title: '画布节点',
        items: document.nodes.map((node) => ({
          id: node.id,
          label: node.name,
          onSelect: () =>
            setChips((prev) =>
              prev.some((c) => c.refId === node.id)
                ? prev
                : [...prev, { id: `chip-${node.id}`, kind: 'node', refId: node.id, label: node.name }],
            ),
        })),
      },
      {
        title: '模型',
        items: [...modelsFor('image'), ...modelsFor('video')].map((model) => ({
          id: model.id,
          label: model.label,
          onSelect: () =>
            setChips((prev) =>
              prev.some((c) => c.refId === model.id)
                ? prev
                : [...prev, { id: `chip-${model.id}`, kind: 'model', refId: model.id, label: model.label }],
            ),
        })),
      },
    ],
    [document.nodes],
  )

  if (!open) return null

  return (
    <aside
      data-testid="agent-panel"
      className="relative z-30 flex h-full w-[340px] shrink-0 flex-col border-l border-ink-100 bg-surface"
    >
      <header className="flex items-center gap-1 px-3 pb-2 pt-3.5">
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink-900">
          {session?.title ?? '新会话'}
        </span>
        <span
          data-testid="agent-run-status"
          data-state={runState}
          aria-live="polite"
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px]',
            runState === 'running'
              ? 'bg-running/10 text-running'
              : runState === 'error'
                ? 'bg-danger/10 text-danger'
                : runState === 'success'
                  ? 'bg-success/10 text-success'
                  : 'bg-ink-100 text-ink-500',
          )}
        >
          {agentRunStateLabel(runState)}
        </span>
        <IconButton
          label="新建会话"
          onClick={() => {
            setSession(null)
            setMessages([])
            setChips([])
            setDraft('')
            setRunState('idle')
            setRunError(null)
            lastOperation.current = null
          }}
        >
          <IconPlus size={15} />
        </IconButton>
        <IconButton label="历史会话" onClick={() => setHistoryOpen(!historyOpen)}>
          <IconHistory size={15} />
        </IconButton>
        <IconButton
          label={messages.length === 0 ? '空会话不能分享' : '分享'}
          disabled={messages.length === 0}
          onClick={async () => {
            if (!session) return
            try {
              await agentApi.update(session.id, { shared: true })
              toast('分享链接已复制', 'success')
            } catch (error) {
              const message = error instanceof Error ? error.message : '分享失败'
              lastOperation.current = null
              setRunState('error')
              setRunError(message)
              toast(message, 'error')
            }
          }}
        >
          <IconShare size={15} />
        </IconButton>
        <IconButton label="收起" onClick={() => setOpen(false)}>
          <IconClose size={15} />
        </IconButton>
      </header>

      {historyOpen && (
        <div className="thin-scrollbar max-h-48 overflow-y-auto border-y border-ink-100 bg-ink-50 p-2">
          {sessionsLoading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-[12px] text-ink-400" data-testid="agent-history-loading">
              <Spinner size={13} /> 加载会话
            </div>
          ) : sessionsError ? (
            <div className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/6 p-2.5 text-[11px] text-danger" role="alert" data-testid="agent-history-error">
              <IconWarning size={13} className="mt-px shrink-0" />
              <span className="min-w-0 flex-1">{sessionsError}</span>
              <button
                type="button"
                data-testid="agent-history-retry"
                onClick={() => void loadSessions()}
                className="shrink-0 rounded px-1.5 py-0.5 font-medium hover:bg-danger/10"
              >
                重试
              </button>
            </div>
          ) : sessions.length === 0 ? (
            <EmptyState compact title="暂无历史会话" />
          ) : (
            sessions.map((s) => (
              <div key={s.id} className="group flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-surface">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const data = await agentApi.get(s.id)
                      setSession(data.session)
                      setMessages(mergeAgentMessages([], data.messages))
                      setRunState('idle')
                      setRunError(null)
                      setHistoryOpen(false)
                    } catch (error) {
                      const message = error instanceof Error ? error.message : '会话加载失败'
                      lastOperation.current = null
                      setSessionsError(message)
                      setRunState('error')
                      setRunError(message)
                      toast(message, 'error')
                    }
                  }}
                  className="min-w-0 flex-1 truncate text-left text-[12px] text-ink-700"
                >
                  {s.title}
                </button>
                <button
                  type="button"
                  aria-label="删除会话"
                  onClick={async () => {
                    try {
                      await agentApi.remove(s.id)
                      setSessions((prev) => prev.filter((x) => x.id !== s.id))
                      if (session?.id === s.id) {
                        setSession(null)
                        setMessages([])
                        setRunState('idle')
                        setRunError(null)
                      }
                    } catch (error) {
                      const message = error instanceof Error ? error.message : '删除会话失败'
                      lastOperation.current = null
                      setSessionsError(message)
                      toast(message, 'error')
                    }
                  }}
                  className="rounded p-1 text-ink-400 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                >
                  <IconTrash size={13} />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      <div ref={scrollRef} className="thin-scrollbar flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.length === 0 ? (
          <EmptyState
            icon={<IconSparkle size={26} />}
            title="描述你想创作的内容"
            description="我会先确认目标，再提出画布改动方案，确认后才写入。"
          />
        ) : (
          messages.map((message) => (
            <MessageBubble key={message.id} message={message} onResolve={resolve} busy={resolvingId === message.id} />
          ))
        )}
        {sending && (
          <div className="flex items-center gap-2 text-[12px] text-ink-400">
            <Spinner size={13} /> 思考中
          </div>
        )}
        {runState === 'error' && runError && (
          <div
            className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger/6 px-3 py-2 text-[11px] text-danger"
            role="alert"
            data-testid="agent-run-error"
          >
            <IconWarning size={14} className="mt-px shrink-0" />
            <span className="min-w-0 flex-1">{runError}</span>
            {lastOperation.current && (
              <button
                type="button"
                data-testid="agent-retry"
                onClick={retryOperation}
                className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 font-medium hover:bg-danger/10"
              >
                <IconRefresh size={12} />
                重试
              </button>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-ink-100 p-3">
        {chips.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <Chip
                key={chip.id}
                testId={`context-chip-${chip.refId}`}
                tone="accent"
                icon={chip.kind === 'node' ? <ChipNodeIcon refId={chip.refId} /> : <IconSkill size={10} />}
                onRemove={() => setChips((prev) => prev.filter((c) => c.id !== chip.id))}
              >
                {chip.label}
              </Chip>
            ))}
          </div>
        )}

        <textarea
          ref={composerRef}
          value={draft}
          data-testid="agent-input"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (shouldSubmitAgentKey(e)) {
              e.preventDefault()
              void send()
            }
          }}
          aria-keyshortcuts="Enter"
          rows={3}
          placeholder="描述你想制作的内容，或选中画布节点后提问"
          className="w-full resize-none rounded-xl border border-ink-200 p-2.5 text-[13px] leading-relaxed outline-none transition-colors placeholder:text-ink-300 focus:border-accent"
        />
        <div className="mt-1 text-[10px] text-ink-300">Enter 发送 · Shift+Enter 换行 · Esc 收起面板</div>

        <div className="mt-2 flex items-center gap-1">
          <IconButton label="附件" onClick={() => toast('请从画布或资产库选择素材', 'info')}>
            <IconAttachment size={15} />
          </IconButton>
          <IconButton label="引用节点或模型" onClick={(e) => mentionMenu.openFrom(e, 'above')}>
            <IconAt size={15} />
          </IconButton>
          <IconButton label="Skill" onClick={(e) => skillMenu.openFrom(e, 'above')}>
            <IconSkill size={15} />
          </IconButton>
          <button
            type="button"
            onClick={(e) => modelMenu.openFrom(e, 'above')}
            className="flex items-center gap-0.5 rounded-lg px-2 py-1.5 text-[11px] text-ink-500 transition-colors hover:bg-ink-50"
          >
            {MODELS_BY_ID.get(session?.settings.modelId ?? 'gvlm-3.1')?.label ?? '模型'}
            <IconChevronDown size={11} />
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            <SegmentedControl
              size="sm"
              value={session?.settings.generationMode ?? 'manual'}
              onChange={(mode) => void updateSessionSettings({ generationMode: mode })}
              options={[
                { value: 'manual', label: '手动' },
                { value: 'auto', label: '自动' },
              ]}
            />
            <button
              type="button"
              data-testid="agent-send"
              disabled={!draft.trim() || sending}
              onClick={() => void send()}
              className={cn(
                'rounded-full p-2 transition-colors',
                draft.trim() && !sending ? 'bg-ink-900 text-white hover:opacity-85' : 'bg-ink-100 text-ink-300',
              )}
              aria-label="发送"
            >
              <IconSend size={14} />
            </button>
          </div>
        </div>
      </div>

      {mentionMenu.anchor && (
        <Menu sections={mentionSections} anchor={mentionMenu.anchor} onClose={mentionMenu.close} placement="above" width={220} />
      )}
      {modelMenu.anchor && (
        <Menu
          anchor={modelMenu.anchor}
          onClose={modelMenu.close}
          placement="above"
          width={210}
          sections={[
            {
              title: '语言模型',
              items: modelsFor('text').map((model) => ({
                id: model.id,
                label: model.label,
                shortcut: model.latencyLabel,
                checked: model.id === session?.settings.modelId,
                onSelect: () => void updateSessionSettings({ modelId: model.id }),
              })),
            },
          ]}
        />
      )}
      {skillMenu.anchor && (
        <Menu
          anchor={skillMenu.anchor}
          onClose={skillMenu.close}
          placement="above"
          width={200}
          sections={[
            {
              title: 'Skill',
              items: SKILL_CATALOGUE.slice(0, 8).map((skill) => ({
                id: skill.id,
                label: skill.name,
                shortcut: skill.version,
                checked: chips.some((c) => c.kind === 'skill' && c.refId === skill.id),
                onSelect: () =>
                  setChips((prev) =>
                    prev.some((c) => c.refId === skill.id)
                      ? prev
                      : [...prev, { id: `chip-${skill.id}`, kind: 'skill', refId: skill.id, label: skill.name }],
                  ),
              })),
            },
          ]}
        />
      )}
    </aside>
  )
}

function ChipNodeIcon({ refId }: { refId: string }) {
  const node = useEditor((s) => s.document.nodes.find((n) => n.id === refId))
  if (!node) return <IconAt size={10} />
  const Icon = NODE_ICON[node.type]
  return <Icon size={10} />
}

function IconButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  label: string
  onClick: (event: React.MouseEvent) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded-lg p-1.5 transition-colors',
        disabled ? 'cursor-not-allowed text-ink-300' : 'text-ink-500 hover:bg-ink-50 hover:text-ink-800',
      )}
    >
      {children}
    </button>
  )
}

function MessageBubble({
  message,
  onResolve,
  busy = false,
}: {
  message: AgentMessage
  onResolve: (messageId: string, action: 'answer' | 'apply' | 'reject' | 'ignore', answer?: string) => void
  busy?: boolean
}) {
  const [answer, setAnswer] = useState('')

  if (message.role === 'user') {
    return (
      <div className="flex flex-col items-end gap-1">
        {message.context && message.context.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1">
            {message.context.map((chip) => (
              <Chip key={chip.id} tone="accent">
                {chip.label}
              </Chip>
            ))}
          </div>
        )}
        <div className="max-w-[86%] rounded-2xl rounded-br-md bg-ink-900 px-3 py-2 text-[13px] leading-relaxed text-white">
          {message.content}
        </div>
      </div>
    )
  }

  if (message.role === 'tool') {
    const toolStatus = message.payload?.kind === 'tool_call' ? message.payload.status : 'ok'
    return (
      <div
        data-testid={`agent-tool-${message.payload?.kind === 'tool_call' ? message.payload.tool.replaceAll('.', '-') : 'trace'}`}
        className={cn(
          'flex items-center gap-1.5 text-[11px]',
          toolStatus === 'error' ? 'text-danger' : toolStatus === 'running' ? 'text-running' : 'text-ink-400',
        )}
        data-legacy-testid="agent-tool-status"
        data-state={toolStatus}
      >
        <span className={cn('h-1.5 w-1.5 rounded-full', toolStatus === 'error' ? 'bg-danger' : toolStatus === 'running' ? 'bg-running' : 'bg-success')} />
        <span className="shrink-0 font-mono text-[10px] text-ink-400">{message.payload?.kind === 'tool_call' ? message.payload.tool : 'tool'}</span>
        <span className="min-w-0 flex-1">{message.content}</span>
        <span className="shrink-0">{toolStatus === 'running' ? '运行中' : toolStatus === 'error' ? '失败' : '完成'}</span>
      </div>
    )
  }

  const payload = message.payload

  return (
    <div className="space-y-2">
      <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-ink-50 px-3 py-2 text-[13px] leading-relaxed text-ink-800">
        {message.content}
      </div>

      {payload?.kind === 'ask_human' && !payload.answered && (
        <div className="rounded-2xl border border-ink-200 p-3" data-testid="ask-human">
          <p className="text-[12px] leading-relaxed text-ink-700">{payload.question}</p>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={3}
            placeholder={payload.placeholder}
            data-testid="ask-human-input"
            className="mt-2 w-full resize-none rounded-xl border border-ink-200 p-2 text-[12px] outline-none focus:border-accent"
          />
          <div className="mt-2 flex justify-end gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => onResolve(message.id, 'ignore')}
              className="rounded-lg px-2.5 py-1.5 text-[12px] text-ink-500 hover:bg-ink-50"
            >
              忽略
            </button>
            <button
              type="button"
              data-testid="ask-human-submit"
              disabled={!answer.trim() || busy}
              onClick={() => onResolve(message.id, 'answer', answer)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors',
                answer.trim() ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-300',
              )}
            >
              提交
            </button>
          </div>
        </div>
      )}

      {payload?.kind === 'mutation_proposal' && (
        <div className="rounded-2xl border border-ink-200 p-3" data-testid="mutation-proposal">
          <div className="mb-1 text-[11px] font-medium text-ink-500">画布改动方案</div>
          <p className="mb-2 text-[11px] leading-relaxed text-ink-600" data-testid="agent-skill-plan">{payload.summary}</p>
          <ul className="space-y-1 text-[12px] text-ink-600">
            {payload.mutations
              .filter((m) => m.op === 'addNode')
              .map((m) => (
                <li key={m.op === 'addNode' ? m.node.id : ''}>· 新增 {m.op === 'addNode' ? m.node.name : ''}</li>
              ))}
            <li>· 建立 {payload.mutations.filter((m) => m.op === 'addEdge').length} 条连线</li>
          </ul>
          {payload.status === 'pending' ? (
            <div className="mt-2.5 flex justify-end gap-1.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => onResolve(message.id, 'reject')}
                className="rounded-lg px-2.5 py-1.5 text-[12px] text-ink-500 hover:bg-ink-50"
              >
                取消
              </button>
              <button
                type="button"
                data-testid="apply-mutations"
                disabled={busy}
                onClick={() => onResolve(message.id, 'apply')}
                className="rounded-lg bg-ink-900 px-3 py-1.5 text-[12px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? '处理中…' : '应用到画布'}
              </button>
            </div>
          ) : (
            <div className="mt-2 text-[11px] text-ink-400">
              {payload.status === 'applied' ? '已应用' : '已取消'}
            </div>
          )}
        </div>
      )}

      {payload?.kind === 'quota_gate' && (
        <div className="flex items-start gap-2 rounded-2xl bg-running/10 p-3 text-[12px] text-ink-700">
          <IconWarning size={14} className="mt-px shrink-0 text-running" />
          <span>{payload.reason}。开通会员后可继续使用 Agent。</span>
        </div>
      )}
    </div>
  )
}
