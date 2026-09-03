import { MODEL_CATALOG_VERSION, MODELS, type ModelMedia } from '@/domain/models'
import { handle, HttpError } from '@/server/http'

export const dynamic = 'force-dynamic'

const MEDIA = new Set<ModelMedia>(['image', 'video', 'audio', 'text'])

/** Versioned local model registry consumed by every model selector. */
export async function GET(request: Request) {
  return handle(async () => {
    const url = new URL(request.url)
    const mediaParam = url.searchParams.get('media')
    if (mediaParam && !MEDIA.has(mediaParam as ModelMedia)) {
      throw new HttpError(400, `未知模型媒体类型: ${mediaParam}`)
    }

    const media = (mediaParam as ModelMedia | null) ?? null
    const query = (url.searchParams.get('q') ?? '').trim()
    const needle = query.toLocaleLowerCase('zh-CN')
    const items = MODELS.filter((model) => !media || model.media === media).filter((model) => {
      if (!needle) return true
      return [model.id, model.label, model.provider, model.description, ...(model.tags ?? [])]
        .join('\n')
        .toLocaleLowerCase('zh-CN')
        .includes(needle)
    })

    return { version: MODEL_CATALOG_VERSION, media, query, items }
  })
}
