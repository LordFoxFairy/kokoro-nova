'use client'

import { useState } from 'react'

import { IconPlus, IconSend } from '@/components/icons'
import type { HomeDiscoveryResponse } from '@/contracts/home'
import { cn } from '@/lib/cn'

type HomeAgentComposerProps = {
  skills: HomeDiscoveryResponse['featuredSkills']
  submitting?: boolean
  onSubmit: (brief: string) => void
}

export function HomeAgentComposer({ skills, submitting = false, onSubmit }: HomeAgentComposerProps) {
  const [draft, setDraft] = useState('')
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null)
  const valid = draft.trim().length > 0 && !submitting

  const submit = () => {
    if (!valid) return
    const skill = skills.find((item) => item.id === selectedSkillId)
    onSubmit(skill ? `${draft.trim()}\n使用「${skill.name}」Skill` : draft.trim())
  }

  return (
    <section aria-label="LibTV Agent 创作入口" className="mt-6 flex h-[150px] flex-col items-center justify-center rounded-[22px] bg-[#1b1b1b] px-8">
      <div className="flex h-12 w-full max-w-[560px] items-center rounded-full bg-[#292929] px-3 shadow-[inset_0_1px_0_rgba(255,255,255,.035)]">
        <button type="button" aria-label="添加素材" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/36 transition-colors hover:bg-white/[0.06] hover:text-white/70">
          <IconPlus size={19} />
        </button>
        <input
          value={draft}
          data-testid="home-composer"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) submit()
          }}
          placeholder="说出你的创意，或者从一个 skill 开始创作"
          className="h-full min-w-0 flex-1 bg-transparent px-1 text-[13px] text-white/86 outline-none placeholder:text-white/30"
        />
        <button
          type="button"
          aria-label="开始创作"
          data-testid="home-agent-send"
          disabled={!valid}
          onClick={submit}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.09] text-white/36 transition-colors enabled:bg-white enabled:text-[#181818] enabled:hover:bg-white/88 disabled:cursor-not-allowed"
        >
          <IconSend size={16} />
        </button>
      </div>

      <div className="mt-4 flex max-w-full items-center justify-center gap-2">
        {skills.map((skill) => {
          const selected = selectedSkillId === skill.id
          return (
            <button
              key={skill.id}
              type="button"
              data-testid="home-skill-chip"
              data-selected={selected ? 'true' : 'false'}
              onClick={() => setSelectedSkillId((current) => (current === skill.id ? null : skill.id))}
              className={cn(
                'flex h-8 max-w-[210px] items-center gap-2 rounded-full border px-2 pr-3 text-[12px] transition-colors',
                selected
                  ? 'border-[#60c9ef]/60 bg-[#60c9ef]/12 text-white'
                  : 'border-transparent bg-white/[0.045] text-white/62 hover:bg-white/[0.075] hover:text-white/82',
              )}
            >
              <span className="h-6 w-6 shrink-0 overflow-hidden rounded-full bg-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={skill.coverUrl} alt="" className="h-full w-full object-cover" />
              </span>
              <span className="truncate">{skill.name}</span>
            </button>
          )
        })}
        <button type="button" aria-label="更多 Skill" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.045] text-white/65 transition-colors hover:bg-white/[0.08]">
          ▣
        </button>
      </div>
    </section>
  )
}
