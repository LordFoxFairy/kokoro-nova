import { ShowcaseCategorySchema, ShowcaseListQuerySchema, ShowcaseListResponseSchema } from '@/contracts/showcase'
import { handle, HttpError } from '@/server/http'
import { listShowcasePage } from '@/server/showcase'

export const dynamic = 'force-dynamic'

function parseInteger(value: string | null, fallback: number, label: string, max: number, min = 0) {
  if (value === null || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new HttpError(400, `${label} 必须是 ${min} 到 ${max} 的整数`)
  return parsed
}

function parseQuery(request: Request) {
  const url = new URL(request.url)
  const category = ShowcaseCategorySchema.safeParse(url.searchParams.get('category') ?? '全部')
  if (!category.success) throw new HttpError(400, 'category 不是可用的 TV Show 分类')
  const query = (url.searchParams.get('q') ?? '').trim()
  if (query.length > 160) throw new HttpError(400, 'q 最多 160 个字符')
  return ShowcaseListQuerySchema.parse({
    category: category.data,
    query,
    offset: parseInteger(url.searchParams.get('offset'), 0, 'offset', 10_000),
    limit: parseInteger(url.searchParams.get('limit'), 4, 'limit', 24, 1),
  })
}

/** Anonymous discovery projection with deterministic filters, paging and test fixtures. */
export async function GET(request: Request) {
  return handle(async () => {
    const url = new URL(request.url)
    if (url.searchParams.get('fixture') === 'error') throw new HttpError(503, '本地公开作品目录暂时不可用')
    const query = parseQuery(request)
    if (url.searchParams.get('fixture') === 'empty') {
      return ShowcaseListResponseSchema.parse({
        entries: [],
        page: { offset: query.offset, limit: query.limit, total: 0, hasMore: false, nextOffset: null, category: query.category, query: query.query, searchFallback: false },
      })
    }
    return ShowcaseListResponseSchema.parse(await listShowcasePage(query))
  })
}
