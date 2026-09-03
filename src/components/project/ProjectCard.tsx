import type { MouseEvent } from 'react'
import Link from 'next/link'

import type { Folder, Project } from '@/domain/types'
import { IconFolder, IconImage, IconMore } from '@/components/icons'
import { InlineRename } from '@/components/ui/controls'

export type ProjectRow = Project & { canvasCount: number }
export type FolderRow = Folder & { projectCount: number }

function compactDate(value: string) {
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

type ProjectCardProps = {
  project: ProjectRow
  renaming: boolean
  onRenameCancel: () => void
  onRenameCommit: (name: string) => void
  onMenu: (event: MouseEvent<HTMLButtonElement>) => void
}

export function ProjectCard({ project, renaming, onRenameCancel, onRenameCommit, onMenu }: ProjectCardProps) {
  return (
    <article
      data-testid={`project-card-${project.id}`}
      data-grid-kind="project"
      className="group w-full"
    >
      <Link
        href={`/canvas?projectId=${encodeURIComponent(project.id)}`}
        className="flex h-[120px] w-full items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] bg-[#292929] text-white/20 transition-colors hover:border-white/[0.17]"
      >
        {project.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={project.coverUrl} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.025]" />
        ) : (
          <IconImage size={41} />
        )}
      </Link>
      <div className="mt-2 flex min-w-0 items-start gap-1">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <InlineRename
              value={project.name}
              testId="project-rename-input"
              onCancel={onRenameCancel}
              onCommit={onRenameCommit}
            />
          ) : (
            <h2 className="truncate text-[13px] font-medium leading-5 text-white/88">{project.name}</h2>
          )}
          <p className="mt-0.5 text-[11px] leading-4 text-white/36">{compactDate(project.updatedAt)}</p>
        </div>
        <button
          type="button"
          aria-label="项目操作"
          data-testid={`project-more-${project.id}`}
          onClick={onMenu}
          className="mt-0.5 rounded p-0.5 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/80"
        >
          <IconMore size={15} />
        </button>
      </div>
    </article>
  )
}

type FolderCardProps = {
  folder: FolderRow
  renaming: boolean
  onOpen: () => void
  onRenameCancel: () => void
  onRenameCommit: (name: string) => void
  onMenu: (event: MouseEvent<HTMLButtonElement>) => void
}

export function FolderCard({ folder, renaming, onOpen, onRenameCancel, onRenameCommit, onMenu }: FolderCardProps) {
  return (
    <article data-testid={`folder-card-${folder.id}`} data-grid-kind="folder" className="group w-full">
      <button
        type="button"
        onClick={onOpen}
        className="flex h-[120px] w-full items-center justify-center rounded-xl border border-white/[0.08] bg-[#242424] text-white/24 transition-colors hover:border-white/[0.17] hover:bg-[#292929]"
      >
        <IconFolder size={40} />
      </button>
      <div className="mt-2 flex min-w-0 items-start gap-1">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <InlineRename
              value={folder.name}
              testId="folder-rename-input"
              onCancel={onRenameCancel}
              onCommit={onRenameCommit}
            />
          ) : (
            <h2 className="truncate text-[13px] font-medium leading-5 text-white/88">{folder.name}</h2>
          )}
          <p className="mt-0.5 text-[11px] leading-4 text-white/36">{folder.projectCount} 个项目</p>
        </div>
        <button
          type="button"
          aria-label="文件夹操作"
          data-testid={`folder-more-${folder.id}`}
          onClick={onMenu}
          className="mt-0.5 rounded p-0.5 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/80"
        >
          <IconMore size={15} />
        </button>
      </div>
    </article>
  )
}
