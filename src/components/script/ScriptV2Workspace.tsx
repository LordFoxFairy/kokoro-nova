'use client'

import { useEffect, useState, type ReactNode } from 'react'
import {
  appendScriptV2Row,
  moveScriptV2Row,
  removeScriptV2Row,
  updateScriptV2Row,
  type ScriptV2RowPatch,
  type ScriptV2Stage,
  type ScriptV2State,
} from '@/domain/script-v2'
import { cn } from '@/lib/cn'
import { IconCheck, IconClose, IconPlus, IconScript, IconSparkle } from '../icons'
import { ScriptV2ShotTable } from './ScriptV2ShotTable'

interface ScriptV2WorkspaceProps {
  open: boolean
  state: ScriptV2State | null
  nodeName: string
  onStateChange: (change: ScriptV2StateChange, label?: string) => void | Promise<void>
  onClose: () => void
}

export type ScriptV2StateChange =
  | ScriptV2State
  | ((current: ScriptV2State) => ScriptV2State)

function promptReady(state: ScriptV2State) {
  return state.rows.filter((row) => {
    const accepted = (value: string) => value === 'synced' || value === 'user_edited'
    return (
      row.imageGenerationPrompt.trim() &&
      row.videoMotionPrompt.trim() &&
      accepted(row.imagePromptState) &&
      accepted(row.videoPromptState)
    )
  }).length
}

/** Full-screen three-stage Script V2 workspace rooted in canonical node state. */
export function ScriptV2Workspace({
  open,
  state,
  nodeName,
  onStateChange,
  onClose,
}: ScriptV2WorkspaceProps) {
  const [childSurfaceOpen, setChildSurfaceOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (childSurfaceOpen) return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', closeOnEscape, true)
    return () => window.removeEventListener('keydown', closeOnEscape, true)
  }, [childSurfaceOpen, onClose, open])

  useEffect(() => {
    if (!open) setChildSurfaceOpen(false)
  }, [open])

  if (!open || !state) return null

  const allAssets = [...state.assets.characters, ...state.assets.scenes, ...state.assets.props]
  const readyAssets = allAssets.filter((asset) => asset.status === 'ready').length
  const readyPrompts = promptReady(state)
  const stageCompletions =
    (state.rows.length > 0 ? 1 : 0) +
    (allAssets.length > 0 && readyAssets === allAssets.length ? 1 : 0) +
    (state.rows.length > 0 && readyPrompts === state.rows.length ? 1 : 0)
  const stages: Array<{ id: ScriptV2Stage; title: string; subtitle: string }> = [
    { id: 'shots', title: '确认镜头', subtitle: `${state.rows.length}个镜头已就绪` },
    {
      id: 'assets',
      title: '准备资产',
      subtitle: `${readyAssets}/${allAssets.length} 已生成${readyAssets < allAssets.length ? `、还差 ${allAssets.length - readyAssets} 个` : ''}`,
    },
    { id: 'prompts', title: '合成提示词', subtitle: `${readyPrompts}/${state.rows.length} 已合成` },
  ]
  const canCompose = state.rows.length > 0 && state.rows.every((row) => row.plotDescription.trim())

  const setStage = (activeStage: ScriptV2Stage) => {
    void onStateChange(
      (current) => ({ ...current, activeStage }),
      `切换到${stages.find((stage) => stage.id === activeStage)?.title}`,
    )
  }

  const patchRow = (rowId: string, patch: ScriptV2RowPatch, label: string) => {
    void onStateChange((current) => updateScriptV2Row(current, rowId, patch), label)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="脚本 V2 工作区"
      data-testid="script-v2-workspace"
      className="fixed inset-0 z-[160] flex flex-col bg-[#171717] text-white"
    >
      <header className="flex h-[72px] shrink-0 items-center gap-4 border-b border-white/8 px-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/7 text-white/70">
          <IconScript size={17} />
        </span>
        <div className="w-[180px] min-w-0">
          <h2 className="truncate text-[13px] font-medium text-white/88">{state.title || nodeName}</h2>
          <p className="truncate text-[10px] text-white/32">脚本 V2 · 自动保存</p>
        </div>

        <nav data-testid="script-v2-stages" aria-label="脚本阶段" className="mx-auto flex min-w-0 flex-1 items-center justify-center">
          {stages.map((stage, index) => {
            const active = state.activeStage === stage.id
            const complete = index === 0 && state.rows.length > 0
            return (
              <div key={stage.id} className="flex min-w-0 items-center">
                <button
                  type="button"
                  aria-label={`${stage.title} ${stage.subtitle}`}
                  aria-current={active ? 'step' : undefined}
                  onClick={() => setStage(stage.id)}
                  className={cn(
                    'group/stage flex min-w-[150px] items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/5',
                    active && 'bg-white/[0.055]',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold',
                      active
                        ? 'border-white bg-white text-[#202020]'
                        : complete
                          ? 'border-emerald-400/50 bg-emerald-400/15 text-emerald-300'
                          : 'border-white/16 text-white/44',
                    )}
                  >
                    {complete && !active ? <IconCheck size={12} /> : index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={cn('block text-[11px] font-medium', active ? 'text-white/88' : 'text-white/58')}>
                      {stage.title}
                    </span>
                    <span className="block truncate text-[9px] text-white/30">{stage.subtitle}</span>
                  </span>
                </button>
                {index < stages.length - 1 && <span className="mx-1 h-px w-9 bg-white/12" />}
              </div>
            )
          })}
        </nav>

        <span className="shrink-0 text-[10px] text-white/36">
          {stageCompletions}/3 完成后可批量生视频
        </span>
        <button
          type="button"
          aria-label="关闭 (ESC)"
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white/42 hover:bg-white/8 hover:text-white"
        >
          <IconClose size={17} />
        </button>
      </header>

      {state.activeStage === 'shots' ? (
        <ScriptV2ShotTable
          rows={state.rows}
          onPatch={patchRow}
          onMove={(from, to) =>
            void onStateChange((current) => moveScriptV2Row(current, from, to), '调整镜头顺序')
          }
          onDelete={(rowId, shotNumber) =>
            void onStateChange(
              (current) => removeScriptV2Row(current, rowId),
              `删除镜头 ${shotNumber}`,
            )
          }
          onChildSurfaceChange={setChildSurfaceOpen}
        />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center text-[12px] text-white/35">
          {state.activeStage === 'assets' ? '准备资产' : '合成提示词'}
        </div>
      )}

      <footer className="flex h-16 shrink-0 items-center border-t border-white/8 bg-[#1d1d1d] px-5">
        {state.activeStage === 'shots' && (
          <>
            <FooterButton
              icon={<IconPlus size={15} />}
              onClick={() => void onStateChange((current) => appendScriptV2Row(current), '添加镜头')}
            >
              添加镜头
            </FooterButton>
            <button
              type="button"
              disabled={!canCompose}
              title={canCompose ? undefined : '请先补全所有镜头的画面描述'}
              className="ml-auto flex h-10 items-center gap-2 rounded-xl bg-white px-5 text-[12px] font-medium text-[#202020] disabled:cursor-not-allowed disabled:opacity-30"
            >
              <IconSparkle size={14} />
              一键合成全部提示词
            </button>
          </>
        )}
      </footer>
    </div>
  )
}

function FooterButton({ icon, children, onClick }: { icon: ReactNode; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 items-center gap-2 rounded-xl px-3 text-[12px] font-medium text-white/66 hover:bg-white/7 hover:text-white/90"
    >
      {icon}
      {children}
    </button>
  )
}
