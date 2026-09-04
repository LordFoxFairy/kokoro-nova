import { ScriptV2QuoteRequestSchema } from '@/contracts/script-v2'
import { handle, parseJsonBody } from '@/server/http'
import { quoteScriptV2 } from '@/server/script-v2'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  return handle(async () => {
    const body = await parseJsonBody(request, ScriptV2QuoteRequestSchema, {
      validationStatus: 422,
    })
    return quoteScriptV2(body)
  })
}
