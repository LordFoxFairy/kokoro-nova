import { describe, expect, it } from 'vitest'

import {
  generationStatusLabel,
  latestJobForNode,
  mergeNodeData,
  regenerationStatusForJob,
  cycleFocusIndex,
  mediaAspectRatio,
} from '../MediaDetailDrawer'

function job(nodeId: string, id: string, status: string, createdAt: string) {
  return {
    id,
    canvasId: 'canvas_fixture',
    nodeId,
    modelId: 'seedance-2',
    status,
    createdAt,
  } as never
}

describe('storyboard regeneration helpers', () => {
  it('selects the newest job for a node without depending on node.data.jobId', () => {
    const jobs = [
      job('node_video_01', 'job_old', 'succeeded', '2026-09-04T10:00:00.000Z'),
      job('node_other', 'job_other', 'running', '2026-09-04T12:00:00.000Z'),
      job('node_video_01', 'job_new', 'awaiting_confirmation', '2026-09-04T11:00:00.000Z'),
    ]

    expect(latestJobForNode(jobs, 'node_video_01')?.id).toBe('job_new')
    expect(latestJobForNode(jobs, 'missing')).toBeNull()

    // The local store inserts newest jobs first; equal fixture timestamps must
    // not make the older record win.
    expect(
      latestJobForNode(
        [
          job('node_video_01', 'job_same_new', 'awaiting_confirmation', '2026-09-04T10:00:00.000Z'),
          job('node_video_01', 'job_same_old', 'succeeded', '2026-09-04T10:00:00.000Z'),
        ],
        'node_video_01',
      )?.id,
    ).toBe('job_same_new')
  })

  it('maps job states to actionable storyboard states and labels', () => {
    expect(regenerationStatusForJob(null)).toBe('ready')
    expect(regenerationStatusForJob(job('node_video_01', 'job_1', 'awaiting_confirmation', '2026-09-04T10:00:00.000Z'))).toBe('awaiting_confirmation')
    expect(regenerationStatusForJob(job('node_video_01', 'job_2', 'running', '2026-09-04T10:00:00.000Z'))).toBe('in_flight')
    expect(regenerationStatusForJob(job('node_video_01', 'job_3', 'succeeded', '2026-09-04T10:00:00.000Z'))).toBe('succeeded')
    expect(regenerationStatusForJob(job('node_video_01', 'job_4', 'failed', '2026-09-04T10:00:00.000Z'))).toBe('failed')
    expect(regenerationStatusForJob(job('node_video_01', 'job_5', 'cancelled', '2026-09-04T10:00:00.000Z'))).toBe('cancelled')
    expect(regenerationStatusForJob(job('node_video_01', 'job_6', 'compliance_blocked', '2026-09-04T10:00:00.000Z'))).toBe('failed')

    expect(generationStatusLabel('awaiting_confirmation')).toBe('等待确认')
    expect(generationStatusLabel('queued')).toBe('排队中')
    expect(generationStatusLabel('running')).toBe('生成中')
    expect(generationStatusLabel('compliance_blocked')).toBe('合规阻断')
  })

  it('merges parameter patches without dropping unrelated workflow extras', () => {
    const current = {
      prompt: '旧提示词',
      extra: { advanced: { autoLink: true }, cameraMove: 'orbit' },
    } as never

    expect(mergeNodeData(current, { extra: { effect: 'film' } })).toEqual({
      prompt: '旧提示词',
      extra: { advanced: { autoLink: true }, cameraMove: 'orbit', effect: 'film' },
    })
  })

  it('cycles drawer focus in both directions, including an empty focus list', () => {
    expect(cycleFocusIndex(-1, 3, false)).toBe(0)
    expect(cycleFocusIndex(2, 3, false)).toBe(0)
    expect(cycleFocusIndex(0, 3, true)).toBe(2)
    expect(cycleFocusIndex(-1, 3, true)).toBe(2)
    expect(cycleFocusIndex(0, 0, false)).toBe(-1)
  })

  it('prefers the artifact ratio and falls back to the requested ratio', () => {
    expect(
      mediaAspectRatio({
        resourceAspectRatio: '9:16',
        aspectRatio: '16:9',
      }),
    ).toBe('9 / 16')
    expect(mediaAspectRatio({ resourceAspectRatio: null, aspectRatio: '1:1' })).toBe('1 / 1')
    expect(mediaAspectRatio({ resourceAspectRatio: null, aspectRatio: null })).toBe('16 / 9')
  })
})
