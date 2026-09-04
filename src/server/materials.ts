import {
  MaterialCatalogResponseSchema,
  type MaterialCatalogItem,
  type MaterialKind,
  type MaterialScope,
} from '@/contracts/materials'
import {
  MATERIAL_CATALOG_VERSION,
  MATERIAL_CATEGORIES,
  MATERIAL_FIXTURES,
  defaultMaterialFavouriteIds,
} from '@/mocks/materials'
import { MODELS_BY_ID } from '@/domain/models'
import { DEFAULT_SPACE_ID, readState, withState, type WorkspaceState } from './store'
import { HttpError } from './http'

type MaterialFavouriteCarrier = WorkspaceState & { materialFavourites?: Record<string, string[]> }

export interface MaterialListInput {
  kind: MaterialKind
  scope: MaterialScope
  category: string
  commercialOnly: boolean
  modelId: string | null
  query: string
  offset: number
  limit: number
}

function readFavouriteIds(state: WorkspaceState): Set<string> {
  const stored = (state as MaterialFavouriteCarrier).materialFavourites?.[DEFAULT_SPACE_ID]
  return new Set(Array.isArray(stored) ? stored : defaultMaterialFavouriteIds())
}

function writeFavouriteIds(state: WorkspaceState, ids: Iterable<string>) {
  const carrier = state as MaterialFavouriteCarrier
  carrier.materialFavourites ??= {}
  carrier.materialFavourites[DEFAULT_SPACE_ID] = [...ids].sort()
}

function categoryFor(kind: MaterialKind, category: string): string {
  if (category === '全部') return category
  if (!(MATERIAL_CATEGORIES[kind] as readonly string[]).includes(category)) {
    throw new HttpError(400, `未知的${kind === 'style' ? '风格' : '特效'}分类: ${category}`)
  }
  return category
}

function projectItem(item: MaterialCatalogItem, favouriteIds: Set<string>): MaterialCatalogItem {
  return { ...item, favourite: favouriteIds.has(item.id) }
}

function matchingItems(input: MaterialListInput, favouriteIds: Set<string>): MaterialCatalogItem[] {
  const needle = input.query.trim().toLocaleLowerCase('zh-CN')
  const category = categoryFor(input.kind, input.category)
  return MATERIAL_FIXTURES
    .filter((item) => item.kind === input.kind)
    .filter((item) => input.scope !== 'favorites' || favouriteIds.has(item.id))
    .filter((item) => input.scope !== 'recent' || item.recent)
    .filter((item) => category === '全部' || item.category === category)
    .filter((item) => !input.commercialOnly || item.commercial)
    .filter((item) => !input.modelId || item.modelIds.includes(input.modelId))
    .filter((item) => {
      if (!needle) return true
      return [item.id, item.name, item.author, item.description, item.modelId, item.modelLabel]
        .join('\n')
        .toLocaleLowerCase('zh-CN')
        .includes(needle)
    })
    .map((item) => projectItem(item, favouriteIds))
}

function modelsFor(items: readonly MaterialCatalogItem[]) {
  const seen = new Set<string>()
  return items.flatMap((item) => item.modelIds).filter((id) => {
    if (seen.has(id)) return false
    seen.add(id)
    return MODELS_BY_ID.has(id)
  }).map((id) => {
    return { id, label: MODELS_BY_ID.get(id)?.label ?? id }
  })
}

export async function listMaterials(input: MaterialListInput) {
  const state = await readState()
  const favouriteIds = readFavouriteIds(state)
  const rows = matchingItems(input, favouriteIds)
  const start = Math.min(input.offset, rows.length)
  const items = rows.slice(start, start + input.limit)
  const page = {
    offset: input.offset,
    limit: input.limit,
    total: rows.length,
    hasMore: start + items.length < rows.length,
    nextOffset: start + items.length < rows.length ? start + items.length : null,
  }
  return MaterialCatalogResponseSchema.parse({
    version: MATERIAL_CATALOG_VERSION,
    kind: input.kind,
    scope: input.scope,
    query: input.query,
    category: input.category,
    commercialOnly: input.commercialOnly,
    modelId: input.modelId,
    categories: MATERIAL_CATEGORIES[input.kind],
    models: modelsFor(MATERIAL_FIXTURES.filter((item) => item.kind === input.kind)),
    items,
    page,
  })
}

export async function getMaterial(materialId: string): Promise<MaterialCatalogItem> {
  const item = MATERIAL_FIXTURES.find((candidate) => candidate.id === materialId)
  if (!item) throw new HttpError(404, '风格或特效不存在或已下架')
  const state = await readState()
  return projectItem(item, readFavouriteIds(state))
}

export async function setMaterialFavourite(materialId: string, favourite: boolean): Promise<MaterialCatalogItem> {
  const item = MATERIAL_FIXTURES.find((candidate) => candidate.id === materialId)
  if (!item) throw new HttpError(404, '风格或特效不存在或已下架')

  return withState((state) => {
    const ids = readFavouriteIds(state)
    if (favourite) ids.add(materialId)
    else ids.delete(materialId)
    writeFavouriteIds(state, ids)
    return projectItem(item, ids)
  })
}
