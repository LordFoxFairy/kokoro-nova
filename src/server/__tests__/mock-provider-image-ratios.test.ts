import { describe, expect, it } from 'vitest'

import { IMAGE_ASPECT_RATIOS, type ImageAspectRatio } from '@/domain/models'
import type { ExecutionSpec } from '@/domain/types'
import { dimensionsFor } from '@/server/generation/mock-provider'

function imageSpec(aspectRatio: ImageAspectRatio): ExecutionSpec {
  return {
    workflowDigest: 'fixture',
    nodeId: 'nd_image',
    nodeType: 'image',
    modelId: 'lib-image-2',
    prompt: 'fixture',
    output: { aspectRatio, resolution: '1K', quality: 'standard', count: 1 },
    inputs: [],
  }
}

describe('mock image artifact dimensions', () => {
  it('renders every authoring ratio instead of falling back to 16:9', () => {
    const expected: Record<ImageAspectRatio, { width: number; height: number }> = {
      '1:1': { width: 1024, height: 1024 },
      '1:2': { width: 512, height: 1024 },
      '2:1': { width: 1024, height: 512 },
      '9:16': { width: 576, height: 1024 },
      '16:9': { width: 1024, height: 576 },
      '3:4': { width: 768, height: 1024 },
      '4:3': { width: 1024, height: 768 },
      '3:2': { width: 1024, height: 683 },
      '2:3': { width: 683, height: 1024 },
      '5:4': { width: 1024, height: 819 },
      '4:5': { width: 819, height: 1024 },
      '21:9': { width: 1024, height: 439 },
      '9:21': { width: 439, height: 1024 },
    }

    expect(Object.keys(expected).sort()).toEqual([...IMAGE_ASPECT_RATIOS].sort())
    for (const ratio of IMAGE_ASPECT_RATIOS) {
      expect(dimensionsFor(imageSpec(ratio)), ratio).toEqual(expected[ratio])
    }
  })
})
