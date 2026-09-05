import { describe, expect, it } from 'vitest'

import { STYLE_PRESETS } from '@/domain/libraries'
import type { GenerationJob } from '@/domain/types'
import { filterMaterialPresets, projectHistoryArtifacts } from '../LibraryPanels'

describe('canvas library filters', () => {
  it('combines source tabs, categories, commercial access and search', () => {
    expect(
      filterMaterialPresets(STYLE_PRESETS, {
        kind: 'style',
        tab: 'favorites',
        category: '摄影写真',
        commercialOnly: true,
        query: '柔光',
      }).map((item) => item.id),
    ).toEqual(['style-soft-portrait'])

    expect(
      filterMaterialPresets(STYLE_PRESETS, {
        kind: 'style',
        tab: 'recent',
        category: '全部',
        commercialOnly: false,
        query: 'NOIR',
      }).map((item) => item.id),
    ).toEqual(['style-noir'])
  })

  it('returns an empty result when a filter combination has no match', () => {
    expect(
      filterMaterialPresets(STYLE_PRESETS, {
        kind: 'style',
        tab: 'market',
        category: '摄影写真',
        commercialOnly: true,
        query: '不存在',
      }),
    ).toEqual([])
  })

  it('projects supported canvas artifacts by scope and deterministic time order', () => {
    const jobs = [
      {
        artifacts: [
          {
            id: 'artifact-image-old',
            jobId: 'job-1',
            kind: 'image',
            url: '/fixtures/old.png',
            thumbnailUrl: null,
            width: 1024,
            height: 576,
            durationSeconds: null,
            createdAt: '2026-09-04T10:00:00.000Z',
            modelId: 'lib-image-2',
            assetId: null,
          },
          {
            id: 'artifact-text-hidden',
            jobId: 'job-1',
            kind: 'text',
            url: 'inline://text',
            thumbnailUrl: null,
            width: null,
            height: null,
            durationSeconds: null,
            createdAt: '2026-09-04T12:00:00.000Z',
            modelId: 'lib-text-1',
            assetId: null,
            textContent: '不应作为媒体历史插入',
          },
        ],
      },
      {
        artifacts: [
          {
            id: 'artifact-audio-new',
            jobId: 'job-2',
            kind: 'audio',
            url: '/fixtures/new.wav',
            thumbnailUrl: null,
            width: null,
            height: null,
            durationSeconds: 5,
            createdAt: '2026-09-04T11:00:00.000Z',
            modelId: 'lib-audio-1',
            assetId: null,
          },
        ],
      },
    ] as unknown as GenerationJob[]

    expect(projectHistoryArtifacts(jobs, { scope: 'canvas', sort: 'newest' }).map((artifact) => artifact.id)).toEqual([
      'artifact-audio-new',
      'artifact-image-old',
    ])
    expect(projectHistoryArtifacts(jobs, { scope: 'image', sort: 'oldest' }).map((artifact) => artifact.id)).toEqual([
      'artifact-image-old',
    ])
  })
})
