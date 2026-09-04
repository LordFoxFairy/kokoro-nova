'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  canGenerateClonedVoice,
  type AudioAuthoringState,
  type LocalVoice,
} from '@/domain/audio-authoring'
import {
  VOICE_CATALOG_TOTAL,
  VOICE_PAGE_SIZE,
  voiceCatalogFixtures,
  type VoicePreset,
} from '@/domain/libraries'
import { cn } from '@/lib/cn'
import {
  IconAudio,
  IconClose,
  IconFilter,
  IconMore,
  IconPause,
  IconPlay,
  IconRefresh,
  IconSearch,
} from '../icons'

type VoiceTab = 'library' | 'mine' | 'favorites'

interface VoiceFilters {
  language: string
  accent: string
  gender: string
  ages: string[]
}

const EMPTY_FILTERS: VoiceFilters = { language: '', accent: '', gender: '', ages: [] }
const LOCAL_PREVIEW_URL = '/fixtures/libtv/media/compositor-bed.wav'
const CLONE_SCRIPTS = [
  '每一段影像背后，都藏着一个想被表达的故事。有人记录城市的变化，有人记录家庭的日常，也有人把想象中的世界做成画面。工具的意义，不只是提高效率，更是帮助创作者降低表达的门槛。只要愿意开始，一个普通的想法，也可能变成动人的作品。',
  '清晨的风穿过街角，树叶和远处的车声一起醒来。请用自然、稳定的速度读完这段文字，让每个停顿都保持轻松。',
] as const

export interface VoiceLibraryDialogProps {
  state: AudioAuthoringState
  selectedVoiceId: string
  onChange: (producer: (current: AudioAuthoringState) => AudioAuthoringState) => void
  onClose: () => void
}

export function VoiceLibraryDialog({ state, selectedVoiceId, onChange, onClose }: VoiceLibraryDialogProps) {
  const [tab, setTab] = useState<VoiceTab>('library')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<VoiceFilters>(EMPTY_FILTERS)
  const [filterOpen, setFilterOpen] = useState(false)
  const [cloneOpen, setCloneOpen] = useState(false)
  const [previewVoiceId, setPreviewVoiceId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const publicVoices = useMemo(() => voiceCatalogFixtures(), [])

  useEffect(() => setPage(1), [filters, query, tab])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (previewVoiceId) {
      audio.currentTime = 0
      void audio.play().catch(() => undefined)
    } else {
      audio.pause()
    }
  }, [previewVoiceId])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (cloneOpen) {
        setCloneOpen(false)
        return
      }
      if (filterOpen) {
        setFilterOpen(false)
        return
      }
      onClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [cloneOpen, filterOpen, onClose])

  const source: VoicePreset[] = tab === 'library'
    ? publicVoices
    : tab === 'mine'
      ? state.customVoices
      : [...publicVoices, ...state.customVoices].filter((voice) => state.favoriteVoiceIds.includes(voice.id))

  const filtered = source.filter((voice) => {
    const needle = query.trim().toLocaleLowerCase('zh-CN')
    if (needle && ![voice.name, voice.language, voice.accent, ...voice.tags].join('\n').toLocaleLowerCase('zh-CN').includes(needle)) return false
    if (filters.language && voice.language !== filters.language) return false
    if (filters.accent && voice.accent !== filters.accent) return false
    if (filters.gender && voice.gender !== filters.gender) return false
    if (filters.ages.length > 0 && !filters.ages.includes(voice.age)) return false
    return true
  })
  const pageCount = Math.max(1, Math.ceil(filtered.length / VOICE_PAGE_SIZE))
  const visibleVoices = filtered.slice((page - 1) * VOICE_PAGE_SIZE, page * VOICE_PAGE_SIZE)
  const hasFilters = Boolean(filters.language || filters.accent || filters.gender || filters.ages.length)
  const totalLabel = tab === 'library' && !query.trim() && !hasFilters
    ? VOICE_CATALOG_TOTAL
    : filtered.length

  const changeTab = (next: VoiceTab) => {
    setTab(next)
    setQuery('')
    setFilters(EMPTY_FILTERS)
  }

  const toggleFavorite = (voiceId: string) => {
    onChange((current) => {
      const selected = current.favoriteVoiceIds.includes(voiceId)
      return {
        ...current,
        favoriteVoiceIds: selected
          ? current.favoriteVoiceIds.filter((id) => id !== voiceId)
          : [...current.favoriteVoiceIds, voiceId],
      }
    })
  }

  const selectVoice = (voiceId: string) => {
    onChange((current) => ({ ...current, settings: { ...current.settings, voiceId } }))
    onClose()
  }

  if (typeof window === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/62 p-8 backdrop-blur-[2px]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="音色选择"
        data-testid="voice-library-dialog"
        className="flex h-[760px] w-[960px] max-h-[calc(100vh-64px)] max-w-[calc(100vw-64px)] flex-col overflow-hidden rounded-[20px] bg-white text-[#262626] shadow-[0_28px_90px_rgba(0,0,0,.45)]"
      >
        <header className="flex h-[70px] shrink-0 items-center border-b border-[#ececec] px-6">
          <h2 className="text-[18px] font-semibold">音色选择</h2>
          <button type="button" aria-label="关闭音色选择" onClick={onClose} className="ml-auto flex h-9 w-9 items-center justify-center rounded-xl text-[#5c5c5c] hover:bg-[#f2f2f2]"><IconClose size={22} /></button>
        </header>

        <div className="flex shrink-0 items-center gap-3 px-6 py-4">
          <div role="tablist" aria-label="音色分类" className="flex rounded-xl bg-[#f5f5f5] p-1">
            {([
              ['library', '音色库'],
              ['mine', '我的音色'],
              ['favorites', '收藏音色'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => changeTab(id)}
                className={cn('h-10 rounded-lg px-5 text-[14px]', tab === id ? 'bg-[#e8e8e8] font-medium text-[#191919]' : 'text-[#595959] hover:text-[#222]')}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setCloneOpen(true)} className="ml-auto flex h-11 items-center gap-2 rounded-xl bg-[#ebfaff] px-4 text-[14px] font-medium text-[#0bb9dc]"><IconAudio size={16} />克隆新音色</button>
          <label className="flex h-11 w-[286px] items-center gap-2 rounded-xl bg-[#f5f5f5] px-4 text-[#666] focus-within:ring-2 focus-within:ring-[#a9e9f4]">
            <IconSearch size={18} />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="搜索音色库" placeholder="搜索音色库" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[#8b8b8b]" />
          </label>
          <button type="button" onClick={() => setFilterOpen(true)} className="flex h-11 items-center gap-2 rounded-xl bg-[#f5f5f5] px-4 text-[14px]"><IconFilter size={17} />筛选</button>
        </div>

        <div className="thin-scrollbar min-h-0 flex-1 space-y-1.5 overflow-y-auto px-6 pb-3">
          {visibleVoices.map((voice) => {
            const selected = voice.id === selectedVoiceId
            const favorite = state.favoriteVoiceIds.includes(voice.id)
            const previewing = previewVoiceId === voice.id
            return (
              <div key={voice.id} data-testid={`voice-row-${voice.id}`} className={cn('flex min-h-[68px] items-center gap-4 rounded-xl px-3', selected ? 'bg-[#ececec]' : 'bg-[#f6f6f6]')}>
                <button
                  type="button"
                  aria-label={`${previewing ? '停止试听' : '试听'} ${voice.name}`}
                  onClick={() => setPreviewVoiceId(previewing ? null : voice.id)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#e9e9e9] text-[#444] hover:bg-[#dedede]"
                >
                  {previewing ? <IconPause size={18} /> : <IconPlay size={18} />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-medium">{voice.name}</div>
                  {voice.tags.includes('本地样本') && <div className="text-[11px] text-[#999]">确定性本地预览</div>}
                </div>
                <span className="rounded bg-[#ededed] px-1.5 py-0.5 text-[11px] text-[#777]">{voice.language}({voice.accent})</span>
                <span className="rounded bg-[#ededed] px-1.5 py-0.5 text-[11px] text-[#777]">{voice.gender}</span>
                <button
                  type="button"
                  aria-label={`选择 ${voice.name}`}
                  disabled={selected}
                  onClick={() => selectVoice(voice.id)}
                  className={cn('h-9 rounded-full px-4 text-[13px]', selected ? 'bg-[#d2d2d2] text-[#777]' : 'bg-[#151515] text-white hover:bg-black')}
                >
                  {selected ? '已选' : '选择'}
                </button>
                <button type="button" aria-label={`${favorite ? '取消收藏' : '收藏'} ${voice.name}`} onClick={() => toggleFavorite(voice.id)} className="flex h-9 w-9 items-center justify-center rounded-full text-[24px] leading-none text-[#555] hover:bg-[#e8e8e8]">{favorite ? '★' : '☆'}</button>
                <button type="button" aria-label={`更多 ${voice.name}`} className="flex h-9 w-9 items-center justify-center rounded-full text-[#666] hover:bg-[#e8e8e8]"><IconMore size={17} /></button>
              </div>
            )
          })}
          {visibleVoices.length === 0 && (
            <div className="flex h-full min-h-48 items-center justify-center text-[14px] text-[#999]">
              {tab === 'mine' ? '还没有克隆音色' : tab === 'favorites' ? '还没有收藏音色' : '没有匹配的音色'}
            </div>
          )}
        </div>

        <footer className="flex h-[68px] shrink-0 items-center border-t border-[#ececec] px-6 text-[13px] text-[#666]">
          <button type="button" disabled={page <= 1} aria-label="上一页" onClick={() => setPage((value) => Math.max(1, value - 1))} className="h-8 w-8 disabled:opacity-30">‹</button>
          {pageButtons(pageCount).map((item, index) => item === 'ellipsis' ? (
            <span key={`ellipsis-${index}`} className="w-9 text-center">…</span>
          ) : (
            <button key={item} type="button" aria-current={page === item ? 'page' : undefined} onClick={() => setPage(item)} className={cn('h-9 min-w-9 rounded-lg px-2', page === item && 'bg-[#ededed] text-[#222]')}>{item}</button>
          ))}
          <button type="button" disabled={page >= pageCount} aria-label="下一页" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="h-8 w-8 disabled:opacity-30">›</button>
          <span className="ml-5 rounded-lg bg-[#f1f1f1] px-3 py-2">20条/页</span>
          <span className="ml-auto">共 {totalLabel} 条</span>
        </footer>
        <audio ref={audioRef} src={LOCAL_PREVIEW_URL} onEnded={() => setPreviewVoiceId(null)} className="hidden" />
      </section>

      {filterOpen && (
        <VoiceFilterDialog value={filters} voices={publicVoices} onApply={(next) => { setFilters(next); setFilterOpen(false) }} onClose={() => setFilterOpen(false)} />
      )}
      {cloneOpen && (
        <VoiceCloneDialog
          sequence={state.customVoices.length + 1}
          onCreate={(voice) => {
            onChange((current) => ({
              ...current,
              customVoices: [...current.customVoices, voice],
            }))
            setTab('mine')
            setQuery('')
            setFilters(EMPTY_FILTERS)
            setCloneOpen(false)
          }}
          onClose={() => setCloneOpen(false)}
        />
      )}
    </div>,
    window.document.body,
  )
}

function pageButtons(pageCount: number): Array<number | 'ellipsis'> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1)
  return [1, 2, 3, 4, 5, 'ellipsis', pageCount]
}

function VoiceFilterDialog({
  value,
  voices,
  onApply,
  onClose,
}: {
  value: VoiceFilters
  voices: VoicePreset[]
  onApply: (next: VoiceFilters) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<VoiceFilters>({ ...value, ages: [...value.ages] })
  const languages = [...new Set(voices.map((voice) => voice.language))]
  const accents = draft.language
    ? [...new Set(voices.filter((voice) => voice.language === draft.language).map((voice) => voice.accent))]
    : []

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/55 p-8">
      <section role="dialog" aria-modal="true" aria-label="语音过滤器" data-testid="voice-filter-dialog" className="w-[720px] overflow-hidden rounded-[20px] bg-white text-[#292929] shadow-2xl">
        <header className="flex h-16 items-center border-b border-[#ececec] px-6"><h3 className="text-[18px] font-semibold">语音过滤器</h3><button type="button" aria-label="关闭语音过滤器" onClick={onClose} className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[#f3f3f3]"><IconClose size={21} /></button></header>
        <div className="grid grid-cols-2 gap-x-8 gap-y-5 px-6 py-6">
          <FilterSelect label="语言" value={draft.language} options={languages} placeholder="语言" onChange={(language) => setDraft({ ...draft, language, accent: '' })} />
          <FilterSelect label="口音" value={draft.accent} options={accents} placeholder="口音" disabled={!draft.language} onChange={(accent) => setDraft({ ...draft, accent })} />
          <FilterSelect label="性别" value={draft.gender} options={['男', '女', '中性', 'Character']} placeholder="全部" onChange={(gender) => setDraft({ ...draft, gender })} />
          <div>
            <div className="mb-2 text-[14px] text-[#666]">年龄</div>
            <div className="flex gap-2">
              {['青年', '成年', '儿童', '老年'].map((age) => (
                <button key={age} type="button" aria-pressed={draft.ages.includes(age)} onClick={() => setDraft({ ...draft, ages: draft.ages.includes(age) ? draft.ages.filter((item) => item !== age) : [...draft.ages, age] })} className={cn('h-10 rounded-xl px-4 text-[13px]', draft.ages.includes(age) ? 'bg-[#dedede] text-[#222]' : 'bg-[#f5f5f5] text-[#666]')}>{age}</button>
              ))}
            </div>
          </div>
        </div>
        <footer className="flex h-16 items-center border-t border-[#ececec] px-6">
          <button type="button" onClick={() => setDraft(EMPTY_FILTERS)} className="flex items-center gap-2 text-[13px] text-[#666]"><IconRefresh size={15} />重置参数</button>
          <button type="button" onClick={() => onApply(draft)} className="ml-auto h-10 rounded-xl bg-[#151515] px-6 text-[14px] text-white">筛选</button>
        </footer>
      </section>
    </div>
  )
}

function FilterSelect({
  label,
  value,
  options,
  placeholder,
  disabled,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  placeholder: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <label>
      <span className="mb-2 block text-[14px] text-[#666]">{label}</span>
      <select aria-label={label} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-xl border-0 bg-[#f5f5f5] px-4 text-[14px] outline-none disabled:text-[#aaa]">
        <option value="">{placeholder}</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  )
}

function VoiceCloneDialog({
  sequence,
  onCreate,
  onClose,
}: {
  sequence: number
  onCreate: (voice: LocalVoice) => void
  onClose: () => void
}) {
  const [scriptIndex, setScriptIndex] = useState(0)
  const [name, setName] = useState(`我的音色 ${sequence}`)
  const [recording, setRecording] = useState<'idle' | 'recording' | 'recorded'>('idle')
  const [consent, setConsent] = useState(false)
  const enabled = canGenerateClonedVoice({ hasRecording: recording === 'recorded', consent, name })

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/55 p-8">
      <section role="dialog" aria-modal="true" aria-label="克隆新音色" data-testid="voice-clone-dialog" className="w-[760px] overflow-hidden rounded-[20px] bg-white text-[#292929] shadow-2xl">
        <header className="flex h-16 items-center border-b border-[#ececec] px-6"><h3 className="text-[18px] font-semibold">克隆新音色</h3><button type="button" aria-label="关闭克隆新音色" onClick={onClose} className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[#f3f3f3]"><IconClose size={21} /></button></header>
        <div className="space-y-4 px-6 py-5">
          <div className="flex items-center"><span className="text-[16px] text-[#555]">朗读一段文字，即可克隆你的专属声音</span><button type="button" aria-label="文本刷新" onClick={() => setScriptIndex((value) => (value + 1) % CLONE_SCRIPTS.length)} className="ml-auto flex items-center gap-1.5 text-[13px] text-[#666]"><IconRefresh size={15} />文本刷新</button></div>
          <label className="block"><span className="mb-1.5 block text-[13px] text-[#666]">音色名称</span><input value={name} onChange={(event) => setName(event.target.value)} aria-label="音色名称" className="h-10 w-full rounded-xl border border-[#e4e4e4] px-3 text-[14px] outline-none focus:border-[#8fddeb]" /></label>
          <div className="rounded-xl border border-[#e4e4e4] p-5">
            <p className="text-[15px] leading-8"><span className="mr-3 text-[#666]">需阅读内容：</span>{CLONE_SCRIPTS[scriptIndex]}</p>
            <div className="mt-5 flex justify-center">
              {recording === 'idle' ? (
                <button type="button" onClick={() => setRecording('recording')} className="flex h-16 w-[290px] flex-col items-center justify-center rounded-full bg-[#efefef] text-[13px] text-[#666]"><IconAudio size={20} className="text-[#12badb]" />开始录音</button>
              ) : recording === 'recording' ? (
                <button type="button" onClick={() => setRecording('recorded')} className="flex h-16 w-[290px] flex-col items-center justify-center rounded-full bg-[#e8fafd] text-[13px] text-[#178da4]"><span className="mb-1 h-3 w-3 animate-pulse rounded-sm bg-[#12badb]" />停止录音</button>
              ) : (
                <div className="flex items-center gap-3"><span className="text-[13px] text-[#159469]">录音已完成</span><button type="button" onClick={() => setRecording('recording')} className="rounded-lg bg-[#f1f1f1] px-3 py-2 text-[12px]">重新录音</button></div>
              )}
            </div>
          </div>
          <label className="flex items-start gap-2 text-[13px] leading-6 text-[#555]"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} aria-label="我已阅读并同意《声音克隆功能使用规则》" className="mt-1" /><span>我已阅读并同意<a href="#voice-clone-rule" onClick={(event) => event.preventDefault()} className="font-medium underline">《声音克隆功能使用规则》</a>；我确认对所上传的声音样本具有充分、合法、必要的权利或授权，并同意将其用于声音克隆功能。</span></label>
          <div className="flex justify-end"><button type="button" disabled={!enabled} onClick={() => onCreate({ id: `voice-custom-${sequence}`, name: name.trim(), language: '中文', accent: '普通话', gender: '中性', age: '成年', tags: ['我的音色', '本地克隆'], source: 'custom', createdAt: `2026-09-03T12:${String((sequence - 1) % 60).padStart(2, '0')}:00.000Z` })} className="h-11 rounded-xl bg-[#171717] px-6 text-[14px] text-white disabled:bg-[#aaa]">生成音色</button></div>
        </div>
      </section>
    </div>
  )
}
