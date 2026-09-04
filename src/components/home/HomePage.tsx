'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { client } from '@/api/client'
import { AuthenticatedShell, useHomeDiscovery, useHomeDiscoveryState } from '@/components/shell/AuthenticatedShell'
import type { HomeDiscoveryResponse } from '@/contracts/home'
import { Dialog } from '@/components/ui/Dialog'
import { CreatorToolGrid } from './CreatorToolGrid'
import { buildHomeAgentBrief, HomeAgentComposer, type HomeAgentRequest } from './HomeAgentComposer'
import { RecentProjects } from './RecentProjects'
import { TvShowFeed } from './TvShowFeed'

type CreatorTool = HomeDiscoveryResponse['creatorTools'][number]

function HomeLoading() {
  return (
    <div aria-busy="true" aria-label="正在加载首页" className="min-w-0 px-10 pb-20 pt-2 max-[1100px]:px-6 max-[850px]:px-4">
      <div className="aspect-[8/1] w-full animate-pulse rounded-[24px] bg-white/[0.045]" />
      <div className="mt-6 h-[200px] animate-pulse rounded-xl bg-white/[0.035]" />
    </div>
  )
}

function HomeLoadError({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <div
      role="alert"
      data-testid="home-load-error"
      className="mx-10 flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-2xl border border-white/[0.08] bg-[#171717] px-6 text-center max-[1100px]:mx-6 max-[850px]:mx-4"
    >
      <span className="text-2xl text-white/25" aria-hidden="true">⌁</span>
      <div>
        <h1 className="text-[15px] font-medium text-white/78">首页暂时无法加载</h1>
        <p className="mt-1 text-[12px] text-white/40">{message ?? '请稍后重试'}</p>
      </div>
      <button
        type="button"
        data-testid="home-retry"
        onClick={onRetry}
        className="rounded-lg border border-white/[0.12] px-3 py-1.5 text-[12px] text-white/72 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60c9ef]"
      >
        重试
      </button>
    </div>
  )
}

function HomeSurface() {
  const router = useRouter()
  const home = useHomeDiscovery()
  const { status: homeStatus, error: homeError, retry, publicMode } = useHomeDiscoveryState()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loginPromptOpen, setLoginPromptOpen] = useState(false)

  const createAndOpen = async (request?: HomeAgentRequest, preferredName?: string) => {
    if (submitting) return
    if (publicMode) {
      setLoginPromptOpen(true)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const brief = request ? buildHomeAgentBrief(request) : undefined
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
    void createAndOpen(
      {
        text: `[${tool.intent}] ${tool.title}：${tool.description}`,
        context: [],
        modelId: null,
        modelLabel: null,
        generationMode: 'manual',
      },
      tool.title,
    )
  }

  if (!home) {
    return homeStatus === 'error' ? <HomeLoadError message={homeError} onRetry={retry} /> : <HomeLoading />
  }

  return (
    <div className="min-w-0 px-10 pb-4 pt-2 max-[1100px]:px-6 max-[850px]:px-4">
      <section aria-label="当前活动" className="relative aspect-[8/1] w-full overflow-hidden rounded-[24px] bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          data-testid="home-campaign-image"
          src={home.campaign.imageUrl}
          alt="一场戏的诞生，从一个灵感到一场戏"
          className="h-full w-full object-cover"
        />
        {publicMode && (
          <div
            data-testid="home-public-entry"
            className="absolute bottom-3 left-3 flex max-w-[calc(100%-24px)] items-center gap-2 rounded-full border border-white/20 bg-black/55 px-3 py-1.5 text-[11px] text-white/78 backdrop-blur-sm"
          >
            <span className="truncate">公开浏览中 · 登录后保存并开始创作</span>
            <button
              type="button"
              onClick={() => setLoginPromptOpen(true)}
              className="shrink-0 rounded-full bg-white px-2.5 py-1 font-medium text-[#151515] transition-colors hover:bg-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60c9ef]"
            >
              登录
            </button>
          </div>
        )}
      </section>

      <div className="mt-6 max-[850px]:[&>section]:h-auto max-[850px]:[&>section]:grid-cols-2 max-[850px]:[&>section]:grid-rows-none max-[850px]:[&>section>button:first-child]:col-span-2 max-[850px]:[&>section>button:first-child]:row-span-1 max-[850px]:[&>section>button]:min-h-[116px]">
        <CreatorToolGrid
          tools={home.creatorTools}
          disabled={submitting}
          onBlank={() => void createAndOpen()}
          onTool={startTool}
        />
      </div>

      <div className="max-[1100px]:[&>section>div:last-child]:max-w-none max-[850px]:[&>section>div:last-child]:grid-cols-2 max-[640px]:[&>section>div:last-child]:grid-cols-1">
        <RecentProjects projects={home.recentProjects} />
      </div>

      {publicMode && (
        <section
          data-testid="home-login-entry"
          aria-label="登录创作入口"
          className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#60c9ef]/20 bg-[#16242b] px-5 py-3.5"
        >
          <div className="min-w-0">
            <h2 className="text-[13px] font-medium text-white/82">想把灵感变成项目？</h2>
            <p className="mt-1 text-[11px] text-white/45">登录后可以保存项目、调用 Agent，并继续编辑创作过程。</p>
          </div>
          <button
            type="button"
            onClick={() => setLoginPromptOpen(true)}
            className="shrink-0 rounded-lg bg-[#60c9ef] px-3 py-1.5 text-[12px] font-medium text-[#10202a] transition-colors hover:bg-[#72d2f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60c9ef]"
          >
            登录后开始
          </button>
        </section>
      )}

      <div className="max-[850px]:[&>section]:h-auto max-[850px]:[&>section]:min-h-[150px] max-[850px]:[&>section>div:last-child]:w-full max-[850px]:[&>section>div:last-child]:justify-start max-[850px]:[&>section>div:last-child]:overflow-x-auto max-[850px]:[&>section>div:last-child]:pb-1">
        <HomeAgentComposer
          skills={home.featuredSkills}
          submitting={submitting}
          publicMode={publicMode}
          onLoginRequired={() => setLoginPromptOpen(true)}
          onSubmit={(request) => void createAndOpen(request)}
        />
      </div>

      {error && <p role="alert" className="mt-3 text-center text-[12px] text-[#ff7d7d]">{error}</p>}

      <TvShowFeed categories={home.showcaseCategories} items={home.showcase} />

      <Dialog
        open={loginPromptOpen}
        onClose={() => setLoginPromptOpen(false)}
        title="登录后开始创作"
        testId="home-login-dialog"
      >
        <div className="space-y-3 text-[13px] leading-relaxed text-ink-600">
          <p>当前处于公开浏览模式，TV Show 和探索内容可以直接查看。</p>
          <p>登录后即可创建项目、使用 Agent，并保留你的创作进度。</p>
        </div>
        <div className="flex justify-end gap-2 pt-5">
          <button
            type="button"
            onClick={() => setLoginPromptOpen(false)}
            className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-ink-600 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            继续浏览
          </button>
          <button
            type="button"
            onClick={() => {
              setLoginPromptOpen(false)
              router.push('/account')
            }}
            className="rounded-lg bg-ink-900 px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            前往登录
          </button>
        </div>
      </Dialog>
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
