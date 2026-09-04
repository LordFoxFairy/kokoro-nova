import Link from 'next/link'

import { IconChevronLeft, IconFolderPlus, IconSearch, IconTrash } from '@/components/icons'

type ProjectToolbarProps = {
  title: string
  inFolder: boolean
  query: string
  onQueryChange: (value: string) => void
  onClearQuery?: () => void
  onBackFromFolder: () => void
  onOpenRecycleBin: () => void
  onCreateFolder: () => void
  disabled?: boolean
}

export function ProjectToolbar({
  title,
  inFolder,
  query,
  onQueryChange,
  onClearQuery,
  onBackFromFolder,
  onOpenRecycleBin,
  onCreateFolder,
  disabled = false,
}: ProjectToolbarProps) {
  const clearQuery = onClearQuery ?? (() => onQueryChange(''))

  return (
    <header
      data-testid="project-toolbar"
      className="flex h-[54px] min-w-0 flex-wrap items-center justify-between gap-4 pl-[53px] pr-10 max-[1100px]:h-auto max-[1100px]:min-h-[54px] max-[1100px]:gap-2 max-[1100px]:px-4 max-[1100px]:py-2"
    >
      <div className="flex min-w-0 flex-1 basis-[220px] items-center gap-4 max-[1100px]:basis-full">
        {inFolder ? (
          <button
            type="button"
            data-toolbar-item="back"
            onClick={onBackFromFolder}
            disabled={disabled}
            className="flex shrink-0 items-center gap-1 rounded-md text-[12px] text-white/65 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60c9ef] disabled:cursor-wait disabled:opacity-50"
          >
            <IconChevronLeft size={14} /> 返回
          </button>
        ) : (
          <Link
            href="/"
            data-toolbar-item="back"
            className="flex shrink-0 items-center gap-1 rounded-md text-[12px] text-white/65 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60c9ef]"
          >
            <IconChevronLeft size={14} /> 返回
          </Link>
        )}
        <span aria-hidden="true" className="h-5 w-px bg-white/[0.12]" />
        <h1 data-toolbar-item="title" className="truncate text-[16px] font-semibold text-white/92">{title}</h1>
      </div>

      <div className="flex min-w-0 shrink-0 items-center gap-2 max-[1100px]:w-full max-[1100px]:flex-wrap max-[1100px]:justify-end">
        <label
          data-toolbar-item="search"
          className="flex h-8 w-[200px] min-w-0 items-center gap-2 rounded-lg border border-white/[0.1] bg-[#151515] px-3 text-white/34 transition-colors focus-within:border-white/20 max-[1100px]:flex-1 max-[640px]:basis-full max-[640px]:w-full max-[640px]:flex-none"
        >
          <IconSearch size={15} />
          <input
            type="search"
            aria-label="搜索项目"
            aria-keyshortcuts="Escape"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Escape' || !query.trim()) return
              event.preventDefault()
              clearQuery()
            }}
            placeholder="搜索项目"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-white/82 outline-none placeholder:text-white/28"
          />
          {query && (
            <button
              type="button"
              aria-label="清除项目搜索"
              onMouseDown={(event) => event.preventDefault()}
              onClick={clearQuery}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[13px] text-white/45 transition-colors hover:bg-white/[0.1] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60c9ef]"
            >
              ×
            </button>
          )}
        </label>
        <button
          type="button"
          data-toolbar-item="recycle-bin"
          aria-label="回收站"
          onClick={onOpenRecycleBin}
          disabled={disabled}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#222] px-3 text-[12px] text-white/72 transition-colors hover:bg-[#292929] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60c9ef] disabled:cursor-wait disabled:opacity-50 max-sm:px-2"
        >
          <IconTrash size={14} /> 回收站
        </button>
        {!inFolder && (
          <button
            type="button"
            data-toolbar-item="new-folder"
            data-testid="new-folder"
            onClick={onCreateFolder}
            disabled={disabled}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#222] px-3 text-[12px] text-white/76 transition-colors hover:bg-[#292929] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60c9ef] disabled:cursor-wait disabled:opacity-50 max-sm:px-2"
          >
            <IconFolderPlus size={14} /> 新建文件夹
          </button>
        )}
      </div>
    </header>
  )
}
