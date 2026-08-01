'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useEditor } from '@/lib/editor-store'
import type { Canvas } from '@/domain/types'
import { cn } from '@/lib/cn'
import { Menu, useMenuAnchor, type MenuSection } from '../ui/Menu'
import { ConfirmDialog, Dialog } from '../ui/Dialog'
import { Field, InlineRename, SegmentedControl } from '../ui/controls'
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

/**
 * Top chrome: project identity + canvas switcher on the left, the
 * workflow/storyboard segmented control centered, account state and the Agent
 * toggle on the right.
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
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between p-3.5">
      {/* Left: project + canvas */}
      <div className="chip-bar pointer-events-auto flex items-center gap-1 bg-surface p-1 pr-2">
        <Link
          href="/project"
          aria-label="返回全部项目"
          className="rounded-full p-2 text-ink-700 transition-colors hover:bg-ink-50"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 7.5 8 5l6 2.5L20 5v11.5L14 19l-6-2.5L4 19z" />
          </svg>
        </Link>
        <span className="max-w-[160px] truncate px-1.5 text-[13px] font-medium text-ink-900">
          {project?.name ?? '加载中'}
        </span>
        <span className="h-4 w-px bg-ink-200" />
        {renamingCanvas && current ? (
          <div className="w-28 px-1">
            <InlineRename
              value={current.name}
              testId="canvas-rename-input"
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
          <div className="w-28 px-1">
            <InlineRename
              value={`画布 ${canvases.length + 1}`}
              testId="canvas-new-input"
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
            onClick={(e) => switcher.openFrom(e)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] text-ink-700 transition-colors hover:bg-ink-50"
          >
            {current?.name ?? '画布'}
            <IconChevronDown size={13} className="text-ink-400" />
          </button>
        )}
      </div>

      {/* Center: view switch */}
      <div className="pointer-events-auto">
        <SegmentedControl
          value={viewMode}
          onChange={setViewMode}
          options={[
            {
              value: 'workflow',
              label: (
                <>
                  <IconWorkflow size={14} /> 工作流
                </>
              ),
              testId: 'view-workflow',
            },
            {
              value: 'storyboard',
              label: (
                <>
                  <IconStoryboard size={14} /> 故事板
                </>
              ),
              testId: 'view-storyboard',
            },
          ]}
        />
      </div>

      {/* Right: share, credits, agent */}
      <div className="pointer-events-auto flex items-center gap-2">
        <button
          type="button"
          aria-label="分享"
          data-testid="share-button"
          onClick={() => {
            setPublishTitle(project?.name ?? '')
            setPublishSummary('')
            setPublishOpen(true)
          }}
          className="chip-bar bg-surface p-2.5 text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-900"
        >
          <IconShare size={17} />
        </button>
        <div className="chip-bar flex items-center gap-1.5 bg-surface px-3 py-2 text-[13px] font-medium text-ink-800">
          <IconCredit size={14} className="text-running" />
          <span data-testid="credit-balance">{balance}</span>
        </div>
        <button
          type="button"
          data-testid="agent-toggle"
          onClick={() => setAgentOpen(!agentOpen)}
          className={cn(
            'chip-bar flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium transition-colors',
            agentOpen ? 'bg-ink-900 text-white' : 'bg-surface text-ink-800 hover:bg-ink-50',
          )}
        >
          <IconAgent size={16} />
          Agent
        </button>
      </div>

      {switcher.anchor && (
        <Menu sections={switcherSections} anchor={switcher.anchor} onClose={switcher.close} width={196} />
      )}
    </div>


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
