import { CreateScriptV2RunRequestSchema } from '@/contracts/script-v2'
import { handle, parseJsonBody } from '@/server/http'
import { createScriptV2Run } from '@/server/script-v2'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  return handle(async () => {
    const body = await parseJsonBody(request, CreateScriptV2RunRequestSchema, {
      validationStatus: 422,
    })
    return { run: createScriptV2Run(body) }
  })
}
