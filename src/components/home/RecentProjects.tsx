import Link from 'next/link'

import { IconImage } from '@/components/icons'
import type { HomeDiscoveryResponse } from '@/contracts/home'

type RecentProjectsProps = {
  projects: HomeDiscoveryResponse['recentProjects']
}

function compactDate(value: string) {
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function RecentProjects({ projects }: RecentProjectsProps) {
  return (
    <section aria-labelledby="recent-projects-title" className="mt-[26px]">
      <div className="flex h-7 items-center justify-between px-2">
        <h2 id="recent-projects-title" className="text-[18px] font-semibold tracking-tight text-white">最近项目</h2>
        <Link href="/project" className="flex items-center gap-2 text-[12px] text-white/76 transition-colors hover:text-white">
          查看全部 <span aria-hidden="true">›</span>
        </Link>
      </div>
      <div className="mt-[14px] grid w-full max-w-[838px] grid-cols-3 gap-2.5">
        {projects.map((project) => (
          <Link
            key={project.id}
            href={`/canvas?projectId=${encodeURIComponent(project.id)}`}
            data-testid="home-recent-project"
            className="group flex h-[90px] min-w-0 items-center overflow-hidden rounded-[22px] border border-white/[0.1] bg-[#151515] p-1 transition-colors hover:border-white/[0.18] hover:bg-[#191919]"
          >
            <span className="flex h-[80px] w-[100px] shrink-0 items-center justify-center overflow-hidden rounded-[18px] bg-[#252525] text-white/26">
              {project.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={project.coverUrl} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
              ) : (
                <IconImage size={25} />
              )}
            </span>
            <span className="min-w-0 px-3">
              <strong className="block truncate text-[14px] font-medium text-white/90">{project.name}</strong>
              <span className="mt-1.5 block text-[12px] text-white/38">{compactDate(project.updatedAt)}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
