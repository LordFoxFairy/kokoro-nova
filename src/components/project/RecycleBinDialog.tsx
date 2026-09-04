'use client'

import { useCallback, useEffect, useState } from 'react'

import { client, ApiError } from '@/lib/api'
import type { RecycledProject } from '@/contracts/recycle-bin'
import { IconTrash } from '@/components/icons'
import { Dialog } from '@/components/ui/Dialog'
import { Spinner } from '@/components/ui/controls'

type RecycleBinDialogProps = {
  open: boolean
  onClose: () => void
  /** Refreshes the active project grid after a restore or permanent delete. */
  onProjectsChanged?: () => Promise<void> | void
}

function compactDate(value: string) {
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function errorMessage(error: unknown) {
  return error instanceof ApiError || error instanceof Error ? error.message : '操作失败，请重试'
}

export function RecycleBinDialog({ open, onClose, onProjectsChanged }: RecycleBinDialogProps) {
  const [projects, setProjects] = useState<RecycledProject[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [confirmText, setConfirmText] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await client.recycleBin.list()
      setProjects(response.projects)
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) {
      setConfirmingId(null)
      setConfirmText('')
      return
    }
    void refresh()
  }, [open, refresh])

  const restore = async (project: RecycledProject) => {
    setPendingId(project.id)
    setError(null)
    try {
      await client.recycleBin.restore(project.id)
      await onProjectsChanged?.()
      await refresh()
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setPendingId(null)
    }
  }

  const permanentlyDelete = async (project: RecycledProject) => {
    if (confirmText !== project.name) return
    setPendingId(project.id)
    setError(null)
    try {
      await client.recycleBin.permanentlyDelete(project.id)
      await onProjectsChanged?.()
      setConfirmingId(null)
      setConfirmText('')
      await refresh()
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setPendingId(null)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="回收站" testId="recycle-bin-dialog" width={640}>
      <div className="space-y-3 pb-2">
        <p className="text-[12px] leading-5 text-ink-500">已删除项目会保留 30 天；恢复后会回到原文件夹，原文件夹不存在时回到根目录。</p>
        {error && (
          <div role="alert" data-testid="recycle-bin-error" className="rounded-lg border border-danger/25 bg-danger/5 px-3 py-2 text-[12px] text-danger">
            {error}
          </div>
        )}
        {loading ? (
          <div className="flex min-h-64 items-center justify-center text-ink-400"><Spinner size={22} /></div>
        ) : projects.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink-50 text-ink-300">
              <IconTrash size={22} />
            </span>
            <h3 className="mt-4 text-[14px] font-medium text-ink-800">回收站为空</h3>
            <p className="mt-1.5 text-[12px] text-ink-400">删除的项目会在这里保留 30 天</p>
          </div>
        ) : (
          <ul aria-label="已删除项目" className="divide-y divide-ink-100 rounded-xl border border-ink-100">
            {projects.map((project) => {
              const confirming = confirmingId === project.id
              const pending = pendingId === project.id
              return (
                <li key={project.id} data-testid={`recycle-project-${project.id}`} className="px-3.5 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="truncate text-[13px] font-medium text-ink-800">{project.name}</h3>
                      <p className="mt-1 text-[11px] leading-4 text-ink-400">
                        删除于 {compactDate(project.recycledAt)} · {project.canvasCount} 个画布
                        {project.originalFolderName ? ` · 原文件夹：${project.originalFolderName}` : ' · 原位置：根目录'}
                      </p>
                      <p data-testid={`recycle-expiry-${project.id}`} className="mt-0.5 text-[11px] text-[#ae6d1d]">
                        {project.daysRemaining > 0 ? `还可保留 ${project.daysRemaining} 天` : '将在本次清理时永久删除'} · 到期 {compactDate(project.recycleExpiresAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        disabled={Boolean(pendingId)}
                        onClick={() => void restore(project)}
                        className="rounded-md border border-ink-200 px-2.5 py-1.5 text-[11px] font-medium text-ink-700 transition-colors hover:bg-ink-50 disabled:cursor-wait disabled:opacity-50"
                      >
                        恢复
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(pendingId)}
                        onClick={() => {
                          setConfirmingId(confirming ? null : project.id)
                          setConfirmText('')
                        }}
                        className="rounded-md px-2.5 py-1.5 text-[11px] font-medium text-danger transition-colors hover:bg-danger/5 disabled:cursor-wait disabled:opacity-50"
                      >
                        永久删除
                      </button>
                    </div>
                  </div>
                  {confirming && (
                    <div data-testid={`recycle-confirm-${project.id}`} className="mt-3 rounded-lg bg-danger/5 p-3">
                      <p className="text-[12px] leading-5 text-ink-600">此操作会永久删除项目及其全部画布，无法恢复。请输入“{project.name}”确认。</p>
                      <div className="mt-2 flex gap-2">
                        <input
                          autoFocus
                          value={confirmText}
                          onChange={(event) => setConfirmText(event.target.value)}
                          aria-label={`确认永久删除 ${project.name}`}
                          className="min-w-0 flex-1 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-danger"
                        />
                        <button type="button" onClick={() => { setConfirmingId(null); setConfirmText('') }} className="rounded-md px-2 py-1.5 text-[11px] text-ink-500 hover:bg-white">取消</button>
                        <button
                          type="button"
                          disabled={confirmText !== project.name || pending}
                          onClick={() => void permanentlyDelete(project)}
                          className="rounded-md bg-danger px-2.5 py-1.5 text-[11px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          {pending ? '删除中…' : '确认永久删除'}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Dialog>
  )
}
