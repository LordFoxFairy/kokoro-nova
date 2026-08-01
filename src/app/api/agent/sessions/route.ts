import { ids } from '@/domain/ids'
import { DEFAULT_MODEL } from '@/domain/models'
import type { AgentSession } from '@/domain/types'
import { handle } from '@/server/http'
import { DEFAULT_SPACE_ID, readState, withState } from '@/server/store'

export const dynamic = 'force-dynamic'

const FREE_TURNS = 3

export async function GET(request: Request) {
  return handle(async () => {
    const url = new URL(request.url)
    const projectId = url.searchParams.get('projectId')
    const state = await readState()
    const sessions = state.sessions
      .filter((s) => (projectId ? s.projectId === projectId : true))
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return { sessions }
  })
}

export async function POST(request: Request) {
  return handle(async () => {
    const body = (await request.json().catch(() => ({}))) as {
      projectId?: string | null
      canvasId?: string | null
    }
    return withState((state) => {
      const now = new Date().toISOString()
      const session: AgentSession = {
        id: ids.session(),
        spaceId: DEFAULT_SPACE_ID,
        projectId: body.projectId ?? null,
        canvasId: body.canvasId ?? null,
        title: '新会话',
        seq: 0,
        createdAt: now,
        updatedAt: now,
        // Sharing is gated until the session has content.
        shared: false,
        settings: { generationMode: 'manual', modelId: DEFAULT_MODEL.text, freeTurns: FREE_TURNS },
      }
      state.sessions.push(session)
      return session
    })
  })
}
