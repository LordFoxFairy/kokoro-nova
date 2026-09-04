import { describe, expect, it } from 'vitest'

import { getVideoCatalogActiveIndex, getVideoModelOptionId } from '../VideoModelCatalog'

describe('VideoModelCatalog keyboard semantics', () => {
  it('starts on the selected model and falls back to the first result', () => {
    const models = [
      { id: 'model-a' },
      { id: 'model-b' },
      { id: 'model-c' },
    ] as never[]

    expect(getVideoCatalogActiveIndex(models, 'model-b')).toBe(1)
    expect(getVideoCatalogActiveIndex(models, 'missing')).toBe(0)
    expect(getVideoCatalogActiveIndex([], 'model-b')).toBe(0)
  })

  it('creates stable option ids for aria-activedescendant', () => {
    expect(getVideoModelOptionId('seedance-2')).toBe('video-model-option-seedance-2')
  })
})
