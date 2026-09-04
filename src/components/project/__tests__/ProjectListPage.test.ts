import { describe, expect, it } from 'vitest'

import { filterProjectRows, getProjectGridColumns, getProjectListEmptyState } from '../ProjectListPage'
import type { ProjectRow } from '../ProjectCard'

const project = (overrides: Partial<ProjectRow> = {}): ProjectRow => ({
  id: 'project-1',
  spaceId: 'sp_default',
  folderId: null,
  name: '雨夜短片',
  coverUrl: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  canvasIds: ['canvas-1'],
  canvasCount: 1,
  ...overrides,
})

describe('project list helpers', () => {
  it('reduces project card columns without changing the desktop density', () => {
    expect(getProjectGridColumns(1440)).toBe(4)
    expect(getProjectGridColumns(1024)).toBe(3)
    expect(getProjectGridColumns(768)).toBe(2)
  })

  it('filters projects by folder and matches names case-insensitively', () => {
    const projects = [
      project(),
      project({ id: 'project-2', name: 'Doro', folderId: 'folder-1' }),
      project({ id: 'project-3', name: 'Storyboard' }),
    ]

    expect(filterProjectRows(projects, null, '雨夜').map((row) => row.id)).toEqual(['project-1'])
    expect(filterProjectRows(projects, 'folder-1', 'doro').map((row) => row.id)).toEqual(['project-2'])
    expect(filterProjectRows(projects, null, '').map((row) => row.id)).toEqual(['project-1', 'project-3'])
  })

  it('distinguishes an untouched empty workspace from a no-match search', () => {
    expect(getProjectListEmptyState({ hasProjects: false, hasFolders: false, query: '', inFolder: false })).toEqual({
      kind: 'workspace',
      title: '还没有项目',
    })
    expect(getProjectListEmptyState({ hasProjects: false, hasFolders: false, query: '月光', inFolder: false })).toEqual({
      kind: 'search',
      title: '没有匹配的项目',
    })
    expect(getProjectListEmptyState({ hasProjects: false, hasFolders: false, query: '', inFolder: true })).toEqual({
      kind: 'folder',
      title: '文件夹为空',
    })
    expect(getProjectListEmptyState({ hasProjects: true, hasFolders: false, query: '', inFolder: false })).toBeNull()
  })
})
