'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Canvas, Folder, Project } from '@/domain/types'
import { api } from '@/lib/api'
import { Menu, useMenuAnchor, type MenuSection } from '../ui/Menu'
import { ConfirmDialog } from '../ui/Dialog'
import { EmptyState, InlineRename, Spinner } from '../ui/controls'
import { AuthenticatedShell } from '../shell/AuthenticatedShell'
import {
  IconChevronLeft,
  IconCopy,
  IconFolder,
  IconFolderPlus,
  IconImage,
  IconMore,
  IconPlus,
  IconRename,
  IconTrash,
} from '../icons'

type ProjectRow = Project & { canvasCount: number }
type FolderRow = Folder & { projectCount: number }

/**
 * Project list.
 *
 * Object-first navigation: the card is the stable place, and create/copy/move/
 * delete stay contextual actions on it. Destructive actions escalate — deleting
 * a project asks once; deleting a folder requires typing its exact name because
 * it takes the projects inside with it.
 */
export function ProjectListPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [folders, setFolders] = useState<FolderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [openFolderId, setOpenFolderId] = useState<string | null>(null)

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [menuTarget, setMenuTarget] = useState<{ kind: 'project' | 'folder'; id: string } | null>(null)
  const [deleteProject, setDeleteProject] = useState<ProjectRow | null>(null)
  const [deleteFolder, setDeleteFolder] = useState<FolderRow | null>(null)
  const [folderConfirmText, setFolderConfirmText] = useState('')

  const menu = useMenuAnchor()

  const refresh = useCallback(async () => {
    const data = await api.get<{ projects: ProjectRow[]; folders: FolderRow[]; balance: number }>('/api/projects')
    setProjects(data.projects)
    setFolders(data.folders)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const createProject = async () => {
    const { project, canvas } = await api.post<{ project: Project; canvas: Canvas }>('/api/projects', {
      folderId: openFolderId,
    })
    router.push(`/canvas?projectId=${project.id}&canvasId=${canvas.id}`)
  }

  const openFolder = folders.find((f) => f.id === openFolderId) ?? null
  const visibleProjects = projects.filter((p) => p.folderId === (openFolderId ?? null))

  const projectMenu = (project: ProjectRow): MenuSection[] => [
    {
      items: [
        { id: 'open', label: '打开', onSelect: () => router.push(`/canvas?projectId=${project.id}`) },
        { id: 'rename', label: '重命名', icon: <IconRename size={14} />, onSelect: () => setRenamingId(project.id) },
        {
          id: 'cover',
          label: '修改封面',
          icon: <IconImage size={14} />,
          // Opens the OS file picker directly — there is no in-app layer here.
          onSelect: () => {
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = 'image/*'
            input.click()
          },
        },
        {
          id: 'duplicate',
          label: '创建副本',
          icon: <IconCopy size={14} />,
          onSelect: async () => {
            await api.put(`/api/projects/${project.id}`)
            await refresh()
          },
        },
        {
          id: 'move',
          label: '移动至文件夹',
          icon: <IconFolder size={14} />,
          submenu:
            folders.length > 0
              ? folders.map((folder) => ({
                  id: folder.id,
                  label: folder.name,
                  onSelect: async () => {
                    await api.patch(`/api/projects/${project.id}`, { folderId: folder.id })
                    await refresh()
                  },
                }))
              : [{ id: 'empty', label: '暂无文件夹', disabled: true, onSelect: () => undefined }],
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
        { id: 'rename', label: '重命名', icon: <IconRename size={14} />, onSelect: () => setRenamingId(folder.id) },
        {
          id: 'cover',
          label: '更换封面',
          icon: <IconImage size={14} />,
          onSelect: () => {
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = 'image/*'
            input.click()
          },
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

  return (
    <AuthenticatedShell>
      <div className="min-h-[calc(100vh-106px)] bg-surface">
      <div className="flex items-center justify-between px-8 pb-5">
        <div className="flex items-center gap-3">
          {openFolder ? (
            <>
              <button
                type="button"
                onClick={() => setOpenFolderId(null)}
                className="flex items-center gap-1 text-[13px] text-ink-500 transition-colors hover:text-ink-900"
              >
                <IconChevronLeft size={15} /> 全部项目
              </button>
              <span className="h-4 w-px bg-ink-200" />
              <h1 className="text-[17px] font-semibold text-ink-900">{openFolder.name}</h1>
            </>
          ) : (
            <h1 className="text-[17px] font-semibold text-ink-900">全部项目</h1>
          )}
        </div>
        {!openFolder && (
          <button
            type="button"
            data-testid="new-folder"
            onClick={async () => {
              await api.post('/api/folders')
              await refresh()
            }}
            className="flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2 text-[13px] text-ink-700 transition-colors hover:bg-ink-50"
          >
            <IconFolderPlus size={15} /> 新建文件夹
          </button>
        )}
      </div>

      <div className="px-8 pb-16">
        {loading ? (
          <div className="flex justify-center py-20 text-ink-400">
            <Spinner size={22} />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-x-6 gap-y-7">
              {/* Start-create tile */}
              <button
                type="button"
                data-testid="start-create"
                onClick={createProject}
                className="group flex flex-col"
              >
                <span className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-accent-soft to-ink-50 ring-1 ring-accent/25 transition-shadow group-hover:shadow-[var(--shadow-float)]">
                  <IconPlus size={26} className="text-accent-ink" />
                  <span className="text-[13px] font-medium text-accent-ink">开始创作</span>
                </span>
                <span className="mt-2.5 text-left text-[13px] text-ink-500">创建新的视频项目</span>
              </button>

              {/* Folders */}
              {!openFolder &&
                folders.map((folder) => (
                  <div key={folder.id} className="group flex flex-col">
                    <button
                      type="button"
                      onClick={() => setOpenFolderId(folder.id)}
                      className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl bg-ink-100 transition-shadow group-hover:shadow-[var(--shadow-float)]"
                    >
                      <IconFolder size={38} className="text-ink-300" />
                    </button>
                    <div className="mt-2.5 flex items-start gap-1.5">
                      <div className="min-w-0 flex-1">
                        {renamingId === folder.id ? (
                          <InlineRename
                            value={folder.name}
                            testId="folder-rename-input"
                            onCancel={() => setRenamingId(null)}
                            onCommit={async (name) => {
                              setRenamingId(null)
                              if (name === folder.name) return
                              await api.patch(`/api/folders/${folder.id}`, { name })
                              await refresh()
                            }}
                          />
                        ) : (
                          <div className="truncate text-[13px] text-ink-900">{folder.name}</div>
                        )}
                        <div className="text-[12px] text-ink-400">{folder.projectCount} 个项目</div>
                      </div>
                      <button
                        type="button"
                        aria-label="文件夹操作"
                        data-testid={`folder-more-${folder.id}`}
                        onClick={(e) => {
                          setMenuTarget({ kind: 'folder', id: folder.id })
                          menu.openFrom(e, 'point')
                        }}
                        className="rounded p-0.5 text-ink-400 opacity-0 transition-opacity hover:bg-ink-100 group-hover:opacity-100"
                      >
                        <IconMore size={15} />
                      </button>
                    </div>
                  </div>
                ))}

              {/* Projects */}
              {visibleProjects.map((project) => (
                <div key={project.id} className="group flex flex-col" data-testid={`project-card-${project.id}`}>
                  <Link
                    href={`/canvas?projectId=${project.id}`}
                    className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-2xl bg-ink-100 transition-shadow group-hover:shadow-[var(--shadow-float)]"
                  >
                    {project.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={project.coverUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <IconImage size={34} className="text-ink-300" />
                    )}
                  </Link>
                  <div className="mt-2.5 flex items-start gap-1.5">
                    <div className="min-w-0 flex-1">
                      {renamingId === project.id ? (
                        <InlineRename
                          value={project.name}
                          testId="project-rename-input"
                          onCancel={() => setRenamingId(null)}
                          onCommit={async (name) => {
                            setRenamingId(null)
                            if (name === project.name) return
                            await api.patch(`/api/projects/${project.id}`, { name })
                            await refresh()
                          }}
                        />
                      ) : (
                        <div className="truncate text-[13px] text-ink-900">{project.name}</div>
                      )}
                      <div className="text-[12px] text-ink-400">
                        {new Date(project.updatedAt).toLocaleDateString('zh-CN')}
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label="项目操作"
                      data-testid={`project-more-${project.id}`}
                      onClick={(e) => {
                        setMenuTarget({ kind: 'project', id: project.id })
                        menu.openFrom(e, 'point')
                      }}
                      className="rounded p-0.5 text-ink-400 opacity-0 transition-opacity hover:bg-ink-100 group-hover:opacity-100"
                    >
                      <IconMore size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {visibleProjects.length === 0 && (
              <EmptyState title="暂无项目" description="点击「开始创作」创建第一个视频项目。" />
            )}
            {visibleProjects.length > 0 && (
              <div className="pt-14 text-center text-[13px] text-ink-300">没有更多了</div>
            )}
          </>
        )}
      </div>

      {menu.anchor && menuTarget && (
        <Menu
          anchor={menu.anchor}
          onClose={() => {
            menu.close()
            setMenuTarget(null)
          }}
          width={176}
          sections={
            menuTarget.kind === 'project'
              ? projectMenu(projects.find((p) => p.id === menuTarget.id) as ProjectRow)
              : folderMenu(folders.find((f) => f.id === menuTarget.id) as FolderRow)
          }
        />
      )}

      <ConfirmDialog
        open={Boolean(deleteProject)}
        title="删除项目"
        description={`确定删除「${deleteProject?.name}」吗？该项目下的画布会一并删除。`}
        confirmLabel="删除"
        danger
        onClose={() => setDeleteProject(null)}
        onConfirm={async () => {
          if (!deleteProject) return
          await api.del(`/api/projects/${deleteProject.id}`)
          setDeleteProject(null)
          await refresh()
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
        onClose={() => setDeleteFolder(null)}
        onConfirm={async () => {
          if (!deleteFolder) return
          await api.del(`/api/folders/${deleteFolder.id}?confirmName=${encodeURIComponent(folderConfirmText)}`)
          setDeleteFolder(null)
          setFolderConfirmText('')
          await refresh()
        }}
      />
      </div>
    </AuthenticatedShell>
  )
}
