'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MODELS_BY_ID, modelsFor } from '@/domain/models'
import { SKILL_CATALOGUE } from '@/domain/skills'
import type {
  AgentContextChip,
  AgentMessage,
  AgentSession,
  WorkflowDocument,
} from '@/domain/types'
import { api } from '@/lib/api'
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
  IconSend,
  IconShare,
  IconSkill,
  IconSparkle,
  IconTrash,
  IconWarning,
} from '../icons'
import { NODE_ICON } from '../canvas/node-visuals'

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
  const [historyOpen, setHistoryOpen] = useState(false)

  const modelMenu = useMenuAnchor()
  const skillMenu = useMenuAnchor()
  const mentionMenu = useMenuAnchor()
  const scrollRef = useRef<HTMLDivElement>(null)

  const ensureSession = useCallback(async (): Promise<AgentSession | null> => {
    if (session) return session
    if (!projectId) return null
    const created = await api.post<AgentSession>('/api/agent/sessions', { projectId, canvasId })
    setSession(created)
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

  useEffect(() => {
    if (!open || !projectId) return
    api
      .get<{ sessions: AgentSession[] }>(`/api/agent/sessions?projectId=${projectId}`)
      .then((r) => setSessions(r.sessions))
      .catch(() => undefined)
  }, [open, projectId, session])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    try {
      const active = await ensureSession()
      if (!active) return
      const result = await api.post<{ session: AgentSession; messages: AgentMessage[] }>(
        `/api/agent/sessions/${active.id}/messages`,
        { text, context: chips },
      )
      setSession(result.session)
      setMessages((prev) => [...prev, ...result.messages])
      setDraft('')
      setChips([])
    } catch (error) {
      toast(error instanceof Error ? error.message : '发送失败', 'error')
    } finally {
      setSending(false)
    }
  }

  const resolve = async (messageId: string, action: 'answer' | 'apply' | 'reject' | 'ignore', answer?: string) => {
    if (!session) return
    try {
      const result = await api.patch<{
        session: AgentSession
        messages: AgentMessage[]
        revision?: number
        document?: WorkflowDocument
      }>(`/api/agent/sessions/${session.id}/messages`, { messageId, action, answer })

      setSession(result.session)
      setMessages((prev) => {
        const map = new Map(prev.map((m) => [m.id, m]))
        for (const message of result.messages) map.set(message.id, message)
        return [...map.values()].sort((a, b) => a.seq - b.seq)
      })
      if (result.document && typeof result.revision === 'number') {
        applyServerDocument(result.document, result.revision)
        toast('已应用到画布', 'success')
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : '操作失败', 'error')
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
        <IconButton
          label="新建会话"
          onClick={() => {
            setSession(null)
            setMessages([])
            setChips([])
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
            await api.patch(`/api/agent/sessions/${session.id}`, { shared: true })
            toast('分享链接已复制', 'success')
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
          {sessions.length === 0 ? (
            <EmptyState compact title="暂无历史会话" />
          ) : (
            sessions.map((s) => (
              <div key={s.id} className="group flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-surface">
                <button
                  type="button"
                  onClick={async () => {
                    const data = await api.get<{ session: AgentSession; messages: AgentMessage[] }>(
                      `/api/agent/sessions/${s.id}`,
                    )
                    setSession(data.session)
                    setMessages(data.messages)
                    setHistoryOpen(false)
                  }}
                  className="min-w-0 flex-1 truncate text-left text-[12px] text-ink-700"
                >
                  {s.title}
                </button>
                <button
                  type="button"
                  aria-label="删除会话"
                  onClick={async () => {
                    await api.del(`/api/agent/sessions/${s.id}`)
                    setSessions((prev) => prev.filter((x) => x.id !== s.id))
                    if (session?.id === s.id) {
                      setSession(null)
                      setMessages([])
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
            <MessageBubble key={message.id} message={message} onResolve={resolve} />
          ))
        )}
        {sending && (
          <div className="flex items-center gap-2 text-[12px] text-ink-400">
            <Spinner size={13} /> 思考中
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
          value={draft}
          data-testid="agent-input"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          rows={3}
          placeholder="描述你想制作的内容，或选中画布节点后提问"
          className="w-full resize-none rounded-xl border border-ink-200 p-2.5 text-[13px] leading-relaxed outline-none transition-colors placeholder:text-ink-300 focus:border-accent"
        />

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
              onChange={async (mode) => {
                const active = await ensureSession()
                if (!active) return
                const updated = await api.patch<AgentSession>(`/api/agent/sessions/${active.id}`, {
                  generationMode: mode,
                })
                setSession(updated)
              }}
              options={[
                { value: 'manual', label: '手动' },
                { value: 'auto', label: '自动' },
              ]}
            />
            <button
              type="button"
              data-testid="agent-send"
              disabled={!draft.trim() || sending}
              onClick={send}
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
                onSelect: async () => {
                  const active = await ensureSession()
                  if (!active) return
                  const updated = await api.patch<AgentSession>(`/api/agent/sessions/${active.id}`, {
                    modelId: model.id,
                  })
                  setSession(updated)
                },
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
}: {
  message: AgentMessage
  onResolve: (messageId: string, action: 'answer' | 'apply' | 'reject' | 'ignore', answer?: string) => void
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
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-ink-400">
        <span className="h-1 w-1 rounded-full bg-success" />
        {message.content}
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
              onClick={() => onResolve(message.id, 'ignore')}
              className="rounded-lg px-2.5 py-1.5 text-[12px] text-ink-500 hover:bg-ink-50"
            >
              忽略
            </button>
            <button
              type="button"
              data-testid="ask-human-submit"
              disabled={!answer.trim()}
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
          <div className="mb-2 text-[11px] font-medium text-ink-500">画布改动方案</div>
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
                onClick={() => onResolve(message.id, 'reject')}
                className="rounded-lg px-2.5 py-1.5 text-[12px] text-ink-500 hover:bg-ink-50"
              >
                取消
              </button>
              <button
                type="button"
                data-testid="apply-mutations"
                onClick={() => onResolve(message.id, 'apply')}
                className="rounded-lg bg-ink-900 px-3 py-1.5 text-[12px] font-medium text-white"
              >
                应用到画布
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
