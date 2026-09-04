import { EFFECT_CATEGORIES, EFFECT_PRESETS, STYLE_CATEGORIES, STYLE_PRESETS } from '@/domain/libraries'
import { MODELS_BY_ID } from '@/domain/models'
import type { MaterialCatalogItem, MaterialKind } from '@/contracts/materials'

export const MATERIAL_CATALOG_VERSION = '2026-09-04.1'

type MaterialFixture = MaterialCatalogItem

const STYLE_FAVOURITES = new Set(['style-cine-teal', 'style-film-grain', 'style-soft-portrait'])
const STYLE_RECENT = new Set(['style-cine-teal', 'style-noir', 'style-isometric', 'style-anime-cel'])
const EFFECT_FAVOURITES = new Set(['fx-hair-blow', 'fx-time-freeze', 'fx-liquid-morph'])
const EFFECT_RECENT = new Set(['fx-hair-blow', 'fx-rain-window', 'fx-zoom-punch'])

function model(id: string) {
  // The visible effect fixture uses a compact provider alias for one model;
  // map it to a real local registry ID at the mock boundary.
  const result = MODELS_BY_ID.get(id) ?? MODELS_BY_ID.get('kling-o3')
  if (!result) throw new Error(`素材库 fixture 引用了未知模型: ${id}`)
  return { id: result.id, label: result.label }
}

function styleFixture(
  item: (typeof STYLE_PRESETS)[number],
  favourite = STYLE_FAVOURITES.has(item.id),
  recent = STYLE_RECENT.has(item.id),
): MaterialFixture {
  const modelIds = [item.preferredModelId, ...item.compatibleModelIds.filter((id) => id !== item.preferredModelId)]
  const preferred = model(item.preferredModelId)
  return {
    id: item.id,
    kind: 'style',
    name: item.name,
    category: item.category,
    author: item.author,
    commercial: item.commercial,
    usageCount: 20_000 + item.id.length * 1_337,
    modelId: preferred.id,
    modelLabel: preferred.label,
    modelIds,
    hue: item.hue,
    description: item.description,
    favourite,
    recent,
  }
}

function effectFixture(
  item: (typeof EFFECT_PRESETS)[number],
  favourite = EFFECT_FAVOURITES.has(item.id),
  recent = EFFECT_RECENT.has(item.id),
): MaterialFixture {
  const modelIds = [...new Set(item.modelIds.map((id) => model(id).id))]
  const preferred = model(modelIds[0]!)
  return {
    id: item.id,
    kind: 'effect',
    name: item.name,
    category: item.category,
    author: item.author,
    commercial: item.commercial,
    usageCount: item.usageCount,
    modelId: preferred.id,
    modelLabel: preferred.label,
    modelIds,
    hue: item.hue,
    description: item.description,
    favourite,
    recent,
  }
}

const styleExtraCategories = STYLE_CATEGORIES.filter((category) => category !== '全部')
const effectExtraCategories = EFFECT_CATEGORIES.filter((category) => category !== '全部')

/** Additional rows make the pagination path real without copying remote data. */
function generatedFixtures(kind: MaterialKind): MaterialFixture[] {
  if (kind === 'style') {
    return Array.from({ length: 15 }, (_, index) => {
      const base = STYLE_PRESETS[index % STYLE_PRESETS.length]!
      const suffix = String(index + 1).padStart(2, '0')
      const generated = {
        ...base,
        id: `style-fixture-${suffix}`,
        name: `本地风格样本 ${suffix}`,
        category: styleExtraCategories[index % styleExtraCategories.length]!,
        author: index % 3 === 0 ? 'Lib 官方' : '本地创作者',
        commercial: index % 4 !== 1,
        hue: (base.hue + index * 19) % 360,
        description: `用于目录分页回归的本地风格样本 ${suffix}。`,
        preferredModelId: base.preferredModelId,
        compatibleModelIds: base.compatibleModelIds,
      }
      return styleFixture(generated, index % 5 === 0, index % 4 === 0)
    })
  }

  return Array.from({ length: 12 }, (_, index) => {
    const base = EFFECT_PRESETS[index % EFFECT_PRESETS.length]!
    const suffix = String(index + 1).padStart(2, '0')
    const generated = {
      ...base,
      id: `fx-fixture-${suffix}`,
      name: `本地特效样本 ${suffix}`,
      category: effectExtraCategories[index % effectExtraCategories.length]!,
      author: index % 3 === 0 ? 'Lib 官方' : '本地创作者',
      commercial: index % 4 !== 1,
      usageCount: 8_000 + index * 1_250,
      hue: (base.hue + index * 23) % 360,
      description: `用于目录分页回归的本地特效样本 ${suffix}。`,
      modelIds: base.modelIds,
    }
    return effectFixture(generated, index % 5 === 0, index % 4 === 0)
  })
}
export const MATERIAL_FIXTURES: readonly MaterialFixture[] = [
  ...STYLE_PRESETS.map((item) => styleFixture(item)),
  ...generatedFixtures('style'),
  ...EFFECT_PRESETS.map((item) => effectFixture(item)),
  ...generatedFixtures('effect'),
]

export const MATERIAL_CATEGORIES: Record<MaterialKind, readonly string[]> = {
  style: STYLE_CATEGORIES,
  effect: EFFECT_CATEGORIES,
}

export function defaultMaterialFavouriteIds(): string[] {
  return MATERIAL_FIXTURES.filter((item) => item.favourite).map((item) => item.id)
}
