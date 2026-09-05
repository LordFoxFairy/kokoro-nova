import { z } from 'zod'

import { ArtifactSchema } from './local'

/** Local deterministic compositor inputs must be minted by the media route. */
export const ComposeMediaUrlSchema = z
  .string()
  .regex(/^\/api\/media\/(?:[^/?#]+\/)*[^/?#]+$/, '素材地址必须是 /api/media/ 下的本地媒体')

export const ComposeTransitionIdSchema = z.enum(['fade', 'to-black', 'to-white'])

export const ComposeClipSchema = z
  .object({
    url: ComposeMediaUrlSchema,
    inPoint: z.number().finite().nonnegative(),
    outPoint: z.number().finite().positive(),
    speed: z.number().finite().min(0.25).max(4).default(1),
    muted: z.boolean().default(false),
    transitionAfter: ComposeTransitionIdSchema.nullable().default(null),
    transitionDurationSeconds: z.number().finite().min(0.08).max(2).nullable().default(null),
  })
  .strict()
  .superRefine((clip, context) => {
    if (clip.outPoint - clip.inPoint < 0.05) {
      context.addIssue({
        code: 'custom',
        path: ['outPoint'],
        message: '出点必须比入点晚至少 0.05 秒',
      })
    }
    if (clip.transitionAfter === null && clip.transitionDurationSeconds !== null) {
      context.addIssue({
        code: 'custom',
        path: ['transitionDurationSeconds'],
        message: '没有转场时不能设置转场时长',
      })
    }
  })

export const ComposeAudioTrackSchema = z
  .object({
    url: ComposeMediaUrlSchema,
    inPoint: z.number().finite().nonnegative(),
    outPoint: z.number().finite().positive(),
    start: z.number().finite().nonnegative().default(0),
    volume: z.number().finite().min(0).max(2).default(1),
    muted: z.boolean().default(false),
  })
  .strict()
  .superRefine((track, context) => {
    if (track.outPoint - track.inPoint < 0.05) {
      context.addIssue({
        code: 'custom',
        path: ['outPoint'],
        message: '音频出点必须比入点晚至少 0.05 秒',
      })
    }
  })

export const ComposeSubtitleSchema = z
  .object({
    text: z.string().trim().min(1).max(500),
    start: z.number().finite().nonnegative(),
    end: z.number().finite().positive(),
  })
  .strict()
  .superRefine((subtitle, context) => {
    if (subtitle.end <= subtitle.start) {
      context.addIssue({ code: 'custom', path: ['end'], message: '字幕结束时间必须晚于开始时间' })
    }
  })

export const ComposeRequestSchema = z
  .object({
    clips: z.array(ComposeClipSchema).min(1).max(40),
    audioTracks: z.array(ComposeAudioTrackSchema).max(16).default([]),
    subtitles: z.array(ComposeSubtitleSchema).max(100).default([]),
  })
  .strict()

export const ComposeResponseSchema = z
  .object({
    artifact: ArtifactSchema.extend({ kind: z.literal('video') }),
    assetId: z.string().min(1),
    subtitleMode: z.enum(['burned', 'muxed', 'none']),
    notes: z.array(z.string()),
  })
  .strict()


/** Persisted local compositor work. Artifacts exist only for one succeeded task. */
export const ComposeTaskStatusSchema = z.enum(['queued', 'rendering', 'succeeded', 'failed', 'cancelled'])

export const ComposeTaskSchema = z
  .object({
    id: z.string().min(1),
    status: ComposeTaskStatusSchema,
    artifact: ArtifactSchema.extend({ kind: z.literal('video') }).nullable(),
    assetId: z.string().min(1).nullable(),
    subtitleMode: z.enum(['burned', 'muxed', 'none']).nullable(),
    notes: z.array(z.string()),
    failure: z.string().min(1).nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()
  .superRefine((task, context) => {
    const hasArtifact = task.artifact !== null || task.assetId !== null || task.subtitleMode !== null
    if (task.status === 'succeeded') {
      if (!task.artifact || !task.assetId || !task.subtitleMode) {
        context.addIssue({ code: 'custom', path: ['artifact'], message: '成功任务必须包含成片' })
      }
      if (task.failure !== null) {
        context.addIssue({ code: 'custom', path: ['failure'], message: '成功任务不能包含失败原因' })
      }
      return
    }
    if (hasArtifact) {
      context.addIssue({ code: 'custom', path: ['artifact'], message: '非成功任务不能包含成片' })
    }
    if (task.status === 'failed' && task.failure === null) {
      context.addIssue({ code: 'custom', path: ['failure'], message: '失败任务必须包含失败原因' })
    }
    if (task.status !== 'failed' && task.failure !== null) {
      context.addIssue({ code: 'custom', path: ['failure'], message: '只有失败任务可以包含失败原因' })
    }
  })

export const ComposeTaskResponseSchema = z.object({ task: ComposeTaskSchema }).strict()
export const ComposeTaskActionSchema = z.object({ action: z.enum(['cancel', 'retry']) }).strict()

export type ComposeRequest = z.infer<typeof ComposeRequestSchema>
export type ComposeContractResponse = z.infer<typeof ComposeResponseSchema>
export type ComposeTask = z.infer<typeof ComposeTaskSchema>
export type ComposeTaskResponse = z.infer<typeof ComposeTaskResponseSchema>
export type ComposeTaskAction = z.infer<typeof ComposeTaskActionSchema>
