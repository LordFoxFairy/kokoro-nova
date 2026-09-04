import { describe, expect, it } from 'vitest'

import { canRetryUpload, uploadPhaseLabel, type UploadPhase } from '../UploadDropzone'

describe('upload dropzone states', () => {
  it('only exposes retry for a failed request', () => {
    expect(canRetryUpload('error')).toBe(true)
    expect(canRetryUpload('queued')).toBe(false)
    expect(canRetryUpload('uploading')).toBe(false)
    expect(canRetryUpload('done')).toBe(false)
    expect(canRetryUpload('cancelled')).toBe(false)
  })

  it('maps every visible phase to a stable Chinese label', () => {
    const phases: UploadPhase[] = ['queued', 'uploading', 'validating', 'done', 'error', 'cancelled']
    expect(phases.map(uploadPhaseLabel)).toEqual(['排队中', '上传中', '校验中', '已完成', '失败', '已取消'])
  })
})
