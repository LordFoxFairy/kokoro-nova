'use client'

/* The cover field intentionally accepts arbitrary local fixture and remote draft URLs. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AuthoredSkill, SkillAuthorFile } from '@/contracts/skills'
import { skillAuthoringApi } from '@/api/skills-authoring'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import { Dialog } from '../ui/Dialog'
import { Spinner } from '../ui/controls'
import { IconCheck, IconClose, IconPlus, IconRefresh } from '../icons'

const CATEGORIES = ['叙事分镜', '角色一致性', '广告文案', '提示词工程', '声音与配乐', '交付规范'] as const

type Draft = Pick<AuthoredSkill, 'name' | 'summary' | 'category' | 'usageScenarios' | 'howToUse' | 'outputContent' | 'outputTypes' | 'cover' | 'version' | 'files' | 'tags'>
type OutputType = AuthoredSkill['outputTypes'][number]

const OUTPUT_TYPE_OPTIONS: ReadonlyArray<{ value: OutputType; label: string }> = [
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
  { value: 'audio', label: '音频' },
  { value: 'text', label: '文本' },
]

function toDraft(skill: AuthoredSkill): Draft {
  return { name: skill.name, summary: skill.summary, category: skill.category, usageScenarios: skill.usageScenarios, howToUse: skill.howToUse, outputContent: skill.outputContent, outputTypes: [...skill.outputTypes], cover: skill.cover, version: skill.version, files: skill.files.map((file) => ({ ...file })), tags: [...skill.tags] }
}

function errorCopy(cause: unknown) {
  return cause instanceof ApiError ? cause.message : '本地作者工作区暂时不可用，请重试。'
}

/**
 * Local-only authoring drawer. The persisted model is deliberately independent
 * from the public catalogue: only a successful publish projects into “我的”.
 */
export function SkillAuthorStudio({ onPublished }: { onPublished: () => void }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<AuthoredSkill[]>([])
  const [selected, setSelected] = useState<AuthoredSkill | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [activePath, setActivePath] = useState('SKILL.md')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = async (keepId = selected?.id) => {
    setLoading(true); setError(null)
    try {
      const result = await skillAuthoringApi.list()
      setRows(result.skills)
      const next = result.skills.find((skill) => skill.id === keepId) ?? result.skills[0] ?? null
      setSelected(next); setDraft(next ? toDraft(next) : null)
      setActivePath((path) => next?.files.some((file) => file.path === path) ? path : next?.files[0]?.path ?? 'SKILL.md')
    } catch (cause) { setError(errorCopy(cause)) } finally { setLoading(false) }
  }

  useEffect(() => { if (open) void refresh() }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeFile = useMemo(() => draft?.files.find((file) => file.path === activePath) ?? draft?.files[0] ?? null, [activePath, draft])
  const updateDraft = (patch: Partial<Draft>) => setDraft((current) => current ? { ...current, ...patch } : current)
  const updateFile = (file: SkillAuthorFile) => updateDraft({ files: (draft?.files ?? []).map((item) => item.path === file.path ? file : item) })
  const toggleOutputType = (outputType: OutputType) => {
    if (!draft) return
    updateDraft({ outputTypes: draft.outputTypes.includes(outputType) ? draft.outputTypes.filter((item) => item !== outputType) : [...draft.outputTypes, outputType] })
  }

  const create = async () => {
    setSaving(true); setError(null)
    try {
      const result = await skillAuthoringApi.create()
      setRows((current) => [result.skill, ...current]); setSelected(result.skill); setDraft(toDraft(result.skill)); setActivePath('SKILL.md')
    } catch (cause) { setError(errorCopy(cause)) } finally { setSaving(false) }
  }

  const save = async () => {
    if (!selected || !draft) return
    setSaving(true); setError(null)
    try {
      const result = await skillAuthoringApi.update(selected.id, draft)
      setSelected(result.skill); setDraft(toDraft(result.skill)); setRows((current) => current.map((row) => row.id === result.skill.id ? result.skill : row))
    } catch (cause) { setError(errorCopy(cause)) } finally { setSaving(false) }
  }

  const action = async (kind: 'submit_review' | 'publish' | 'unpublish') => {
    if (!selected) return
    setSaving(true); setError(null)
    try {
      const result = await skillAuthoringApi.action(selected.id, kind)
      setSelected(result.skill); setDraft(toDraft(result.skill)); setRows((current) => current.map((row) => row.id === result.skill.id ? result.skill : row))
      if (kind === 'publish' || kind === 'unpublish') onPublished()
    } catch (cause) { setError(errorCopy(cause)); await refresh(selected.id) } finally { setSaving(false) }
  }

  const addFile = () => {
    if (!draft) return
    const number = draft.files.length + 1
    const file: SkillAuthorFile = { path: `notes/guide-${number}.md`, language: 'markdown', content: '# 补充说明\n' }
    updateDraft({ files: [...draft.files, file] }); setActivePath(file.path)
  }

  return <>
    <button type="button" data-testid="skill-author-open" onClick={() => setOpen(true)} className="rounded-lg border border-[#60c9ef]/35 bg-[#0f2a38] px-3.5 py-2 text-[12px] font-medium text-[#8bddf5] hover:bg-[#123a4b]">创建Skill</button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Skill 作者工作台" testId="skill-author-studio" width={1120}>
      <div className="min-h-[580px]" aria-busy={loading || saving}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-4">
          <div><p className="text-[13px] font-medium text-ink-900">本地作者生命周期</p><p className="mt-1 text-[11px] text-ink-500">草稿 → 审核 → 发布；只有发布版本会投影到“我的”。</p></div>
          <div className="flex gap-2"><button type="button" data-testid="skill-author-refresh" onClick={() => void refresh()} disabled={loading || saving} className="rounded-lg px-3 py-2 text-[12px] text-ink-600 hover:bg-ink-50"><IconRefresh size={14} className={loading ? 'animate-spin' : undefined} /> <span className="sr-only">刷新</span></button><button type="button" data-testid="skill-author-create" onClick={() => void create()} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-ink-900 px-3.5 py-2 text-[12px] font-medium text-white hover:bg-ink-700"><IconPlus size={14} />创建Skill</button></div>
        </div>
        {error && <div data-testid="skill-author-error" role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-xl bg-red-50 px-3.5 py-3 text-[12px] leading-5 text-red-700"><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="关闭错误"><IconClose size={14} /></button></div>}
        {loading && !selected ? <div className="flex justify-center py-24 text-ink-400"><Spinner size={20} /></div> : !selected || !draft ? <div data-testid="skill-author-empty" className="flex min-h-[390px] flex-col items-center justify-center rounded-2xl border border-dashed border-ink-200 bg-ink-50/50 text-center"><p className="text-[14px] font-medium text-ink-800">还没有自建 Skill</p><p className="mt-2 max-w-sm text-[12px] leading-6 text-ink-500">从一个版本化模板开始，补齐 SKILL.md 后提交本地审核。</p><button type="button" onClick={() => void create()} className="mt-5 rounded-lg bg-ink-900 px-3.5 py-2 text-[12px] font-medium text-white">创建草稿</button></div> : <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)_230px]">
          <aside className="rounded-xl border border-ink-150 bg-ink-50/60 p-2" aria-label="作者 Skill 列表">
            <p className="px-2 pb-2 pt-1 text-[11px] font-medium text-ink-500">我的草稿</p>
            {rows.map((row) => <button key={row.id} type="button" data-testid={`skill-author-row-${row.id}`} onClick={() => { setSelected(row); setDraft(toDraft(row)); setActivePath(row.files[0]?.path ?? 'SKILL.md') }} className={cn('mb-1 w-full rounded-lg px-2.5 py-2.5 text-left', selected.id === row.id ? 'bg-white shadow-sm ring-1 ring-ink-200' : 'hover:bg-white/70')}><span className="block truncate text-[12px] font-medium text-ink-800">{row.name}</span><span className="mt-1 block text-[10px] text-ink-500">v{row.version} · {statusLabel(row.status)}</span></button>)}
          </aside>
          <section className="min-w-0 space-y-4" aria-label="Skill 内容编辑器">
            <div className="grid gap-3 sm:grid-cols-2"><Field label="名称"><input data-testid="skill-author-name" value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} disabled={selected.status === 'published'} className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-[12px] text-ink-800 outline-none focus:border-sky-400 disabled:bg-ink-100 disabled:text-ink-500" /></Field><Field label="语义版本"><input data-testid="skill-author-version" value={draft.version} onChange={(event) => updateDraft({ version: event.target.value })} disabled={selected.status === 'published'} className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-[12px] text-ink-800 outline-none focus:border-sky-400 disabled:bg-ink-100 disabled:text-ink-500 font-mono" /></Field></div>
            <Field label="一句话介绍"><textarea data-testid="skill-author-summary" value={draft.summary} onChange={(event) => updateDraft({ summary: event.target.value })} disabled={selected.status === 'published'} rows={2} className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-[12px] text-ink-800 outline-none focus:border-sky-400 disabled:bg-ink-100 disabled:text-ink-500 resize-y" /></Field>
            <div className="grid gap-3 sm:grid-cols-2"><Field label="分类"><select data-testid="skill-author-category" value={draft.category} onChange={(event) => updateDraft({ category: event.target.value as Draft['category'] })} disabled={selected.status === 'published'} className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-[12px] text-ink-800 outline-none focus:border-sky-400 disabled:bg-ink-100 disabled:text-ink-500">{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></Field><Field label="标签（逗号分隔）"><input data-testid="skill-author-tags" value={draft.tags.join(', ')} onChange={(event) => updateDraft({ tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 8) })} disabled={selected.status === 'published'} className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-[12px] text-ink-800 outline-none focus:border-sky-400 disabled:bg-ink-100 disabled:text-ink-500" /></Field></div>
            <div className="grid gap-3 sm:grid-cols-3"><Field label="使用场景"><textarea data-testid="skill-author-usage-scenarios" value={draft.usageScenarios} onChange={(event) => updateDraft({ usageScenarios: event.target.value })} disabled={selected.status === 'published'} rows={3} placeholder="适合在哪些创作阶段使用？" className="w-full resize-y rounded-lg border border-ink-200 bg-white px-3 py-2 text-[12px] text-ink-800 outline-none placeholder:text-ink-300 focus:border-sky-400 disabled:bg-ink-100 disabled:text-ink-500" /></Field><Field label="如何使用"><textarea data-testid="skill-author-how-to-use" value={draft.howToUse} onChange={(event) => updateDraft({ howToUse: event.target.value })} disabled={selected.status === 'published'} rows={3} placeholder="需要提供哪些输入，如何调用？" className="w-full resize-y rounded-lg border border-ink-200 bg-white px-3 py-2 text-[12px] text-ink-800 outline-none placeholder:text-ink-300 focus:border-sky-400 disabled:bg-ink-100 disabled:text-ink-500" /></Field><Field label="输出内容"><textarea data-testid="skill-author-output-content" value={draft.outputContent} onChange={(event) => updateDraft({ outputContent: event.target.value })} disabled={selected.status === 'published'} rows={3} placeholder="会返回哪些可交付产物？" className="w-full resize-y rounded-lg border border-ink-200 bg-white px-3 py-2 text-[12px] text-ink-800 outline-none placeholder:text-ink-300 focus:border-sky-400 disabled:bg-ink-100 disabled:text-ink-500" /></Field></div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"><fieldset disabled={selected.status === 'published'} className="min-w-0"><legend className="mb-1.5 text-[11px] font-medium text-ink-600">输出类型</legend><div data-testid="skill-author-output-types" className="flex flex-wrap gap-2">{OUTPUT_TYPE_OPTIONS.map((option) => <label key={option.value} className={cn('inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] transition-colors', draft.outputTypes.includes(option.value) ? 'border-sky-400 bg-sky-50 text-sky-800' : 'border-ink-200 bg-white text-ink-600', selected.status === 'published' && 'cursor-default opacity-70')}><input data-testid={`skill-author-output-type-${option.value}`} type="checkbox" checked={draft.outputTypes.includes(option.value)} onChange={() => toggleOutputType(option.value)} className="h-3.5 w-3.5 accent-sky-600" />{option.label}</label>)}</div></fieldset><Field label="可选封面"><div className="flex gap-2"><input data-testid="skill-author-cover" value={draft.cover ?? ''} onChange={(event) => updateDraft({ cover: event.target.value.trim() || null })} disabled={selected.status === 'published'} placeholder="/fixtures/... 或 https://..." className="min-w-0 flex-1 rounded-lg border border-ink-200 bg-white px-3 py-2 text-[11px] text-ink-800 outline-none placeholder:text-ink-300 focus:border-sky-400 disabled:bg-ink-100 disabled:text-ink-500" />{draft.cover && <button type="button" data-testid="skill-author-clear-cover" onClick={() => updateDraft({ cover: null })} disabled={selected.status === 'published'} className="rounded-lg border border-ink-200 px-2.5 text-[11px] text-ink-600 hover:bg-ink-50">清除</button>}</div></Field></div>
            {draft.cover && <div data-testid="skill-author-cover-preview" className="overflow-hidden rounded-xl border border-ink-150 bg-ink-50 p-2"><p className="mb-1.5 text-[10px] text-ink-500">封面预览（随发布版本冻结）</p><img src={draft.cover} alt="Skill 封面预览" className="h-20 w-full rounded-lg object-cover" /></div>}
            <div className="overflow-hidden rounded-xl border border-ink-150"><div className="flex items-center justify-between border-b border-ink-150 bg-ink-50 px-3 py-2"><span className="text-[12px] font-medium text-ink-700">文件树</span><button type="button" data-testid="skill-author-add-file" onClick={addFile} disabled={selected.status === 'published'} className="text-[11px] font-medium text-sky-700 hover:text-sky-900">+ 新文件</button></div><div className="grid min-h-[244px] sm:grid-cols-[172px_minmax(0,1fr)]"><nav className="border-b border-ink-150 bg-ink-50/50 p-2 sm:border-b-0 sm:border-r" aria-label="Skill 文件树">{draft.files.map((file) => <button key={file.path} type="button" data-testid={`skill-author-file-${file.path.replaceAll('/', '-')}`} onClick={() => setActivePath(file.path)} className={cn('block w-full rounded px-2 py-1.5 text-left font-mono text-[11px]', activeFile?.path === file.path ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:bg-white')}>{file.path}</button>)}</nav><div className="min-w-0 p-3">{activeFile && <><div className="mb-2 flex items-center justify-between"><span className="font-mono text-[11px] text-ink-500">{activeFile.path}</span><span className="text-[10px] text-ink-400">{activeFile.language}</span></div><textarea data-testid="skill-author-file-content" aria-label={`${activeFile.path} 内容`} value={activeFile.content} onChange={(event) => updateFile({ ...activeFile, content: event.target.value })} disabled={selected.status === 'published'} className="h-[184px] w-full resize-none rounded-lg border border-ink-150 bg-white p-3 font-mono text-[12px] leading-6 text-ink-700 outline-none focus:border-sky-400" /></>}</div></div></div>
            <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-[11px] text-ink-500">保存编辑会使已审核草稿回到草稿态，保证发布审查的是当前文件树。</p><button type="button" data-testid="skill-author-save" onClick={() => void save()} disabled={saving || selected.status === 'published'} className="rounded-lg border border-ink-200 px-3.5 py-2 text-[12px] font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-50">保存草稿</button></div>
          </section>
          <aside className="rounded-xl border border-ink-150 bg-ink-50/60 p-4" aria-label="审核与发布">
            <p className="text-[12px] font-medium text-ink-800">审核与发布</p><span data-testid="skill-author-status" className="mt-2 inline-flex rounded-full bg-ink-200 px-2 py-1 text-[10px] font-medium text-ink-700">{statusLabel(selected.status)}</span>
            <div data-testid="skill-author-review" className="mt-4 space-y-2">{selected.review.checks.length === 0 ? <p className="text-[11px] leading-5 text-ink-500">尚未提交审核。审核会检查名称、简介、分类、使用说明、输出类型、SKILL.md 与语义版本。</p> : selected.review.checks.map((check) => <p key={check.id} className={cn('flex gap-1.5 text-[11px] leading-5', check.passed ? 'text-emerald-700' : 'text-red-700')}><IconCheck size={13} className={check.passed ? '' : 'opacity-35'} />{check.passed ? `${check.label} 已通过` : check.message}</p>)}</div>
            <div className="mt-5 space-y-2 border-t border-ink-150 pt-4">{selected.status === 'published' ? <button type="button" data-testid="skill-author-unpublish" onClick={() => void action('unpublish')} disabled={saving} className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-[12px] font-medium text-red-700 hover:bg-red-50">下架 Skill</button> : <><button type="button" data-testid="skill-author-submit-review" onClick={() => void action('submit_review')} disabled={saving} className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-[12px] font-medium text-ink-700 hover:bg-ink-100">提交本地审核</button><button type="button" data-testid="skill-author-publish" onClick={() => void action('publish')} disabled={saving || selected.status !== 'in_review' || selected.review.status !== 'approved'} className="w-full rounded-lg bg-ink-900 px-3 py-2 text-[12px] font-medium text-white hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-40">发布至“我的”</button></>}</div>
          </aside>
        </div>}
      </div>
    </Dialog>
  </>
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block text-[11px] font-medium text-ink-600"><span className="mb-1.5 block">{label}</span>{children}</label> }
function statusLabel(status: AuthoredSkill['status']) { return ({ draft: '草稿', in_review: '审核通过，待发布', published: '已发布', unpublished: '已下架' })[status] }
