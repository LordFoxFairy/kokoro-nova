import {
  MaterialCatalogResponseSchema,
  MaterialKindSchema,
  MaterialScopeSchema,
} from '@/contracts/materials'
import { handle, HttpError } from '@/server/http'
import { listMaterials } from '@/server/materials'

export const dynamic = 'force-dynamic'

function parseNumber(value: string | null, fallback: number, name: string, max: number, min = 0) {
  if (value === null || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new HttpError(400, `${name} 必须是 ${min} 到 ${max} 的整数`)
  }
  return parsed
}

function parseQuery(request: Request) {
  const url = new URL(request.url)
  const kind = MaterialKindSchema.safeParse(url.searchParams.get('kind') ?? 'style')
  if (!kind.success) throw new HttpError(400, 'kind 只接受 style 或 effect')
  const scope = MaterialScopeSchema.safeParse(url.searchParams.get('scope') ?? 'market')
  if (!scope.success) throw new HttpError(400, 'scope 只接受 market、favorites 或 recent')
  const commercialValue = url.searchParams.get('commercialOnly')
  if (commercialValue !== null && commercialValue !== 'true' && commercialValue !== 'false') {
    throw new HttpError(400, 'commercialOnly 只接受 true 或 false')
  }

  return {
    kind: kind.data,
    scope: scope.data,
    category: url.searchParams.get('category') ?? '全部',
    commercialOnly: commercialValue === 'true',
    modelId: url.searchParams.get('modelId') || null,
    query: (url.searchParams.get('q') ?? '').trim(),
    offset: parseNumber(url.searchParams.get('offset'), 0, 'offset', 10_000),
    limit: parseNumber(url.searchParams.get('limit'), 6, 'limit', 48, 1),
  }
}

/** Versioned style/effect directory with deterministic local pagination. */
export async function GET(request: Request) {
  return handle(async () => {
    const url = new URL(request.url)
    if (url.searchParams.get('fixture') === 'error') throw new HttpError(503, '本地素材目录暂时不可用')
    const query = parseQuery(request)
    if (url.searchParams.get('fixture') === 'empty') {
      return MaterialCatalogResponseSchema.parse({
        ...(await listMaterials({ ...query, offset: 0, limit: 1 })),
        items: [],
        page: { offset: query.offset, limit: query.limit, total: 0, hasMore: false, nextOffset: null },
      })
    }
    return listMaterials(query)
  })
}
