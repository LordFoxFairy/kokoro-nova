import {
  GetMaterialResponseSchema,
  ToggleMaterialFavouriteRequestSchema,
  ToggleMaterialFavouriteResponseSchema,
} from '@/contracts/materials'
import { handle, HttpError } from '@/server/http'
import { getMaterial, setMaterialFavourite } from '@/server/materials'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ materialId: string }> }

export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const { materialId } = await params
    return GetMaterialResponseSchema.parse({ material: await getMaterial(materialId) })
  })
}

/** Explicit target-state mutation; retrying the same star action is idempotent. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const { materialId } = await params
    const body = ToggleMaterialFavouriteRequestSchema.safeParse(await request.json().catch(() => ({})))
    if (!body.success) throw new HttpError(400, 'action 只接受 favourite 或 unfavourite')
    return ToggleMaterialFavouriteResponseSchema.parse({
      material: await setMaterialFavourite(materialId, body.data.action === 'favourite'),
    })
  })
}
