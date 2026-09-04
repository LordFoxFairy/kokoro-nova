import { describe, expect, it } from 'vitest'

import { CANVAS_TOOLBAR_RESPONSIVE_BREAKPOINT } from '../../canvas/BottomToolbar'
import { TOPBAR_RESPONSIVE_BREAKPOINT } from '../../canvas/TopBar'
import { getStoryboardGridTemplate } from '../StoryboardView'

describe('responsive canvas and storyboard layout', () => {
  it('keeps the three-column storyboard projection discoverable at compact widths', () => {
    expect(getStoryboardGridTemplate(true, 2)).toBe(
      'minmax(280px, 33.38%) minmax(280px, 1fr) minmax(280px, 1fr)',
    )
    expect(getStoryboardGridTemplate(true, 1)).toBe('minmax(280px, 33.38%) minmax(280px, 1fr)')
    expect(getStoryboardGridTemplate(false, 2)).toBe('repeat(2, minmax(280px, 1fr))')
  })

  it('uses one compact breakpoint for the top bar and canvas rails', () => {
    expect(TOPBAR_RESPONSIVE_BREAKPOINT).toBe(1100)
    expect(CANVAS_TOOLBAR_RESPONSIVE_BREAKPOINT).toBe(1100)
  })
})
