import { handle, HttpError } from '@/server/http'
import { resetStore } from '@/server/store'

export const dynamic = 'force-dynamic'

/**
 * Wipe the workspace store back to its seed state.
 *
 * Exists so end-to-end runs start from a known baseline instead of inheriting
 * whatever the previous run left behind. Refused in production builds — this
 * endpoint destroys every project in the space.
 */
export async function POST() {
  return handle(async () => {
    if (process.env.NODE_ENV === 'production') {
      throw new HttpError(403, '该接口仅在开发环境可用')
    }
    const state = await resetStore()
    return { ok: true, projects: state.projects.length }
  })
}
