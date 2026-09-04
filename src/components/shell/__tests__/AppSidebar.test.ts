import { describe, expect, it } from 'vitest'

import { getShellBrandLabel, getShellLayoutMode, isNavItemActive } from '../AppSidebar'

describe('authenticated shell navigation helpers', () => {
  it('keeps nested canvas routes active without making the home route sticky', () => {
    expect(isNavItemActive('/', '/')).toBe(true)
    expect(isNavItemActive('/', '/project')).toBe(false)
    expect(isNavItemActive('/project', '/project/folder-1')).toBe(true)
    expect(isNavItemActive('/canvas', '/canvas')).toBe(true)
    expect(isNavItemActive('/canvas', '/canvas/editor')).toBe(true)
  })

  it('exposes the product and capability names together', () => {
    expect(getShellBrandLabel()).toBe('Kokoro Nova · LibTV')
  })

  it('uses the collapsed shell lane at the two narrow reference widths', () => {
    expect(getShellLayoutMode(1440)).toBe('expanded')
    expect(getShellLayoutMode(1024)).toBe('collapsed')
    expect(getShellLayoutMode(768)).toBe('collapsed')
  })
})
