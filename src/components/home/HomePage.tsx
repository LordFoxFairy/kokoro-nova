'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { modelsFor } from '@/domain/models'
import { SKILL_CATALOGUE } from '@/domain/skills'
import type { Canvas, Project } from '@/domain/types'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { Menu, useMenuAnchor } from '../ui/Menu'
import { SegmentedControl, Spinner } from '../ui/controls'
import {
  IconAttachment,
  IconChevronDown,
  IconSend,
  IconSkill,
  IconSparkle,
} from '../icons'

/**
 * Landing surface.
 *
 * One composer: natural-language intent plus attachment / model / skill /
 * generation-mode controls. Submitting creates a project and carries the brief
 * into the canvas, so the entry point and the editor share one intent object.
 */
export function HomePage() {
  const router = useRouter()
  const [draft, setDraft] = useState('')
  const [mode, setMode] = useState<'manual' | 'auto'>('manual')
  const [modelId, setModelId] = useState('seedance-2')
  const [submitting, setSubmitting] = useState(false)

  const modelMenu = useMenuAnchor()
  const skillMenu = useMenuAnchor()

  const start = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      const name = draft.trim() ? draft.trim().slice(0, 18) : undefined
      const { project, canvas } = await api.post<{ project: Project; canvas: Canvas }>('/api/projects', { name })
      const query = new URLSearchParams({ projectId: project.id, canvasId: canvas.id })
      if (draft.trim()) query.set('brief', draft.trim())
      router.push(`/canvas?${query.toString()}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink-900 text-white">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 7.5 8 5l6 2.5L20 5v11.5L14 19l-6-2.5L4 19z" />
            </svg>
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-ink-900">NovaVideo</span>
        </div>
        <nav className="flex items-center gap-1">
          <Link
            href="/skills"
            className="rounded-full px-3.5 py-2 text-[13px] text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900"
          >
            技能库
          </Link>
          <Link
            href="/showcase"
            className="rounded-full px-3.5 py-2 text-[13px] text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900"
          >
            公开作品
          </Link>
          <Link
            href="/account"
            className="rounded-full px-3.5 py-2 text-[13px] text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900"
          >
            账户
          </Link>
          <Link
            href="/project"
            className="rounded-full bg-ink-50 px-4 py-2 text-[13px] font-medium text-ink-700 transition-colors hover:bg-ink-100"
          >
            全部项目
          </Link>
        </nav>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col items-center px-6 pt-20">
        <h1 className="text-center text-[34px] font-semibold leading-tight tracking-tight text-ink-900">
          把想法变成一条完整的视频
        </h1>
        <p className="mt-3 text-center text-[15px] leading-relaxed text-ink-500">
          用自然语言描述创意，在无限画布上编排文本、图片、视频与音频节点，
          <br />
          随时切换到故事板检查叙事结构。
        </p>

        <div className="mt-9 w-full rounded-2xl bg-surface p-2 shadow-[var(--shadow-panel)] ring-1 ring-ink-100">
          <textarea
            value={draft}
            data-testid="home-composer"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void start()
            }}
            rows={4}
            placeholder="描述你想制作的视频，例如：一条 15 秒的产品宣传片，冷色调，结尾出现品牌标识"
            className="w-full resize-none rounded-xl p-3 text-[14px] leading-relaxed outline-none placeholder:text-ink-300"
          />
          <div className="flex items-center gap-1 px-1 pb-1">
            <button
              type="button"
              aria-label="附件"
              className="rounded-lg p-2 text-ink-500 transition-colors hover:bg-ink-50"
            >
              <IconAttachment size={16} />
            </button>
            <button
              type="button"
              onClick={(e) => modelMenu.openFrom(e)}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] text-ink-600 transition-colors hover:bg-ink-50"
            >
              <IconSparkle size={13} />
              {modelsFor('video').find((m) => m.id === modelId)?.label ?? '模型'}
              <IconChevronDown size={12} className="text-ink-400" />
            </button>
            <button
              type="button"
              onClick={(e) => skillMenu.openFrom(e)}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] text-ink-600 transition-colors hover:bg-ink-50"
            >
              <IconSkill size={13} /> Skill
            </button>

            <div className="ml-auto flex items-center gap-2">
              <SegmentedControl
                size="sm"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'manual', label: '手动' },
                  { value: 'auto', label: '自动' },
                ]}
              />
              <button
                type="button"
                data-testid="home-start"
                onClick={start}
                disabled={submitting}
                className={cn(
                  'flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-medium text-white transition-opacity',
                  submitting ? 'bg-ink-300' : 'bg-ink-900 hover:opacity-85',
                )}
              >
                {submitting ? <Spinner size={13} /> : <IconSend size={13} />}
                开始创作
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {[
            '一条 15 秒的产品宣传片，冷色调',
            '把这段文字拆成分镜脚本',
            '为角色生成三视图并保持一致',
            '给这段视频配一段中文旁白',
          ].map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setDraft(suggestion)}
              className="rounded-full bg-ink-50 px-3.5 py-2 text-[12px] text-ink-600 transition-colors hover:bg-ink-100"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </main>

      {modelMenu.anchor && (
        <Menu
          anchor={modelMenu.anchor}
          onClose={modelMenu.close}
          width={230}
          sections={[
            {
              title: '视频模型',
              items: modelsFor('video').map((model) => ({
                id: model.id,
                label: model.label,
                shortcut: model.latencyLabel,
                checked: model.id === modelId,
                onSelect: () => setModelId(model.id),
              })),
            },
            {
              title: '图片模型',
              items: modelsFor('image').map((model) => ({
                id: model.id,
                label: model.label,
                shortcut: model.latencyLabel,
                checked: model.id === modelId,
                onSelect: () => setModelId(model.id),
              })),
            },
          ]}
        />
      )}
      {skillMenu.anchor && (
        <Menu
          anchor={skillMenu.anchor}
          onClose={skillMenu.close}
          width={200}
          sections={[
            {
              title: 'Skill',
              items: SKILL_CATALOGUE.slice(0, 6).map((skill) => ({
                id: skill.id,
                label: skill.name,
                shortcut: skill.version,
                onSelect: () => setDraft((d) => (d ? `${d}\n使用「${skill.name}」Skill` : `使用「${skill.name}」Skill`)),
              })),
            },
            {
              items: [{ id: 'browse', label: '浏览全部 Skill…', onSelect: () => router.push('/skills') }],
            },
          ]}
        />
      )}
    </div>
  )
}
