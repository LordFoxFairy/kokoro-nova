import { AccountExternalHandoffsResponseSchema } from '@/contracts/account-external'
import { readLocalAccountHandoffs } from '@/server/account-boundaries'
import { handle } from '@/server/http'

export const dynamic = 'force-dynamic'

export async function GET() {
  return handle(async () => AccountExternalHandoffsResponseSchema.parse(await readLocalAccountHandoffs()))
}
