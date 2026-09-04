import { describe, expect, it } from 'vitest'

import { directorKeyboardAction, directorSaveStateLabel } from '../DirectorStudio'

describe('director studio interaction helpers', () => {
  it('maps the documented keyboard controls to scene actions', () => {
    expect(directorKeyboardAction('w')).toBe('move-up')
    expect(directorKeyboardAction('D')).toBe('move-right')
    expect(directorKeyboardAction('q')).toBe('turn-left')
    expect(directorKeyboardAction('Delete')).toBe('delete')
    expect(directorKeyboardAction('Escape')).toBeNull()
  })

  it('labels save feedback states', () => {
    expect(directorSaveStateLabel('idle')).toBe('未保存')
    expect(directorSaveStateLabel('saving')).toBe('保存中')
    expect(directorSaveStateLabel('saved')).toBe('已保存')
    expect(directorSaveStateLabel('error')).toBe('保存失败')
  })
})
