'use client'

/* eslint-disable @next/next/no-img-element -- local SVG fixtures are already optimized and tiny. */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { SkillCard } from '@/domain/skills'
import { getSkillMedia, getSkillMediaIndex } from '@/domain/skills'
import { ApiError, api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { Dialog } from '../ui/Dialog'
import { EmptyState, Spinner } from '../ui/controls'
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconCopy,
  IconShare,
  IconSkill,
  IconSparkle,
} from '../icons'
import { LibTvLogo } from '../shell/LibTvLogo'
import { PromoStrip } from '../shell/PromoStrip'

export type SkillDetailRequestState = 'loading' | 'ready' | 'missing' | 'error'

export function getSkillDetailRequestState({ loading, hasSkill, error }: { loading: boolean; hasSkill: boolean; error: string | null }): SkillDetailRequestState {
  if (loading) return 'loading'
  if (error) return 'error'
  return hasSkill ? 'ready' : 'missing'
}

export function SkillDetail({ skillId }: { skillId: string }) {
  const [skill, setSkill] = useState<SkillCard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [loginGateOpen, setLoginGateOpen] = useState(false)
  const [addedToComposer, setAddedToComposer] = useState(false)
  const [shareTooltip, setShareTooltip] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void api
      .get<{ skill: SkillCard }>(`/api/skills/${skillId}`)
      .then((data) => {
        if (!cancelled) setSkill(data.skill)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setSkill(null)
        setError(cause instanceof ApiError ? cause.message : 'Skill 加载失败，请稍后重试')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [skillId, reloadToken])

  const toggleFavourite = async () => {
    if (!skill || pending) return
    setPending(true)
    try {
      const { skill: updated } = await api.post<{ skill: SkillCard }>(`/api/skills/${skill.id}`, {
        action: skill.favourite ? 'unfavourite' : 'favourite',
      })
      setSkill(updated)
      setError(null)
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : '收藏失败，请稍后重试')
    } finally {
      setPending(false)
    }
  }

  const addToComposer = () => {
    if (!skill) return
    window.localStorage.setItem('libtv.skill.composer', JSON.stringify({ id: skill.id, version: skill.version }))
    setAddedToComposer(true)
  }

  const requestState = getSkillDetailRequestState({ loading, hasSkill: Boolean(skill), error })

  return (
    <div data-app-shell="authenticated" data-testid="skill-detail" className="min-h-screen overflow-x-hidden bg-[#111] text-white" aria-busy={loading}>
      <div className="px-2 pt-2 max-sm:px-1 max-sm:pt-1"><PromoStrip campaign={null} /></div>
      <header className="flex min-h-[64px] items-center justify-between gap-4 border-b border-white/[0.07] px-4 py-3 sm:px-8">
        <Link href="/skills" className="flex items-center gap-3 text-white/65 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#60c9ef]">
          <LibTvLogo className="h-6 w-[88px] text-white" />
          <span className="border-l border-white/[0.15] pl-3 text-[12px]">Skill 市场</span>
        </Link>
        <nav aria-label="技能详情工具" className="flex items-center gap-2">
          <Link href="/showcase" className="hidden rounded-lg border border-white/[0.08] px-3 py-2 text-[12px] text-white/55 hover:bg-white/[0.06] hover:text-white sm:inline-flex">公开作品</Link>
          <Link href="/account" className="rounded-lg bg-white px-3.5 py-2 text-[12px] font-medium text-[#151515]">注册/登录</Link>
        </nav>
      </header>

      {requestState === 'loading' ? (
        <div className="flex justify-center py-28 text-white/45" role="status" aria-label="正在加载 Skill 详情"><Spinner size={22} /></div>
      ) : !skill ? (
        <div className="mx-auto max-w-[940px] px-5 pb-20 pt-12 sm:px-8">
          <EmptyState icon={<IconSparkle size={30} />} title={error ? 'Skill 暂时加载失败' : '这个 Skill 不存在'} description={error ?? '它可能已经被作者下架，或者链接里的编号不对。'} action={<div className="flex flex-wrap justify-center gap-2">{error && <button type="button" data-testid="skill-detail-retry" onClick={() => setReloadToken((token) => token + 1)} disabled={loading} className="rounded-lg bg-white px-3.5 py-2 text-[13px] font-medium text-[#151515]">重试</button>}<Link href="/skills" className="rounded-lg border border-white/[0.12] px-3.5 py-2 text-[13px] font-medium text-white/75 hover:bg-white/[0.06]">回到技能库</Link></div>} />
        </div>
      ) : (
        <main className="mx-auto max-w-[960px] px-4 pb-20 pt-8 sm:px-8" aria-labelledby="skill-detail-title">
          <article className="overflow-hidden rounded-3xl border border-white/[0.12] bg-[#191919] shadow-[0_24px_80px_rgba(0,0,0,.25)]">
            <header className="flex flex-wrap items-start justify-between gap-5 px-6 pb-5 pt-6 sm:px-8">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[11px] text-white/45">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-[#f4e9d6] to-[#54504b] text-[9px] text-[#222]">✦</span>
                  <span>{skill.author}</span><span>·</span><span>{skill.category}</span><span>·</span><span>{skill.usageCount.toLocaleString('zh-CN')} 次调用</span><span>·</span><span>☆ {Math.max(12, Math.round(skill.usageCount / 400))}</span>
                </div>
                <h1 id="skill-detail-title" className="mt-3 text-[24px] font-medium tracking-tight text-white/95 sm:text-[28px]">{skill.name}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#60c9ef]/12 px-2 py-1 text-[10px] font-medium text-[#70d1f1]">v{skill.version}</span><span className="rounded-full bg-white/[0.06] px-2 py-1 text-[10px] text-white/45">{skill.origin === 'official' ? '官方 Skill' : skill.origin === 'community' ? '社区 Skill' : '我的 Skill'}</span></div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div className="relative">
                  <button type="button" data-testid="skill-share" aria-label="分享 Skill" title="分享" onClick={() => setShareTooltip((value) => !value)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.1] text-white/65 transition-colors hover:bg-white/[0.08] hover:text-white"><IconShare size={16} /></button>
                  {shareTooltip && <span data-testid="skill-share-tooltip" role="status" className="absolute right-0 top-11 z-10 whitespace-nowrap rounded-md bg-[#313131] px-2.5 py-1.5 text-[11px] text-white/75 shadow-lg">分享</span>}
                </div>
                <button type="button" data-testid="skill-detail-favourite" aria-busy={pending} aria-pressed={skill.favourite} onClick={() => void toggleFavourite()} disabled={pending} className={cn('flex h-9 w-9 items-center justify-center rounded-lg border text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white', skill.favourite ? 'border-[#ffd36f]/40 bg-[#ffd36f]/10 text-[#ffd36f]' : 'border-white/[0.1]')}><IconSkill size={17} fill={skill.favourite ? 'currentColor' : 'none'} /></button>
                <button type="button" data-testid="skill-add-to-composer" onClick={addToComposer} className="flex h-9 items-center gap-1.5 rounded-lg bg-white px-4 text-[12px] font-medium text-[#161616] transition-opacity hover:opacity-85"><IconCheck size={14} className={addedToComposer ? '' : 'hidden'} />{addedToComposer ? '已添加 Skill' : '添加 Skill'}</button>
              </div>
            </header>

            <SkillMediaCarousel skill={skill} />

            <div className="px-6 pb-8 pt-7 sm:px-8">
              <section aria-labelledby="skill-summary-title">
                <div className="flex items-center justify-between gap-3"><h2 id="skill-summary-title" className="text-[14px] font-medium text-white/90">简介</h2><span className="text-[11px] text-white/30">最后更新 {skill.updatedAt}</span></div>
                <p className="mt-3 max-w-3xl text-[13px] leading-7 text-white/58">{skill.summary}</p>
                <dl className="mt-5 grid gap-3 sm:grid-cols-3">
                  <SummaryCell label="使用场景" value={skill.examples[0] ?? '在 Agent 会话中加载'} />
                  <SummaryCell label="如何使用" value="输入脚本、人物表或当前节点，Agent 会按契约执行" />
                  <SummaryCell label="输出内容" value={`${skill.executableSpec.length} 个步骤 · 结构化执行结果`} />
                </dl>
                {skill.tags.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{skill.tags.map((tag) => <span key={tag} className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[10px] text-white/45">#{tag}</span>)}</div>}
              </section>

              <section className="mt-9 border-t border-white/[0.08] pt-7" aria-labelledby="skill-usage-title">
                <h2 id="skill-usage-title" className="text-[14px] font-medium text-white/90">这样用</h2>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">{skill.examples.map((example) => <p key={example} className="rounded-xl bg-white/[0.045] px-3.5 py-3 text-[12px] leading-relaxed text-white/55">「{example}」</p>)}</div>
              </section>

              <section className="mt-9 border-t border-white/[0.08] pt-7" aria-labelledby="skill-spec-title">
                <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 id="skill-spec-title" className="text-[14px] font-medium text-white/90">执行规范</h2><p className="mt-1 text-[11px] text-white/35">加载后 Agent 按下列条款工作，v{skill.version} 的内容不会再变。</p></div><span className="rounded-full border border-white/[0.1] px-2 py-1 text-[10px] text-white/35">{skill.executableSpec.length} sections</span></div>
                <div className="mt-4 overflow-hidden rounded-2xl border border-white/[0.1]">{skill.executableSpec.map((section, index) => <div key={section.heading} data-testid={`skill-spec-${index}`} className={cn('px-5 py-4', index > 0 && 'border-t border-white/[0.08]')}><div className="flex items-baseline gap-3"><span className="font-mono text-[10px] tabular-nums text-[#60c9ef]/70">{String(index + 1).padStart(2, '0')}</span><h3 className="text-[12px] font-medium text-white/78">{section.heading}</h3></div><p className="mt-2 pl-[25px] text-[12px] leading-7 text-white/45">{section.body}</p></div>)}</div>
              </section>

              <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#60c9ef]/18 bg-[#102630] px-4 py-3.5">
                <div><p className="text-[12px] font-medium text-[#b9eafa]">把 Skill 带进你的下一次创作</p><p className="mt-1 text-[11px] text-[#80b3c2]">已添加的 Skill 会保留版本，避免执行过程中悄悄漂移。</p></div>
                <button type="button" data-testid="skill-add-to-session" onClick={() => setLoginGateOpen(true)} className="rounded-lg bg-[#60c9ef] px-3.5 py-2 text-[12px] font-medium text-[#10202a] hover:bg-[#78d6f5]">立即使用</button>
              </div>
              {addedToComposer && <p data-testid="skill-composer-status" role="status" className="mt-3 flex items-center gap-1.5 text-[11px] text-[#70d1f1]"><IconCheck size={13} />已加入创作器，可在登录后继续使用 v{skill.version}。</p>}
              {error && <p className="mt-3 text-[12px] text-[#ff9a9f]" role="alert">{error}</p>}
            </div>
          </article>
        </main>
      )}

      {skill && <SkillLoginGate skill={skill} open={loginGateOpen} onClose={() => setLoginGateOpen(false)} />}
    </div>
  )
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-white/[0.045] px-3.5 py-3"><dt className="text-[11px] text-white/35">{label}</dt><dd className="mt-1.5 line-clamp-3 text-[12px] leading-relaxed text-white/60">{value}</dd></div>
}

function SkillMediaCarousel({ skill }: { skill: SkillCard }) {
  const media = getSkillMedia(skill)
  const [activeIndex, setActiveIndex] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const active = media[activeIndex]

  useEffect(() => {
    if (!lightboxOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightboxOpen(false)
      if (event.key === 'ArrowLeft') setActiveIndex((index) => getSkillMediaIndex(index, -1, media.length))
      if (event.key === 'ArrowRight') setActiveIndex((index) => getSkillMediaIndex(index, 1, media.length))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [lightboxOpen, media.length])

  if (!active) return null
  const move = (delta: number) => setActiveIndex((index) => getSkillMediaIndex(index, delta, media.length))

  return (
    <section data-testid="skill-media-carousel" aria-label={`${skill.name} 示例轮播`} className="px-4 sm:px-6">
      <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-[#252525] ring-1 ring-white/[0.08]">

        <img key={active.id} data-testid="skill-media-image" src={active.src} alt={active.alt} className="h-full w-full object-cover transition-opacity duration-200" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/10" />
        <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[11px] text-white/80 backdrop-blur"><button type="button" data-testid="skill-media-prev" aria-label="上一个示例" disabled={activeIndex === 0} onClick={() => move(-1)} className="rounded-full p-0.5 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-35"><IconChevronLeft size={13} /></button><span className="min-w-[30px] text-center tabular-nums">{activeIndex + 1} / {media.length}</span><button type="button" data-testid="skill-media-next" aria-label="下一个示例" disabled={activeIndex === media.length - 1} onClick={() => move(1)} className="rounded-full p-0.5 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-35"><IconChevronRight size={13} /></button></div>
        <button type="button" data-testid="skill-media-open" onClick={() => setLightboxOpen(true)} className="absolute bottom-3 left-3 rounded-lg bg-black/55 px-3 py-1.5 text-[11px] text-white/80 backdrop-blur transition-colors hover:bg-black/75">查看原图</button>
        <span className="absolute bottom-3 right-3 rounded bg-black/45 px-2 py-1 text-[10px] text-white/60">{active.label}</span>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="示例缩略图列表">{media.map((item, index) => <button key={item.id} type="button" data-testid={`skill-media-thumb-${index}`} aria-label={`查看${item.label}`} aria-pressed={index === activeIndex} onClick={() => setActiveIndex(index)} className={cn('relative h-12 w-20 shrink-0 overflow-hidden rounded-lg ring-1 transition-opacity', index === activeIndex ? 'ring-[#60c9ef]' : 'ring-white/[0.1] opacity-55 hover:opacity-90')}><span className="absolute inset-0 bg-black/10" /><img src={item.src} alt="" className="h-full w-full object-cover" /></button>)}</div>
      {lightboxOpen && <div data-testid="skill-media-lightbox" role="dialog" aria-modal="true" aria-label="原图查看" className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 p-5 backdrop-blur-sm"><button type="button" aria-label="关闭原图" data-testid="skill-media-close" onClick={() => setLightboxOpen(false)} className="absolute right-5 top-5 rounded-full bg-white/10 p-2 text-white/75 transition-colors hover:bg-white/20 hover:text-white"><IconClose size={20} /></button><button type="button" aria-label="上一个原图" disabled={activeIndex === 0} onClick={() => move(-1)} className="absolute left-4 top-1/2 rounded-full bg-white/10 p-3 text-white/75 hover:bg-white/20 disabled:opacity-25 sm:left-8"><IconChevronLeft size={22} /></button><div className="flex max-h-full max-w-[1100px] flex-col items-center gap-3"><div className="max-h-[82vh] max-w-[90vw] overflow-hidden rounded-xl bg-[#222] shadow-[0_24px_100px_rgba(0,0,0,.55)]"><img data-testid="skill-lightbox-image" src={active.src} alt={active.alt} className="max-h-[82vh] max-w-[90vw] object-contain" /></div><span className="text-[11px] text-white/55">{activeIndex + 1} / {media.length} · {active.label}</span></div><button type="button" aria-label="下一个原图" disabled={activeIndex === media.length - 1} onClick={() => move(1)} className="absolute right-4 top-1/2 rounded-full bg-white/10 p-3 text-white/75 hover:bg-white/20 disabled:opacity-25 sm:right-8"><IconChevronRight size={22} /></button></div>}
    </section>
  )
}

function SkillLoginGate({ skill, open, onClose }: { skill: SkillCard; open: boolean; onClose: () => void }) {
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'failed'>('idle')
  const invocation = `使用「${skill.name} v${skill.version}」Skill`

  useEffect(() => {
    if (!open) setCopyState('idle')
  }, [open])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invocation)
      setCopyState('done')
    } catch {
      setCopyState('failed')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="登录后使用这个 Skill" testId="skill-login-gate">
      <div data-testid="skill-session-gate" className="space-y-3 text-[13px] leading-relaxed text-ink-600">
        <p>Skill 会被加载到 Agent 会话中。登录后，你可以在项目里直接使用固定的 v{skill.version} 执行规范。</p>
        <p>也可以先复制调用句，登录后粘贴到 Agent：</p>
        <p className="select-all rounded-xl bg-ink-50 px-3.5 py-2.5 font-mono text-[12px] text-ink-700">{invocation}</p>
        {copyState === 'failed' && <p className="text-[12px] text-ink-600" role="alert">当前环境不允许自动复制，请手动选中上面这行。</p>}
      </div>
      <div className="flex items-center justify-end gap-2 pt-5"><button type="button" data-testid="skill-copy-invocation" onClick={() => void copy()} className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium text-ink-700 transition-colors hover:bg-ink-50">{copyState === 'done' ? <IconCheck size={14} /> : <IconCopy size={14} />}{copyState === 'done' ? '已复制' : '复制调用句'}</button><Link href="/account" data-testid="skill-open-login" className="rounded-lg bg-ink-900 px-3.5 py-2 text-[13px] font-medium text-white">去注册 / 登录</Link></div>
    </Dialog>
  )
}
