import { PreferencesResponseSchema, UpdatePreferencesRequestSchema } from '@/contracts/preferences'
import { handle, parseJsonBody } from '@/server/http'
import { readLocalPreferences, updateLocalPreferences } from '@/server/identity'

export const dynamic = 'force-dynamic'

export async function GET() {
  return handle(async () => PreferencesResponseSchema.parse({ preferences: await readLocalPreferences() }))
}

export async function PATCH(request: Request) {
  return handle(async () => {
    const body = await parseJsonBody(request, UpdatePreferencesRequestSchema)
    return PreferencesResponseSchema.parse({ preferences: await updateLocalPreferences(body) })
  })
}
