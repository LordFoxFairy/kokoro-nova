'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { AuthenticatedShell, useHomeDiscoveryState } from '@/components/shell/AuthenticatedShell'
import {
  IconCopy,
  IconFolder,
  IconImage,
  IconPlus,
  IconRename,
  IconTrash,
} from '@/components/icons'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { Menu, useMenuAnchor, type MenuSection } from '@/components/ui/Menu'
import { Spinner } from '@/components/ui/controls'
import type { Canvas, Project } from '@/domain/types'
import { ApiError, api } from '@/lib/api'
import { FolderCard, ProjectCard, type FolderRow, type ProjectRow } from './ProjectCard'
import { ProjectToolbar } from './ProjectToolbar'
import { RecycleBinDialog } from './RecycleBinDialog'

export function filterProjectRows(projects: ProjectRow[], folderId: string | null, query: string): ProjectRow[] {
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
  return projects.filter(
    (project) =>
      project.folderId === folderId &&
      (!normalizedQuery || project.name.toLocaleLowerCase('zh-CN').includes(normalizedQuery)),
  )
}

export function getProjectGridColumns(viewportWidth: number): 2 | 3 | 4 {
  if (viewportWidth <= 850) return 2
  if (viewportWidth <= 1100) return 3
  return 4
}

export type ProjectListEmptyState = {
  kind: 'workspace' | 'search' | 'folder'
  title: string
}

export function getProjectListEmptyState({
  hasProjects,
  hasFolders,
  query,
  inFolder,
  hasSourceItems,
}: {
  hasProjects: boolean
  hasFolders: boolean
  query: string
  inFolder: boolean
  hasSourceItems?: boolean
}): ProjectListEmptyState | null {
  const normalizedQuery = query.trim()
  const hasVisibleItems = hasProjects || hasFolders
  const hasItemsBeforeQuery = hasSourceItems ?? hasVisibleItems

  if (normalizedQuery && !hasVisibleItems) return { kind: 'search', title: '没有匹配的项目' }
  if (inFolder && !hasProjects) return { kind: 'folder', title: '文件夹为空' }
  if (!hasItemsBeforeQuery) return { kind: 'workspace', title: '还没有项目' }
  return null
}

type PendingAction =
  | 'create-project'
  | 'create-folder'
  | 'rename'
  | 'cover'
  | 'duplicate'
  | 'move'
  | 'delete-project'
  | 'delete-folder'

type Feedback = {
  tone: 'success' | 'error'
  message: string
}

function errorMessage(reason: unknown, fallback: string) {
  if (reason instanceof ApiError || reason instanceof Error) return reason.message || fallback
  return fallback
}

function ProjectListSurface() {
  const router = useRouter()
  const { status: homeStatus, publicMode } = useHomeDiscoveryState()
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [folders, setFolders] = useState<FolderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [query, setQuery] = useState('')
  const [openFolderId, setOpenFolderId] = useState<string | null>(null)
  const [recycleBinOpen, setRecycleBinOpen] = useState(false)

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [menuTarget, setMenuTarget] = useState<{ kind: 'project' | 'folder'; id: string } | null>(null)
  const [deleteProject, setDeleteProject] = useState<ProjectRow | null>(null)
  const [deleteFolder, setDeleteFolder] = useState<FolderRow | null>(null)
  const [folderConfirmText, setFolderConfirmText] = useState('')

  const menu = useMenuAnchor()
  const loadedRef = useRef(false)
  const pendingRef = useRef<PendingAction | null>(null)

  const refresh = useCallback(async (): Promise<boolean> => {
    const initialLoad = !loadedRef.current
    if (initialLoad) setLoading(true)
    else setRefreshing(true)

    try {
      const data = await api.get<{ projects: ProjectRow[]; folders: FolderRow[]; balance: number }>('/api/projects')
      setProjects(data.projects)
      setFolders(data.folders)
      setLoadError(null)
      setHasLoaded(true)
      loadedRef.current = true
      return true
    } catch (reason) {
      setLoadError(errorMessage(reason, '项目列表加载失败，请重试'))
      return false
    } finally {
      if (initialLoad) setLoading(false)
      else setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (homeStatus === 'loading' || publicMode) return
    void refresh()
  }, [homeStatus, publicMode, refresh])

  useEffect(() => {
    if (openFolderId && !folders.some((folder) => folder.id === openFolderId)) setOpenFolderId(null)
  }, [folders, openFolderId])

  const runAction = useCallback(
    async (action: PendingAction, successMessage: string, operation: () => Promise<void>): Promise<boolean> => {
      if (pendingRef.current) return false
      pendingRef.current = action
      setPendingAction(action)
      setFeedback(null)
      try {
        await operation()
        setFeedback({ tone: 'success', message: successMessage })
        return true
      } catch (reason) {
        setFeedback({ tone: 'error', message: errorMessage(reason, '操作失败，请重试') })
        return false
      } finally {
        pendingRef.current = null
        setPendingAction(null)
      }
    },
    [],
  )

  const refreshOrThrow = useCallback(async () => {
    if (!(await refresh())) throw new Error('列表刷新失败，请重试')
  }, [refresh])

  const createProject = useCallback(async () => {
    const folderId = openFolderId
    await runAction('create-project', '项目已创建', async () => {
      const { project, canvas } = await api.post<{ project: Project; canvas: Canvas }>('/api/projects', { folderId })
      router.push(`/canvas?projectId=${project.id}&canvasId=${canvas.id}`)
    })
  }, [openFolderId, router, runAction])

  const createFolder = useCallback(async () => {
    await runAction('create-folder', '文件夹已创建', async () => {
      await api.post('/api/folders')
      await refreshOrThrow()
    })
  }, [refreshOrThrow, runAction])

  const commitRename = useCallback(
    async (kind: 'project' | 'folder', row: ProjectRow | FolderRow, name: string) => {
      const nextName = name.trim() || row.name
      if (nextName === row.name) {
        setRenamingId(null)
        return
      }
      const completed = await runAction('rename', '名称已更新', async () => {
        await api.patch(`/api/${kind === 'project' ? 'projects' : 'folders'}/${row.id}`, { name: nextName })
        await refreshOrThrow()
      })
      if (completed) setRenamingId(null)
    },
    [refreshOrThrow, runAction],
  )

  const chooseCover = useCallback(
    (kind: 'project' | 'folder', id: string) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.onchange = () => {
        const file = input.files?.[0]
        if (!file) return
        if (!file.type.startsWith('image/')) {
          setFeedback({ tone: 'error', message: '请选择图片文件' })
          return
        }
        const reader = new FileReader()
        reader.onerror = () => setFeedback({ tone: 'error', message: '封面读取失败，请重试' })
        reader.onload = () => {
          if (typeof reader.result !== 'string' || !reader.result) {
            setFeedback({ tone: 'error', message: '封面读取失败，请重试' })
            return
          }
          void runAction('cover', '封面已更新', async () => {
            await api.patch(`/api/${kind === 'project' ? 'projects' : 'folders'}/${id}`, {
              coverUrl: reader.result,
            })
            await refreshOrThrow()
          })
        }
        reader.readAsDataURL(file)
      }
      input.click()
    },
    [refreshOrThrow, runAction],
  )

  const openFolder = folders.find((folder) => folder.id === openFolderId) ?? null
  const visibleProjects = useMemo(
    () => filterProjectRows(projects, openFolderId, query),
    [openFolderId, projects, query],
  )
  const visibleFolders = useMemo(
    () =>
      openFolderId
        ? []
        : folders.filter((folder) => {
            const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
            return !normalizedQuery || folder.name.toLocaleLowerCase('zh-CN').includes(normalizedQuery)
          }),
    [folders, openFolderId, query],
  )

  const hasSourceItems = openFolderId
    ? projects.some((project) => project.folderId === openFolderId)
    : projects.some((project) => project.folderId === null) || folders.length > 0
  const emptyState = getProjectListEmptyState({
    hasProjects: visibleProjects.length > 0,
    hasFolders: visibleFolders.length > 0,
    query,
    inFolder: Boolean(openFolderId),
    hasSourceItems,
  })
  const visibleItemCount = visibleProjects.length + visibleFolders.length
  const visibleItemLabel =
    visibleProjects.length > 0 && visibleFolders.length > 0
      ? '项目或文件夹'
      : visibleProjects.length > 0
        ? '项目'
        : '文件夹'

  const projectMenu = (project: ProjectRow): MenuSection[] => [
    {
      items: [
        { id: 'open', label: '打开', onSelect: () => router.push(`/canvas?projectId=${project.id}`) },
        {
          id: 'rename',
          label: '重命名',
          icon: <IconRename size={14} />,
          onSelect: () => setRenamingId(project.id),
        },
        {
          id: 'cover',
          label: '修改封面',
          icon: <IconImage size={14} />,
          onSelect: () => chooseCover('project', project.id),
        },
        {
          id: 'duplicate',
          label: '创建副本',
          icon: <IconCopy size={14} />,
          onSelect: () => {
            void runAction('duplicate', '项目副本已创建', async () => {
              await api.put(`/api/projects/${project.id}`)
              await refreshOrThrow()
            })
          },
        },
        {
          id: 'move',
          label: '移动至文件夹',
          icon: <IconFolder size={14} />,
          submenu: [
            {
              id: 'root',
              label: '移出文件夹',
              disabled: project.folderId === null,
              onSelect: () => {
                void runAction('move', '项目已移出文件夹', async () => {
                  await api.patch(`/api/projects/${project.id}`, { folderId: null })
                  await refreshOrThrow()
                })
              },
            },
            ...(folders.length > 0
              ? folders.map((folder) => ({
                  id: folder.id,
                  label: folder.name,
                  onSelect: () => {
                    void runAction('move', `项目已移动至「${folder.name}」`, async () => {
                      await api.patch(`/api/projects/${project.id}`, { folderId: folder.id })
                      await refreshOrThrow()
                    })
                  },
                }))
              : [{ id: 'empty', label: '暂无文件夹', disabled: true, onSelect: () => undefined }]),
          ],
        },
      ],
    },
    {
      items: [
        {
          id: 'delete',
          label: '删除项目',
          icon: <IconTrash size={14} />,
          danger: true,
          onSelect: () => setDeleteProject(project),
        },
      ],
    },
  ]

  const folderMenu = (folder: FolderRow): MenuSection[] => [
    {
      items: [
        { id: 'open', label: '打开', onSelect: () => setOpenFolderId(folder.id) },
        {
          id: 'rename',
          label: '重命名',
          icon: <IconRename size={14} />,
          onSelect: () => setRenamingId(folder.id),
        },
        {
          id: 'cover',
          label: '更换封面',
          icon: <IconImage size={14} />,
          onSelect: () => chooseCover('folder', folder.id),
        },
        {
          id: 'delete',
          label: '删除文件夹',
          icon: <IconTrash size={14} />,
          danger: true,
          onSelect: () => {
            setFolderConfirmText('')
            setDeleteFolder(folder)
          },
        },
      ],
    },
  ]

  const selectedProject = menuTarget?.kind === 'project' ? projects.find((item) => item.id === menuTarget.id) : null
  const selectedFolder = menuTarget?.kind === 'folder' ? folders.find((item) => item.id === menuTarget.id) : null

  if (publicMode) {
    return (
      <div className="min-h-[calc(100vh-106px)] bg-[#111] px-10 py-16 max-[1100px]:px-4">
        <section
          data-testid="project-login-gate"
          aria-label="项目登录入口"
          className="mx-auto flex max-w-xl flex-col items-center justify-center gap-3 rounded-2xl border border-white/[0.08] bg-[#171717] px-6 py-16 text-center"
        >
          <IconFolder size={38} className="text-[#60c9ef]/65" />
          <h1 className="text-[17px] font-semibold text-white/86">登录后管理项目</h1>
          <p className="max-w-md text-[13px] leading-relaxed text-white/45">
            项目、文件夹和 Agent 会话属于你的私有工作区。公开内容可以继续浏览，登录后即可创建和编辑项目。
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Link
              href="/"
              className="rounded-lg border border-white/[0.12] px-3.5 py-2 text-[12px] text-white/68 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60c9ef]"
            >
              返回公开首页
            </Link>
            <button
              type="button"
              onClick={() => router.push('/account')}
              className="rounded-lg bg-[#60c9ef] px-3.5 py-2 text-[12px] font-medium text-[#10202a] transition-colors hover:bg-[#72d2f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60c9ef]"
            >
              前往登录
            </button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-106px)] min-w-0 bg-[#111]" aria-busy={loading || refreshing || undefined}>
        <ProjectToolbar
          title={openFolder?.name ?? '全部项目'}
          inFolder={Boolean(openFolder)}
          query={query}
          onQueryChange={setQuery}
          onClearQuery={() => setQuery('')}
          onBackFromFolder={() => setOpenFolderId(null)}
          onOpenRecycleBin={() => setRecycleBinOpen(true)}
          onCreateFolder={() => void createFolder()}
          disabled={Boolean(pendingAction) || loading}
        />

        <section aria-label="项目列表" className="min-w-0 px-10 pb-16 pt-[26px] max-[1100px]:px-4">
          {loading ? (
            <div className="flex w-4/5 justify-center py-20 text-white/35 max-[1100px]:w-full">
              <Spinner size={22} />
            </div>
          ) : !hasLoaded ? (
            <div
              role="alert"
              data-testid="project-load-error"
              className="flex w-4/5 flex-col items-center justify-center gap-3 rounded-2xl border border-white/[0.08] bg-[#171717] px-6 py-16 text-center max-[1100px]:w-full"
            >
              <IconFolder size={34} className="text-white/25" />
              <div>
                <h2 className="text-[14px] font-medium text-white/78">项目列表加载失败</h2>
                <p className="mt-1 text-[12px] text-white/40">{loadError ?? '请稍后重试'}</p>
              </div>
              <button
                type="button"
                data-testid="project-retry"
                onClick={() => void refresh()}
                className="rounded-lg border border-white/[0.12] px-3 py-1.5 text-[12px] text-white/72 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60c9ef]"
              >
                重试
              </button>
            </div>
          ) : (
            <>
              <div
                data-testid="project-grid"
                className="grid w-4/5 grid-cols-4 gap-x-[14px] gap-y-7 max-[1100px]:w-full max-[1100px]:grid-cols-3 max-[850px]:grid-cols-2 max-sm:grid-cols-1"
              >
                <div data-testid="project-grid-item" className="min-w-0">
                  <button
                    type="button"
                    data-testid="start-create"
                    data-grid-kind="create"
                    disabled={Boolean(pendingAction)}
                    onClick={createProject}
                    className="group w-full text-left disabled:cursor-wait disabled:opacity-60"
                  >
                    <span className="flex h-[120px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-[#292929] text-white/80 transition-colors group-hover:border-white/[0.18] group-hover:bg-[#2d2d2d]">
                      <IconPlus size={24} className="text-white/40" />
                      <span className="text-[14px] font-medium">开始创作</span>
                    </span>
                    <span className="mt-2 block text-[12px] leading-5 text-white/48">创建新的视频项目</span>
                  </button>
                </div>

                {visibleFolders.map((folder) => (
                  <div key={folder.id} data-testid="project-grid-item" className="min-w-0">
                    <FolderCard
                      folder={folder}
                      renaming={renamingId === folder.id}
                      onOpen={() => setOpenFolderId(folder.id)}
                      onRenameCancel={() => setRenamingId(null)}
                      onRenameCommit={(name) => void commitRename('folder', folder, name)}
                      onMenu={(event) => {
                        if (pendingAction) return
                        setMenuTarget({ kind: 'folder', id: folder.id })
                        menu.openFrom(event, 'point')
                      }}
                    />
                  </div>
                ))}

                {visibleProjects.map((project) => (
                  <div key={project.id} data-testid="project-grid-item" className="min-w-0">
                    <ProjectCard
                      project={project}
                      renaming={renamingId === project.id}
                      onRenameCancel={() => setRenamingId(null)}
                      onRenameCommit={(name) => void commitRename('project', project, name)}
                      onMenu={(event) => {
                        if (pendingAction) return
                        setMenuTarget({ kind: 'project', id: project.id })
                        menu.openFrom(event, 'point')
                      }}
                    />
                  </div>
                ))}
              </div>

              {emptyState && (
                <div
                  data-testid="project-empty-state"
                  className="flex w-4/5 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/[0.09] bg-[#151515] px-6 py-12 text-center max-[1100px]:w-full"
                >
                  <span className="text-white/24">
                    {emptyState.kind === 'search' ? <span aria-hidden="true" className="text-2xl">⌕</span> : <IconFolder size={30} />}
                  </span>
                  <h2 className="text-[14px] font-medium text-white/70">{emptyState.title}</h2>
                  <p className="text-[12px] text-white/38">
                    {emptyState.kind === 'search'
                      ? `试试其他关键词，或清除「${query.trim()}」`
                      : emptyState.kind === 'folder'
                        ? '把项目移入此文件夹，或直接开始创作'
                        : '从一个空白画布开始，建立你的第一个视频项目'}
                  </p>
                  {emptyState.kind === 'search' ? (
                    <button
                      type="button"
                      data-testid="project-clear-search"
                      onClick={() => setQuery('')}
                      className="mt-1 rounded-lg border border-white/[0.12] px-3 py-1.5 text-[12px] text-white/68 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60c9ef]"
                    >
                      清除搜索
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void createProject()}
                      disabled={Boolean(pendingAction)}
                      className="mt-1 rounded-lg bg-[#60c9ef] px-3 py-1.5 text-[12px] font-medium text-[#10202a] transition-colors hover:bg-[#72d2f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60c9ef] disabled:cursor-wait disabled:opacity-50"
                    >
                      {emptyState.kind === 'folder' ? '在此文件夹创建项目' : '开始第一个项目'}
                    </button>
                  )}
                </div>
              )}

              <div className="w-4/5 pt-4 max-[1100px]:w-full">
                <p
                  data-testid="project-search-feedback"
                  role="status"
                  aria-live="polite"
                  className="min-h-4 text-center text-[11px] text-white/35"
                >
                  {emptyState
                    ? emptyState.title
                    : query.trim()
                      ? `搜索“${query.trim()}” · ${visibleItemCount} 个结果`
                      : `当前显示 ${visibleItemCount} 个${visibleItemLabel}`}
                  {refreshing && <span> · 更新中…</span>}
                </p>
                {loadError && (
                  <div
                    role="alert"
                    data-testid="project-refresh-error"
                    className="mt-2 flex flex-wrap items-center justify-center gap-2 text-[12px] text-[#ff9a9a]"
                  >
                    <span>{loadError}</span>
                    <button
                      type="button"
                      data-testid="project-retry"
                      onClick={() => void refresh()}
                      className="rounded-md border border-[#ff9a9a]/35 px-2 py-1 text-[11px] transition-colors hover:bg-[#ff9a9a]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60c9ef]"
                    >
                      重试
                    </button>
                  </div>
                )}
                {feedback && (
                  <p
                    role={feedback.tone === 'error' ? 'alert' : 'status'}
                    data-testid="project-operation-feedback"
                    className={feedback.tone === 'error' ? 'mt-2 text-center text-[12px] text-[#ff9a9a]' : 'mt-2 text-center text-[12px] text-[#8bd8a8]'}
                  >
                    {feedback.message}
                  </p>
                )}
                {!emptyState && visibleItemCount > 0 && (
                  <p className="pt-6 text-center text-[12px] text-white/30">没有更多了</p>
                )}
              </div>
            </>
          )}
        </section>

        {menu.anchor && menuTarget && (selectedProject || selectedFolder) && (
          <Menu
            anchor={menu.anchor}
            onClose={() => {
              menu.close()
              setMenuTarget(null)
            }}
            width={176}
            sections={selectedProject ? projectMenu(selectedProject) : folderMenu(selectedFolder as FolderRow)}
          />
        )}

        <RecycleBinDialog open={recycleBinOpen} onClose={() => setRecycleBinOpen(false)} />

        <ConfirmDialog
          open={Boolean(deleteProject)}
          title="删除项目"
          description={`确定删除「${deleteProject?.name}」吗？该项目下的画布会一并删除。`}
          confirmLabel="删除"
          danger
          onClose={() => setDeleteProject(null)}
          onConfirm={async () => {
            if (!deleteProject) return
            const completed = await runAction('delete-project', '项目已移入回收站', async () => {
              await api.del(`/api/projects/${deleteProject.id}`)
              await refreshOrThrow()
            })
            if (completed) setDeleteProject(null)
          }}
        />

        <ConfirmDialog
          open={Boolean(deleteFolder)}
          title="删除文件夹"
          description={
            <>
              <p>
                删除「{deleteFolder?.name}」会同时永久删除其中的 {deleteFolder?.projectCount} 个项目，此操作不可恢复。
              </p>
              <p className="text-ink-500">请输入完整文件夹名以确认：</p>
            </>
          }
          confirmLabel="永久删除"
          danger
          requireExactText={deleteFolder?.name}
          inputValue={folderConfirmText}
          onInputChange={setFolderConfirmText}
          onClose={() => {
            setDeleteFolder(null)
            setFolderConfirmText('')
          }}
          onConfirm={async () => {
            if (!deleteFolder) return
            const completed = await runAction('delete-folder', '文件夹已删除', async () => {
              await api.del(`/api/folders/${deleteFolder.id}?confirmName=${encodeURIComponent(folderConfirmText)}`)
              await refreshOrThrow()
            })
            if (completed) {
              setDeleteFolder(null)
              setFolderConfirmText('')
            }
          }}
        />
    </div>
  )
}

export function ProjectListPage() {
  return (
    <AuthenticatedShell>
      <ProjectListSurface />
    </AuthenticatedShell>
  )
}
