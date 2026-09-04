import type { JobStatus } from '@/domain/types'

const LOCKED_STATUSES = ['awaiting_confirmation', 'queued', 'running'] as const satisfies readonly JobStatus[]
const POLLING_STATUSES = ['queued', 'running'] as const satisfies readonly JobStatus[]

export interface GenerationStatusCopy {
  label: string
  description: string
}

/** Durable job state is the refresh source of truth for every media composer. */
export function isGenerationLocked(status: JobStatus | undefined): boolean {
  return status !== undefined && LOCKED_STATUSES.includes(status as (typeof LOCKED_STATUSES)[number])
}

/** Only accepted work polls; an unconfirmed quote remains actioned by ConfirmGate. */
export function isGenerationPolling(status: JobStatus | undefined): boolean {
  return status !== undefined && POLLING_STATUSES.includes(status as (typeof POLLING_STATUSES)[number])
}

/** Copy intentionally covers every persisted nonterminal state, not component timers. */
export function generationStatusCopy(status: JobStatus | undefined): GenerationStatusCopy | null {
  switch (status) {
    case 'awaiting_confirmation':
      return { label: '等待确认', description: '已提交，等待确认后开始生成' }
    case 'queued':
      return { label: '排队中', description: '已进入生成队列，请稍候' }
    case 'running':
      return { label: '生成中', description: '正在生成，请稍候' }
    default:
      return null
  }
}
