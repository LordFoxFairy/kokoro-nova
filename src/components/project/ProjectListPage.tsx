'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { AuthenticatedShell } from '@/components/shell/AuthenticatedShell'
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
import { api } from '@/lib/api'
import { FolderCard, ProjectCard, type FolderRow, type ProjectRow } from './ProjectCard'
import { ProjectToolbar } from './ProjectToolbar'
import { RecycleBinDialog } from './RecycleBinDialog'

export function ProjectListPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [folders, setFolders] = useState<FolderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [openFolderId, setOpenFolderId] = useState<string | null>(null)
  const [recycleBinOpen, setRecycleBinOpen] = useState(false)

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

  const openFolder = folders.find((folder) => folder.id === openFolderId) ?? null
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
  const visibleProjects = useMemo(
    () =>
      projects.filter(
        (project) =>
          project.folderId === (openFolderId ?? null) &&
          (!normalizedQuery || project.name.toLocaleLowerCase('zh-CN').includes(normalizedQuery)),
      ),
    [normalizedQuery, openFolderId, projects],
  )
  const visibleFolders = useMemo(
    () =>
      openFolderId
        ? []
        : folders.filter(
            (folder) => !normalizedQuery || folder.name.toLocaleLowerCase('zh-CN').includes(normalizedQuery),
          ),
    [folders, normalizedQuery, openFolderId],
  )

  const projectMenu = (project: ProjectRow): MenuSection[] => [
    {
      items: [
        { id: 'open', label: '打开', onSelect: () => router.push(`/canvas?projectId=${project.id}`) },
        { id: 'rename', label: '重命名', icon: <IconRename size={14} />, onSelect: () => setRenamingId(project.id) },
        {
          id: 'cover',
          label: '修改封面',
          icon: <IconImage size={14} />,
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

  const selectedProject = menuTarget?.kind === 'project' ? projects.find((item) => item.id === menuTarget.id) : null
  const selectedFolder = menuTarget?.kind === 'folder' ? folders.find((item) => item.id === menuTarget.id) : null

  return (
    <AuthenticatedShell>
      <div className="min-h-[calc(100vh-106px)] bg-[#111]">
        <ProjectToolbar
          title={openFolder?.name ?? '全部项目'}
          inFolder={Boolean(openFolder)}
          query={query}
          onQueryChange={setQuery}
          onBackFromFolder={() => setOpenFolderId(null)}
          onOpenRecycleBin={() => setRecycleBinOpen(true)}
          onCreateFolder={async () => {
            await api.post('/api/folders')
            await refresh()
          }}
        />

        <section aria-label="项目列表" className="px-10 pb-16 pt-[26px]">
          {loading ? (
            <div className="flex w-4/5 justify-center py-20 text-white/35">
              <Spinner size={22} />
            </div>
          ) : (
            <>
              <div data-testid="project-grid" className="grid w-4/5 grid-cols-4 gap-x-[14px] gap-y-7">
                <div data-testid="project-grid-item" className="min-w-0">
                  <button
                    type="button"
                    data-testid="start-create"
                    data-grid-kind="create"
                    onClick={createProject}
                    className="group w-full text-left"
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
                      onRenameCommit={async (name) => {
                        setRenamingId(null)
                        if (name === folder.name) return
                        await api.patch(`/api/folders/${folder.id}`, { name })
                        await refresh()
                      }}
                      onMenu={(event) => {
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
                      onRenameCommit={async (name) => {
                        setRenamingId(null)
                        if (name === project.name) return
                        await api.patch(`/api/projects/${project.id}`, { name })
                        await refresh()
                      }}
                      onMenu={(event) => {
                        setMenuTarget({ kind: 'project', id: project.id })
                        menu.openFrom(event, 'point')
                      }}
                    />
                  </div>
                ))}
              </div>

              {visibleProjects.length === 0 && visibleFolders.length === 0 && normalizedQuery && (
                <p className="w-4/5 pt-12 text-center text-[12px] text-white/32">没有匹配的项目</p>
              )}
              {(visibleProjects.length > 0 || visibleFolders.length > 0) && (
                <p className="w-4/5 pt-10 text-center text-[12px] text-white/30">没有更多了</p>
              )}
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
