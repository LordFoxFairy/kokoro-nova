import Link from 'next/link'

import { IconChevronLeft, IconFolderPlus, IconSearch, IconTrash } from '@/components/icons'

type ProjectToolbarProps = {
  title: string
  inFolder: boolean
  query: string
  onQueryChange: (value: string) => void
  onBackFromFolder: () => void
  onOpenRecycleBin: () => void
  onCreateFolder: () => void
}

export function ProjectToolbar({
  title,
  inFolder,
  query,
  onQueryChange,
  onBackFromFolder,
  onOpenRecycleBin,
  onCreateFolder,
}: ProjectToolbarProps) {
  return (
    <header data-testid="project-toolbar" className="flex h-[54px] items-center justify-between px-10">
      <div className="flex items-center gap-3">
        {inFolder ? (
          <button
            type="button"
            data-toolbar-item="back"
            onClick={onBackFromFolder}
            className="flex items-center gap-1 text-[12px] text-white/65 transition-colors hover:text-white"
          >
            <IconChevronLeft size={14} /> 返回
          </button>
        ) : (
          <Link
            href="/"
            data-toolbar-item="back"
            className="flex items-center gap-1 text-[12px] text-white/65 transition-colors hover:text-white"
          >
            <IconChevronLeft size={14} /> 返回
          </Link>
        )}
        <span aria-hidden="true" className="h-5 w-px bg-white/[0.12]" />
        <h1 data-toolbar-item="title" className="text-[16px] font-semibold text-white/92">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        <label
          data-toolbar-item="search"
          className="flex h-8 w-[200px] items-center gap-2 rounded-lg border border-white/[0.1] bg-[#151515] px-3 text-white/34 focus-within:border-white/20"
        >
          <IconSearch size={15} />
          <input
            type="search"
            aria-label="搜索项目"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索项目"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-white/82 outline-none placeholder:text-white/28"
          />
        </label>
        <button
          type="button"
          data-toolbar-item="recycle-bin"
          aria-label="回收站"
          onClick={onOpenRecycleBin}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#222] px-3 text-[12px] text-white/72 transition-colors hover:bg-[#292929] hover:text-white"
        >
          <IconTrash size={14} /> 回收站
        </button>
        {!inFolder && (
          <button
            type="button"
            data-toolbar-item="new-folder"
            data-testid="new-folder"
            onClick={onCreateFolder}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#222] px-3 text-[12px] text-white/76 transition-colors hover:bg-[#292929] hover:text-white"
          >
            <IconFolderPlus size={14} /> 新建文件夹
          </button>
        )}
      </div>
    </header>
  )
}
