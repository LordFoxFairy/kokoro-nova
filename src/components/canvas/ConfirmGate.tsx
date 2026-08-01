'use client'

import { MODELS_BY_ID } from '@/domain/models'
import type { GenerationJob } from '@/domain/types'
import { useEditor } from '@/lib/editor-store'
import { Dialog } from '../ui/Dialog'
import { IconCredit, IconWarning } from '../icons'

/**
 * Confirm gate.
 *
 * No paid generation starts without passing through here: the quote is frozen
 * server-side, the balance check happens before the reservation, and the user
 * sees the exact breakdown they are agreeing to.
 */
export function ConfirmGate({
  job,
  onConfirm,
  onCancel,
  onClose,
}: {
  job: GenerationJob | null
  onConfirm: (jobId: string) => void
  onCancel: (jobId: string) => void
  onClose: () => void
}) {
  const balance = useEditor((s) => s.balance)
  const document = useEditor((s) => s.document)

  if (!job || job.status !== 'awaiting_confirmation') return null

  const node = document.nodes.find((n) => n.id === job.nodeId)
  const model = MODELS_BY_ID.get(job.modelId)
  const insufficient = job.quote.credits > balance

  return (
    <Dialog open onClose={onClose} title="确认生成" width={420} testId="confirm-gate">
      <div className="space-y-4">
        <div className="space-y-1.5 text-[13px]">
          <Row label="节点" value={node?.name ?? job.nodeId} />
          <Row label="模型" value={`${model?.label ?? job.modelId}（${model?.latencyLabel ?? ''}）`} />
          {job.spec.output.aspectRatio && <Row label="画幅" value={job.spec.output.aspectRatio} />}
          {job.spec.output.resolution && <Row label="分辨率" value={job.spec.output.resolution} />}
          {job.spec.output.durationSeconds && <Row label="时长" value={`${job.spec.output.durationSeconds} 秒`} />}
          <Row label="数量" value={`${job.spec.output.count ?? 1}`} />
          <Row label="输入" value={`${job.spec.inputs.length} 项`} />
        </div>

        <div className="rounded-xl bg-ink-50 p-3">
          <div className="mb-2 text-[12px] font-medium text-ink-600">积分预估</div>
          <div className="space-y-1">
            {job.quote.breakdown.map((line, index) => (
              <div key={`${line.label}-${index}`} className="flex justify-between text-[12px] text-ink-500">
                <span>{line.label}</span>
                <span className="tabular-nums">{line.credits > 0 ? `+${line.credits}` : line.credits}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-ink-200 pt-2 text-[13px] font-medium text-ink-900">
            <span>合计</span>
            <span className="flex items-center gap-0.5 tabular-nums">
              <IconCredit size={13} className="text-running" />
              {job.quote.credits}
            </span>
          </div>
          <div className="mt-1 text-right text-[11px] text-ink-400">当前余额 {balance}</div>
        </div>

        {insufficient && (
          <div className="flex items-start gap-2 rounded-xl bg-danger/8 p-3 text-[12px] text-danger">
            <IconWarning size={14} className="mt-px shrink-0" />
            <span>积分不足，需要 {job.quote.credits}，当前余额 {balance}。</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 pt-5">
        <button
          type="button"
          onClick={() => onCancel(job.id)}
          className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-ink-600 transition-colors hover:bg-ink-50"
        >
          取消
        </button>
        <button
          type="button"
          data-testid="confirm-generate"
          disabled={insufficient}
          onClick={() => onConfirm(job.id)}
          className={
            insufficient
              ? 'cursor-not-allowed rounded-lg bg-ink-200 px-3.5 py-2 text-[13px] font-medium text-white'
              : 'rounded-lg bg-ink-900 px-3.5 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-85'
          }
        >
          确认生成
        </button>
      </div>
    </Dialog>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="shrink-0 text-ink-400">{label}</span>
      <span className="truncate text-ink-800">{value}</span>
    </div>
  )
}
