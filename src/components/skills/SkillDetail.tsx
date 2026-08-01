'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { SkillCard } from '@/domain/skills'
import { ApiError, api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { Dialog } from '../ui/Dialog'
import { Chip, EmptyState, Spinner } from '../ui/controls'
import { IconChevronLeft, IconCheck, IconCopy, IconSkill, IconSparkle } from '../icons'

/**
 * Skill detail.
 *
 * Read top down, the page answers the questions in the order a reader asks them:
 * whose is this and which version → what does it do → what would I type → what
 * exactly will it do to my work → and only then, act on it. The spec is the
 * substance, so it renders as titled prose sections rather than a serialised
 * blob: a contract nobody reads is not a contract.
 */
export function SkillDetail({ skillId }: { skillId: string }) {
  const [skill, setSkill] = useState<SkillCard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [loadGateOpen, setLoadGateOpen] = useState(false)

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
        setError(cause instanceof ApiError ? cause.message : 'Skill 加载失败，请稍后重试')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [skillId])

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

  return (
    <div className="min-h-screen bg-surface" data-testid="skill-detail">
      <header className="flex items-center justify-between px-8 py-5">
        <Link
          href="/skills"
          className="flex items-center gap-1 text-[13px] text-ink-500 transition-colors hover:text-ink-900"
        >
          <IconChevronLeft size={15} /> 技能库
        </Link>
        <Link
          href="/project"
          className="rounded-full bg-ink-50 px-4 py-2 text-[13px] font-medium text-ink-700 transition-colors hover:bg-ink-100"
        >
          我的项目
        </Link>
      </header>

      {loading ? (
        <div className="flex justify-center py-24 text-ink-400">
          <Spinner size={22} />
        </div>
      ) : !skill ? (
        <div className="px-8 pb-20">
          <EmptyState
            icon={<IconSparkle size={30} />}
            title="这个 Skill 不存在"
            description={error ?? '它可能已经被作者下架，或者链接里的编号不对。'}
            action={
              <Link
                href="/skills"
                className="rounded-lg bg-ink-900 px-3.5 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-85"
              >
                回到技能库
              </Link>
            }
          />
        </div>
      ) : (
        <main className="mx-auto max-w-3xl px-8 pb-20">
          {/* 1. Identity: whose contract this is, and which version of it. */}
          <div
            className="flex h-36 flex-col justify-center gap-2 rounded-2xl px-6"
            style={{
              background: `linear-gradient(140deg, hsl(${skill.hue} 62% 62%), hsl(${(skill.hue + 45) % 360} 58% 42%))`,
            }}
          >
            {skill.executableSpec.slice(0, 4).map((section, index) => (
              <span
                key={section.heading}
                className="block h-[5px] rounded-full bg-white/45"
                style={{ width: `${[80, 56, 68, 44][index]}%` }}
              />
            ))}
          </div>

          <h1 className="mt-5 text-[22px] font-semibold tracking-tight text-ink-900">{skill.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[12px] text-ink-400">
            <Chip tone="accent">v{skill.version}</Chip>
            <Chip>{skill.category}</Chip>
            <span>{skill.author}</span>
            <span>·</span>
            <span>更新于 {skill.updatedAt}</span>
            <span>·</span>
            <span>{skill.usageCount.toLocaleString('zh-CN')} 次调用</span>
          </div>

          {/* 2. Summary. */}
          <p className="mt-5 text-[14px] leading-relaxed text-ink-700">{skill.summary}</p>
          {skill.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {skill.tags.map((tag) => (
                <Chip key={tag}>{tag}</Chip>
              ))}
            </div>
          )}

          {/* 3. What a user would actually type to invoke it. */}
          <section className="mt-9">
            <h2 className="text-[13px] font-semibold text-ink-900">这样用</h2>
            <div className="mt-2.5 space-y-1.5">
              {skill.examples.map((example) => (
                <p
                  key={example}
                  className="rounded-xl bg-ink-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-600"
                >
                  「{example}」
                </p>
              ))}
            </div>
          </section>

          {/* 4. The contract itself. */}
          <section className="mt-9">
            <h2 className="text-[13px] font-semibold text-ink-900">执行契约</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-400">
              加载后 Agent 按下列条款工作。条款按顺序生效，v{skill.version} 的内容不会再变。
            </p>
            <div className="mt-3.5 overflow-hidden rounded-2xl ring-1 ring-ink-100">
              {skill.executableSpec.map((section, index) => (
                <div
                  key={section.heading}
                  data-testid={`skill-spec-${index}`}
                  className={cn('px-5 py-4', index > 0 && 'border-t border-ink-100')}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-[11px] font-medium tabular-nums text-ink-300">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <h3 className="text-[13px] font-semibold text-ink-900">{section.heading}</h3>
                  </div>
                  <p className="mt-1.5 pl-[26px] text-[13px] leading-[1.75] text-ink-600">{section.body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 5. Actions, last: acting before reading the contract is the mistake
              this ordering is meant to prevent. */}
          <section className="mt-9 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={pending}
              data-testid="skill-detail-favourite"
              aria-pressed={skill.favourite}
              onClick={() => void toggleFavourite()}
              className={cn(
                'flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-medium transition-colors',
                skill.favourite
                  ? 'bg-accent-soft text-accent-ink'
                  : 'border border-ink-200 text-ink-700 hover:bg-ink-50',
                pending && 'opacity-60',
              )}
            >
              <IconSkill size={15} fill={skill.favourite ? 'currentColor' : 'none'} />
              {skill.favourite ? '已收藏' : '收藏'}
            </button>
            <button
              type="button"
              data-testid="skill-add-to-session"
              onClick={() => setLoadGateOpen(true)}
              className="flex items-center gap-1.5 rounded-xl bg-ink-900 px-4 py-2.5 text-[13px] font-medium text-white transition-opacity hover:opacity-85"
            >
              <IconSparkle size={15} /> 添加到会话
            </button>
            {error && <span className="text-[12px] text-danger">{error}</span>}
          </section>
        </main>
      )}

      {skill && (
        <LoadIntoSessionDialog
          skill={skill}
          open={loadGateOpen}
          onClose={() => setLoadGateOpen(false)}
        />
      )}
    </div>
  )
}

/**
 * 添加到会话 from a public page.
 *
 * There is no session to add to here — sessions belong to a project — so the
 * button explains that and hands over the two things that do carry across: the
 * exact line to send, and the way to a project. Shipping it disabled would have
 * left the reader unable to ask why.
 */
function LoadIntoSessionDialog({
  skill,
  open,
  onClose,
}: {
  skill: SkillCard
  open: boolean
  onClose: () => void
}) {
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
      // Clipboard access is refused in plenty of legitimate contexts; the line
      // is selectable above, so say so instead of failing silently.
      setCopyState('failed')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="在项目里加载这个 Skill" testId="skill-session-gate">
      <div className="space-y-3 text-[13px] leading-relaxed text-ink-600">
        <p>Skill 由 Agent 会话加载，而会话属于某个项目。技能库是公开页面，这里没有可加载的会话。</p>
        <p>打开任意项目的 Agent 面板，把下面这行发给它，它就会按 v{skill.version} 的契约执行：</p>
        <p className="select-all rounded-xl bg-ink-50 px-3.5 py-2.5 font-mono text-[12px] text-ink-700">
          {invocation}
        </p>
        {copyState === 'failed' && (
          <p className="text-[12px] text-ink-400">当前环境不允许自动复制，请手动选中上面这行。</p>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 pt-5">
        <button
          type="button"
          data-testid="skill-copy-invocation"
          onClick={() => void copy()}
          className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium text-ink-600 transition-colors hover:bg-ink-50"
        >
          {copyState === 'done' ? <IconCheck size={14} /> : <IconCopy size={14} />}
          {copyState === 'done' ? '已复制' : '复制这行'}
        </button>
        <Link
          href="/project"
          data-testid="skill-open-project"
          className="rounded-lg bg-ink-900 px-3.5 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-85"
        >
          去我的项目
        </Link>
      </div>
    </Dialog>
  )
}
