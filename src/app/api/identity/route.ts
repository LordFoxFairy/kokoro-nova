import { IdentityResponseSchema, LocalReturnToSchema, UpdateSessionRequestSchema } from '@/contracts/identity'
import { handle, HttpError, parseJsonBody } from '@/server/http'
import { readLocalIdentity, updateLocalSession } from '@/server/identity'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return handle(async () => {
    const returnTo = new URL(request.url).searchParams.get('returnTo') ?? undefined
    if (returnTo !== undefined && !LocalReturnToSchema.safeParse(returnTo).success) {
      throw new HttpError(400, 'returnTo 必须是站内相对路径')
    }
    return IdentityResponseSchema.parse(await readLocalIdentity(returnTo))
  })
}

export async function POST(request: Request) {
  return handle(async () => {
    const body = await parseJsonBody(request, UpdateSessionRequestSchema)
    return IdentityResponseSchema.parse(await updateLocalSession(body))
  })
}
