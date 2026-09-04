import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import {
  isMenuClickAway,
  isMenuEscapeKey,
  Menu,
  menuItemForEnter,
  nextMenuIndex,
  submenuIdOnHover,
  type MenuItem,
} from '../Menu'

const items: MenuItem[] = [
  { id: 'disabled', label: 'Disabled', disabled: true },
  { id: 'submenu', label: 'More', submenu: [{ id: 'nested', label: 'Nested' }] },
  { id: 'run', label: 'Run', onSelect: vi.fn() },
]

describe('Menu interaction regression', () => {
  it('keeps the root hit-testable when mounted below a pointer-events-none overlay', () => {
    const markup = renderToStaticMarkup(
      createElement(Menu, {
        sections: [{ items: [{ id: 'simple', label: 'Simple' }] }],
        anchor: { x: 100, y: 100 },
        onClose: vi.fn(),
      }),
    )

    expect(markup).toContain('pointer-events-auto')
    expect(markup).toContain('role="menu"')
  })

  it('skips disabled rows, selects only actionable Enter targets, and tracks submenus', () => {
    expect(nextMenuIndex(items, -1, 1)).toBe(1)
    expect(nextMenuIndex(items, 1, 1)).toBe(2)
    expect(nextMenuIndex(items, 2, 1)).toBe(1)
    expect(nextMenuIndex(items, 1, -1)).toBe(2)
    expect(nextMenuIndex([{ disabled: true }], -1, 1)).toBe(-1)

    expect(menuItemForEnter(items, 0)).toBeNull()
    expect(menuItemForEnter(items, 1)).toBeNull()
    expect(menuItemForEnter(items, 2)?.id).toBe('run')
    expect(submenuIdOnHover(items[1])).toBe('submenu')
    expect(submenuIdOnHover(items[2])).toBeNull()
  })

  it('recognizes Escape and distinguishes menu-contained pointer events from click-away', () => {
    const inside = {} as Node
    const outside = {} as Node
    const menu = { contains: (node: Node | null) => node === inside }

    expect(isMenuEscapeKey('Escape')).toBe(true)
    expect(isMenuEscapeKey('Enter')).toBe(false)
    expect(isMenuClickAway(menu, inside)).toBe(false)
    expect(isMenuClickAway(menu, outside)).toBe(true)
    expect(isMenuClickAway(menu, null)).toBe(true)
    expect(isMenuClickAway(null, inside)).toBe(true)
  })
})
