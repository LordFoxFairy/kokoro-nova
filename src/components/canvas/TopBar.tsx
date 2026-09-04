'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useEditor } from '@/lib/editor-store'
import type { Canvas } from '@/domain/types'
import { cn } from '@/lib/cn'
import { Menu, useMenuAnchor, type MenuSection } from '../ui/Menu'
import { ConfirmDialog, Dialog } from '../ui/Dialog'
import { Field, InlineRename } from '../ui/controls'
import { Tooltip } from '../ui/Tooltip'
import { LibTvLogo } from '../shell/LibTvLogo'
import {
  IconAgent,
  IconChevronDown,
  IconCopy,
  IconCredit,
  IconRename,
  IconShare,
  IconStoryboard,
  IconTrash,
  IconWorkflow,
} from '../icons'

export const TOPBAR_RESPONSIVE_BREAKPOINT = 1100

const TOPBAR_RESPONSIVE_STYLES = `
@media (max-width: ${TOPBAR_RESPONSIVE_BREAKPOINT}px) {
  [data-testid="editor-topbar"] {
    height: auto;
    min-height: 2rem;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 0.5rem;
    overflow-x: auto;
  }

  [data-testid="editor-topbar"] > div:first-child {
    min-width: 0;
    max-width: 100%;
    height: auto;
    flex: 1 1 100%;
    flex-wrap: wrap;
  }

  [data-testid="editor-topbar"] [data-testid="project-canvas-control"] {
    min-width: 0;
    max-width: calc(100vw - 1rem);
  }

  [data-testid="editor-account-actions"] {
    min-width: 0;
    max-width: 100%;
    height: 2rem;
    flex: 0 0 100%;
    justify-content: flex-end;
    overflow-x: auto;
    white-space: nowrap;
  }

  [data-testid="editor-account-actions"] > * {
    flex: 0 0 auto;
  }
}
`

function ViewModeButton({
  label,
  active,
  testId,
  onClick,
  children,
}: {
  label: string
  active: boolean
  testId: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip label={label} side="bottom">
      <button
        type="button"
        data-testid={testId}
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-accent',
          active ? 'bg-ink-100 text-ink-900' : 'text-ink-400 hover:bg-ink-50 hover:text-ink-700',
        )}
      >
        {children}
      </button>
    </Tooltip>
  )
}

function StoreGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 9.5h16l-1.2-4H5.2L4 9.5Z" fill="currentColor" />
      <path d="M5.5 10.5v7.2A1.8 1.8 0 0 0 7.3 19.5h9.4a1.8 1.8 0 0 0 1.8-1.8v-7.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9.2 13.2h5.6v6.3H9.2z" fill="currentColor" opacity=".5" />
    </svg>
  )
}

/**
 * Current editor chrome: one compact identity control and adjacent icon-only
 * view switch on the left; sharing, account benefits and Agent live on the
 * right. Every control is 32px high at the canonical desktop viewport.
 */
export function TopBar() {
  const router = useRouter()
  const project = useEditor((s) => s.project)
  const canvases = useEditor((s) => s.canvases)
  const canvasId = useEditor((s) => s.canvasId)
  const viewMode = useEditor((s) => s.viewMode)
  const setViewMode = useEditor((s) => s.setViewMode)
  const agentOpen = useEditor((s) => s.agentOpen)
  const setAgentOpen = useEditor((s) => s.setAgentOpen)
  const balance = useEditor((s) => s.balance)
  const reloadCanvas = useEditor((s) => s.reloadCanvas)
  const toast = useEditor((s) => s.toast)

  const switcher = useMenuAnchor()
  const [renamingProject, setRenamingProject] = useState(false)
  const [renamingCanvas, setRenamingCanvas] = useState(false)
  const [creatingCanvas, setCreatingCanvas] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Canvas | null>(null)
  const [publishOpen, setPublishOpen] = useState(false)
  const [publishTitle, setPublishTitle] = useState('')
  const [publishSummary, setPublishSummary] = useState('')
  const [publishing, setPublishing] = useState(false)

  const current = canvases.find((c) => c.id === canvasId)

  const refreshProject = async () => {
    if (!project) return
    const data = await api.get<{ project: typeof project; canvases: Canvas[] }>(
      `/api/projects/${project.id}`,
    )
    useEditor.setState({ project: data.project, canvases: data.canvases })
  }

  const renameProject = async (name: string) => {
    if (!project) return
    setRenamingProject(false)
    if (name === project.name) return
    try {
      const updated = await api.patch<typeof project>(`/api/projects/${project.id}`, { name })
      useEditor.setState({ project: updated })
      toast('项目名称已更新', 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : '项目重命名失败', 'error')
    }
  }

  const createCanvas = async (name?: string, copyOf?: string) => {
    if (!project) return
    const canvas = await api.post<Canvas>('/api/canvases', { projectId: project.id, name, copyOf })
    await refreshProject()
    await reloadCanvas(canvas.id)
    router.replace(`/canvas?projectId=${project.id}&canvasId=${canvas.id}`)
  }

  const switcherSections: MenuSection[] = [
    {
      title: '当前项目的画布',
      items: canvases.map((canvas) => ({
        id: canvas.id,
        label: canvas.name,
        checked: canvas.id === canvasId,
        onSelect: async () => {
          await reloadCanvas(canvas.id)
          router.replace(`/canvas?projectId=${project?.id}&canvasId=${canvas.id}`)
        },
      })),
    },
    {
      items: [
        {
          id: 'new',
          label: '新建画布',
          onSelect: () => setCreatingCanvas(true),
        },
        {
          id: 'rename',
          label: '重命名',
          icon: <IconRename size={14} />,
          onSelect: () => setRenamingCanvas(true),
        },
        {
          id: 'copy',
          label: '复制画布',
          icon: <IconCopy size={14} />,
          onSelect: () => current && createCanvas(undefined, current.id),
        },
        {
          id: 'delete',
          label: '删除画布',
          icon: <IconTrash size={14} />,
          danger: true,
          // The last canvas cannot be removed.
          disabled: canvases.length <= 1,
          disabledReason: '项目至少需要保留一个画布',
          onSelect: () => current && setDeleteTarget(current),
        },
      ],
    },
  ]

  return (
    <>
      <style>{TOPBAR_RESPONSIVE_STYLES}</style>
      <header
        data-testid="editor-topbar"
        className="pointer-events-none absolute left-4 right-4 top-4 z-30 flex h-8 min-w-0 items-center justify-between"
      >
        <div className="pointer-events-auto flex h-8 min-w-0 items-center gap-2">
          <div
            data-testid="project-canvas-control"
            className="flex h-8 items-center rounded-[10px] border border-white/8 bg-surface px-1 shadow-[var(--shadow-float)]"
          >
            <Link
              href="/project"
              aria-label="返回全部项目"
              className="flex h-7 w-9 items-center justify-center rounded-lg text-ink-900 transition-colors hover:bg-ink-100 focus-visible:outline-2 focus-visible:outline-accent"
            >
              <LibTvLogo compact className="h-[18px] w-[23px]" />
              <IconChevronDown size={9} className="ml-0.5 text-ink-400" />
            </Link>
            {renamingProject && project ? (
              <div className="w-36 px-1.5">
                <InlineRename
                  value={project.name}
                  testId="project-rename-input"
                  className="h-6 border-ink-300 bg-ink-50 py-0"
                  onCancel={() => setRenamingProject(false)}
                  onCommit={renameProject}
                />
              </div>
            ) : (
              <button
                type="button"
                data-testid="project-name"
                aria-label={`重命名项目：${project?.name ?? '加载中'}`}
                onClick={() => project && setRenamingProject(true)}
                className="max-w-[154px] truncate rounded-lg px-2 text-left text-[13px] font-medium text-ink-900 transition-colors hover:bg-ink-100 focus-visible:outline-2 focus-visible:outline-accent"
              >
                {project?.name ?? '加载中'}
              </button>
            )}
            <span className="h-5 w-px bg-ink-200" />
            {renamingCanvas && current ? (
              <div className="w-28 px-1.5">
                <InlineRename
                  value={current.name}
                  testId="canvas-rename-input"
                  className="h-6 border-ink-300 bg-ink-50 py-0"
                  onCancel={() => setRenamingCanvas(false)}
                  onCommit={async (name) => {
                    setRenamingCanvas(false)
                    if (name === current.name) return
                    await api.patch(`/api/canvases/${current.id}`, { name })
                    await refreshProject()
                  }}
                />
              </div>
            ) : creatingCanvas ? (
              <div className="w-28 px-1.5">
                <InlineRename
                  value={`画布 ${canvases.length + 1}`}
                  testId="canvas-new-input"
                  className="h-6 border-ink-300 bg-ink-50 py-0"
                  onCancel={() => setCreatingCanvas(false)}
                  onCommit={async (name) => {
                    setCreatingCanvas(false)
                    await createCanvas(name)
                  }}
                />
              </div>
            ) : (
              <button
                type="button"
                data-testid="canvas-switcher"
                onClick={(event) => switcher.openFrom(event)}
                className="flex h-7 max-w-[150px] items-center gap-1 rounded-lg px-2 text-[13px] text-ink-700 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-accent"
              >
                <span className="truncate">{current?.name ?? '画布'}</span>
                <IconChevronDown size={11} className="shrink-0 text-ink-400" />
              </button>
            )}
          </div>

          <nav
            data-testid="view-mode-switch"
            aria-label="画布视图"
            className="flex h-8 items-center gap-0.5 rounded-[10px] border border-white/8 bg-surface p-0.5 shadow-[var(--shadow-float)]"
          >
            <ViewModeButton
              label="工作流"
              active={viewMode === 'workflow'}
              testId="view-workflow"
              onClick={() => setViewMode('workflow')}
            >
              <IconWorkflow size={16} />
            </ViewModeButton>
            <ViewModeButton
              label="故事板"
              active={viewMode === 'storyboard'}
              testId="view-storyboard"
              onClick={() => setViewMode('storyboard')}
            >
              <IconStoryboard size={16} />
            </ViewModeButton>
          </nav>
        </div>

        <div data-testid="editor-account-actions" className="pointer-events-auto flex h-8 items-center gap-2">
          <Tooltip label="发布与分享" side="bottom">
            <button
              type="button"
              aria-label="发布与分享"
              data-testid="share-button"
              onClick={() => {
                setPublishTitle(project?.name ?? '')
                setPublishSummary('')
                setPublishOpen(true)
              }}
              className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/8 bg-surface text-ink-700 shadow-[var(--shadow-float)] transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-accent"
            >
              <IconShare size={15} />
            </button>
          </Tooltip>
          <Tooltip label="积分超市" side="bottom">
            <Link
              href="/account?tab=store"
              aria-label="积分超市"
              className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/8 bg-surface text-[#60d4ef] shadow-[var(--shadow-float)] transition-colors hover:bg-ink-100 focus-visible:outline-2 focus-visible:outline-accent"
            >
              <StoreGlyph />
            </Link>
          </Tooltip>
          <Link
            href="/account?tab=membership"
            aria-label="会员权益"
            className="flex h-8 items-center gap-1.5 rounded-[10px] border border-white/8 bg-surface px-2.5 text-[12px] text-ink-700 shadow-[var(--shadow-float)] transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span className="text-running">◆</span>
            会员权益
          </Link>
          <Link
            href="/account"
            aria-label={`积分 ${balance}`}
            className="flex h-8 items-center gap-1.5 rounded-[10px] border border-white/8 bg-surface px-2.5 text-[12px] font-medium text-ink-800 shadow-[var(--shadow-float)] transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-accent"
          >
            <IconCredit size={13} className="text-running" />
            <span data-testid="credit-balance">{balance}</span>
          </Link>
          <Link
            href="/account"
            aria-label="账户"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/12 bg-gradient-to-br from-sky-100 via-blue-300 to-indigo-500 text-[11px] font-bold text-slate-900 shadow-[var(--shadow-float)] focus-visible:outline-2 focus-visible:outline-accent"
          >
            L
          </Link>
          <button
            type="button"
            data-testid="agent-toggle"
            onClick={() => setAgentOpen(!agentOpen)}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-[10px] border border-white/8 px-3 text-[12px] font-medium shadow-[var(--shadow-float)] transition-colors focus-visible:outline-2 focus-visible:outline-accent',
              agentOpen ? 'bg-ink-100 text-ink-900' : 'bg-surface text-ink-800 hover:bg-ink-100',
            )}
          >
            <IconAgent size={15} />
            Agent
          </button>
        </div>

        {switcher.anchor && (
          <Menu sections={switcherSections} anchor={switcher.anchor} onClose={switcher.close} width={196} />
        )}
      </header>


      {/* Publishing freezes an immutable snapshot; the live canvas keeps moving. */}
      <Dialog open={publishOpen} onClose={() => setPublishOpen(false)} title="发布到公开画廊" width={420}>
        <div className="space-y-3">
          <Field label="标题">
            <input
              value={publishTitle}
              data-testid="publish-title"
              onChange={(e) => setPublishTitle(e.target.value)}
              className="w-full rounded-lg border border-ink-200 px-3 py-2 text-[13px] outline-none focus:border-accent"
            />
          </Field>
          <Field label="简介" hint="发布会冻结当前画布的快照，之后的修改不会影响已发布内容。">
            <textarea
              value={publishSummary}
              data-testid="publish-summary"
              onChange={(e) => setPublishSummary(e.target.value)}
              rows={3}
              placeholder="用一两句话介绍这个作品"
              className="w-full resize-none rounded-lg border border-ink-200 px-3 py-2 text-[13px] outline-none focus:border-accent"
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-5">
          <button
            type="button"
            onClick={() => setPublishOpen(false)}
            className="rounded-lg px-3.5 py-2 text-[13px] text-ink-600 hover:bg-ink-50"
          >
            取消
          </button>
          <button
            type="button"
            data-testid="publish-submit"
            disabled={!publishTitle.trim() || publishing}
            onClick={async () => {
              if (!canvasId) return
              setPublishing(true)
              try {
                await api.post('/api/publish', {
                  canvasId,
                  title: publishTitle.trim(),
                  summary: publishSummary.trim(),
                })
                setPublishOpen(false)
                toast('已发布到公开画廊', 'success')
              } catch (error) {
                toast(error instanceof Error ? error.message : '发布失败', 'error')
              } finally {
                setPublishing(false)
              }
            }}
            className={
              !publishTitle.trim() || publishing
                ? 'cursor-not-allowed rounded-lg bg-ink-200 px-3.5 py-2 text-[13px] font-medium text-white'
                : 'rounded-lg bg-ink-900 px-3.5 py-2 text-[13px] font-medium text-white hover:opacity-85'
            }
          >
            发布
          </button>
        </div>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除画布"
        description={`将删除「${deleteTarget?.name}」，此操作不可恢复。`}
        confirmLabel="删除"
        danger
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return
          const remaining = canvases.filter((c) => c.id !== deleteTarget.id)
          await api.del(`/api/canvases/${deleteTarget.id}`)
          setDeleteTarget(null)
          await refreshProject()
          if (remaining[0]) {
            await reloadCanvas(remaining[0].id)
            router.replace(`/canvas?projectId=${project?.id}&canvasId=${remaining[0].id}`)
          }
        }}
      />
    </>
  )
}
