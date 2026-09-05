import { AccessKeyCommandRequestSchema, AccessKeyResponseSchema } from '@/contracts/account-external'
import { commandLocalAccessKey, readLocalAccessKey } from '@/server/account-boundaries'
import { handle, parseJsonBody } from '@/server/http'

export const dynamic = 'force-dynamic'

export async function GET() {
  return handle(async () => AccessKeyResponseSchema.parse(await readLocalAccessKey()))
}

export async function POST(request: Request) {
  return handle(async () => {
    const body = await parseJsonBody(request, AccessKeyCommandRequestSchema)
    return AccessKeyResponseSchema.parse(await commandLocalAccessKey(body))
  })
}
