import { describe, expect, it } from 'vitest'

import requestExample from '../../../docs/api/examples/project-list.request.json'
import responseExample from '../../../docs/api/examples/project-list.response.json'
import { ProjectListRequestSchema, decodeProjectList } from '@/contracts/project'

describe('ProjectListRequestSchema', () => {
  it('accepts the observed full-project-list request', () => {
    expect(ProjectListRequestSchema.parse(requestExample)).toEqual(requestExample)
  })

  it('rejects page sizes outside the local pagination contract', () => {
    expect(ProjectListRequestSchema.safeParse({ ...requestExample, pageSize: 0 }).success).toBe(false)
    expect(ProjectListRequestSchema.safeParse({ ...requestExample, pageSize: 101 }).success).toBe(false)
  })
})

describe('decodeProjectList', () => {
  it('normalizes mixed folder/project entries without exposing external numeric enums', () => {
    const result = decodeProjectList(responseExample)

    expect(result.items.map((item) => item.kind)).toEqual(['folder', 'project'])
    expect(result).toMatchObject({ page: 1, pageSize: 20, total: 2, hasMore: false })
    expect(result.items[0]).toMatchObject({ id: 'folder_demo', coverUrl: '/fixtures/libtv/project/folder-cover.webp' })
    expect(result.items[1]).toMatchObject({ id: 'project_video_demo', childCount: 1 })
    expect(result.items[0]).not.toHaveProperty('spaceType')
    expect(result.items[0]).not.toHaveProperty('isFolder')
  })

  it('uses the request page to derive hasMore', () => {
    const request = ProjectListRequestSchema.parse(requestExample)
    const result = decodeProjectList(
      { ...responseExample, data: { ...responseExample.data, total: 42 } },
      { ...request, page: 2 },
    )

    expect(result).toMatchObject({ page: 2, pageSize: 20, total: 42, hasMore: true })
  })
})
