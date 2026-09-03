'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { client } from '@/api/client'
import { AuthenticatedShell, useHomeDiscovery } from '@/components/shell/AuthenticatedShell'
import type { HomeDiscoveryResponse } from '@/contracts/home'
import { CreatorToolGrid } from './CreatorToolGrid'
import { HomeAgentComposer } from './HomeAgentComposer'
import { RecentProjects } from './RecentProjects'
import { TvShowFeed } from './TvShowFeed'

type CreatorTool = HomeDiscoveryResponse['creatorTools'][number]

function HomeLoading() {
  return (
    <div aria-busy="true" aria-label="正在加载首页" className="px-10 pb-20 pt-2">
      <div className="aspect-[8/1] w-full animate-pulse rounded-[24px] bg-white/[0.045]" />
      <div className="mt-6 h-[200px] animate-pulse rounded-xl bg-white/[0.035]" />
    </div>
  )
}

function HomeSurface() {
  const router = useRouter()
  const home = useHomeDiscovery()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createAndOpen = async (brief?: string, preferredName?: string) => {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const name = preferredName ?? (brief ? brief.replace(/^\[[^\]]+]\s*/, '').slice(0, 18) : undefined)
      const { project, canvas } = await client.projects.create({ name })
      const query = new URLSearchParams({ projectId: project.id, canvasId: canvas.id })
      if (brief) query.set('brief', brief)
      router.push(`/canvas?${query.toString()}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '创建项目失败，请重试')
      setSubmitting(false)
    }
  }

  const startTool = (tool: CreatorTool) => {
    void createAndOpen(`[${tool.intent}] ${tool.title}：${tool.description}`, tool.title)
  }

  if (!home) return <HomeLoading />

  return (
    <div className="px-10 pb-4 pt-2">
      <section aria-label="当前活动" className="aspect-[8/1] w-full overflow-hidden rounded-[24px] bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          data-testid="home-campaign-image"
          src={home.campaign.imageUrl}
          alt="一场戏的诞生，从一个灵感到一场戏"
          className="h-full w-full object-cover"
        />
      </section>

      <div className="mt-6">
        <CreatorToolGrid
          tools={home.creatorTools}
          disabled={submitting}
          onBlank={() => void createAndOpen()}
          onTool={startTool}
        />
      </div>

      <RecentProjects projects={home.recentProjects} />

      <HomeAgentComposer
        skills={home.featuredSkills}
        submitting={submitting}
        onSubmit={(brief) => void createAndOpen(brief)}
      />

      {error && <p role="alert" className="mt-3 text-center text-[12px] text-[#ff7d7d]">{error}</p>}

      <TvShowFeed categories={home.showcaseCategories} items={home.showcase} />
    </div>
  )
}

export function HomePage() {
  return (
    <AuthenticatedShell>
      <HomeSurface />
    </AuthenticatedShell>
  )
}
