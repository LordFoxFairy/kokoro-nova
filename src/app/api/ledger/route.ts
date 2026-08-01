import { handle, HttpError } from '@/server/http'
import { projectLedger } from '@/server/ledger-view'
import { DEFAULT_SPACE_ID, readState } from '@/server/store'

export const dynamic = 'force-dynamic'

const MAX_LIMIT = 200

function parseLimit(raw: string | null): number | undefined {
  if (raw === null || raw === '') return undefined
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1) throw new HttpError(400, 'limit 需要是正整数')
  return Math.min(value, MAX_LIMIT)
}

export async function GET(request: Request) {
  return handle(async () => {
    const limit = parseLimit(new URL(request.url).searchParams.get('limit'))
    const state = await readState()
    return projectLedger(state, DEFAULT_SPACE_ID, limit)
  })
}
