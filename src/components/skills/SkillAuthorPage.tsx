'use client'

import Link from 'next/link'
import { SkillAuthorStudio } from './SkillAuthorStudio'

/**
 * Observed LibTV-compatible authoring address. The workbench keeps the same
 * typed local aggregate as the market entry, so deep links never bypass the
 * create → edit → review → publish lifecycle.
 */
export function SkillAuthorPage() {
  return (
    <main
      data-testid="skill-author-page"
      className="min-h-screen bg-[#111] px-4 py-5 text-white sm:px-8"
      aria-label="Skill 作者页"
    >
      <header className="mx-auto flex max-w-[1120px] items-center justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#60c9ef]">Skill authoring</p>
          <h1 className="mt-1 text-[20px] font-medium text-white">创建 Skill</h1>
          <p className="mt-1 text-[12px] text-white/50">本地 fixture 工作台：创建、编辑、版本、审核、发布与下架。</p>
        </div>
        <Link
          href="/skill"
          className="rounded-lg border border-white/[0.12] px-3 py-2 text-[12px] text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white"
        >
          返回 Skill 市场
        </Link>
      </header>
      <div className="mx-auto mt-12 max-w-[1120px] rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 text-[13px] text-white/55">
        作者工作台已打开。草稿通过本地审核后，发布版本才会投影到“我的”。
      </div>
      <SkillAuthorStudio initiallyOpen onPublished={() => undefined} />
    </main>
  )
}
