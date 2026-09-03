import { z } from 'zod'

import { ArtifactSchema } from './local'

export const ComposeTransitionIdSchema = z.enum(['fade', 'to-black', 'to-white'])

export const ComposeClipSchema = z
  .object({
    url: z.string().min(1),
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
    url: z.string().min(1),
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

export type ComposeRequest = z.infer<typeof ComposeRequestSchema>
export type ComposeContractResponse = z.infer<typeof ComposeResponseSchema>
