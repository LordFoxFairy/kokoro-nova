import { describe, expect, it } from 'vitest'

import {
  DEFAULT_MODEL,
  MODEL_CATALOG_VERSION,
  MODELS,
  MODELS_BY_ID,
  modelOutputOptions,
  modelsFor,
  normalizeOutputForModel,
  quoteCredits,
} from '@/domain/models'
import type { OutputSpec } from '@/domain/types'

const credits = (modelId: string, output?: OutputSpec) => quoteCredits(modelId, output).credits

describe('quoteCredits / base', () => {
  it('falls back to zero for an unknown model', () => {
    expect(quoteCredits('not-a-model', { resolution: '4K', count: 4 })).toEqual({
      credits: 0,
      breakdown: [],
    })
  })

  it('charges the model base when there is no output spec', () => {
    expect(quoteCredits('lib-image-2', undefined)).toEqual({
      credits: 18,
      breakdown: [{ label: 'Lib Image 基础', credits: 18 }],
    })
    expect(credits('lib-image-2', {})).toBe(18)
  })
})

describe('quoteCredits / resolution', () => {
  it('scales with resolution and records the delta', () => {
    expect(credits('lib-image-2', { resolution: '1K' })).toBe(18)
    expect(credits('lib-image-2', { resolution: '2K' })).toBe(23)
    expect(credits('lib-image-2', { resolution: '4K' })).toBe(43)

    expect(quoteCredits('lib-image-2', { resolution: '4K' }).breakdown).toEqual([
      { label: 'Lib Image 基础', credits: 18 },
      { label: '分辨率 4K', credits: 25 },
    ])
  })

  it('omits a breakdown line for a neutral multiplier', () => {
    expect(quoteCredits('lib-image-2', { resolution: '1K' }).breakdown).toHaveLength(1)
    expect(quoteCredits('seedance-2', { resolution: '720p' }).breakdown).toHaveLength(1)
  })

  it('uses the video resolution ladder for video models', () => {
    expect(credits('seedance-2', { resolution: '480p' })).toBe(25)
    expect(credits('seedance-2', { resolution: '720p' })).toBe(35)
    expect(credits('seedance-2', { resolution: '1080p' })).toBe(56)
  })

  it('ignores a resolution the table does not know', () => {
    expect(credits('lib-image-2', { resolution: '8K' as OutputSpec['resolution'] })).toBe(18)
  })
})

describe('quoteCredits / quality', () => {
  it('discounts low quality and labels the quote delta accurately', () => {
    expect(credits('lib-image-2', { quality: 'low' })).toBe(14)
    expect(quoteCredits('lib-image-2', { quality: 'low' }).breakdown).toEqual([
      { label: 'Lib Image 基础', credits: 18 },
      { label: '低画质', credits: -4 },
    ])
  })

  it('charges more for high quality than for standard', () => {
    expect(credits('lib-image-2', { quality: 'standard' })).toBe(18)
    expect(credits('lib-image-2', { quality: 'high' })).toBe(26)

    expect(quoteCredits('lib-image-2', { quality: 'high' }).breakdown).toEqual([
      { label: 'Lib Image 基础', credits: 18 },
      { label: '高品质', credits: 8 },
    ])
  })

  it('compounds with resolution', () => {
    expect(credits('lib-image-2', { resolution: '2K', quality: 'high' })).toBe(33)
    expect(credits('lib-image-2', { resolution: '4K', quality: 'high' })).toBe(63)
  })
})

describe('quoteCredits / duration', () => {
  it('scales a video model linearly around the 5 second baseline', () => {
    expect(credits('seedance-2', { durationSeconds: 5 })).toBe(35)
    expect(credits('seedance-2', { durationSeconds: 10 })).toBe(70)
    expect(credits('seedance-2', { durationSeconds: 15 })).toBe(105)
  })

  it('ignores duration for non-video models', () => {
    expect(credits('lib-image-2', { durationSeconds: 15 })).toBe(18)
    expect(credits('minimax-speech-2.8-hd', { durationSeconds: 15 })).toBe(1)
  })

  it('adds an audio surcharge on top of the duration-scaled price', () => {
    expect(credits('seedance-2', { durationSeconds: 10, withAudio: true })).toBe(81)
    expect(quoteCredits('seedance-2', { durationSeconds: 10, withAudio: true }).breakdown).toEqual([
      { label: 'Seedance 2.0 VIP 基础', credits: 35 },
      { label: '10 秒', credits: 35 },
      { label: '生成音频', credits: 11 },
    ])
  })
})

describe('quoteCredits / count', () => {
  it('multiplies the rounded single-item price', () => {
    expect(credits('lib-image-2', { count: 1 })).toBe(18)
    expect(credits('lib-image-2', { count: 2 })).toBe(36)
    expect(credits('lib-image-2', { count: 4 })).toBe(72)

    expect(quoteCredits('lib-image-2', { count: 4 }).breakdown).toEqual([
      { label: 'Lib Image 基础', credits: 18 },
      { label: '4 张/条', credits: 54 },
    ])
  })

  it('stacks on top of every other multiplier', () => {
    expect(credits('lib-image-2', { resolution: '4K', quality: 'high', count: 2 })).toBe(126)
  })

  it('grows monotonically along each axis', () => {
    const at = (output: OutputSpec) => credits('seedance-2', output)
    const base: OutputSpec = { resolution: '720p', durationSeconds: 5, count: 1 }

    expect(at({ ...base, resolution: '480p' })).toBeLessThan(at(base))
    expect(at(base)).toBeLessThan(at({ ...base, resolution: '1080p' }))
    expect(at(base)).toBeLessThan(at({ ...base, durationSeconds: 10 }))
    expect(at(base)).toBeLessThan(at({ ...base, withAudio: true }))
    expect(at(base)).toBeLessThan(at({ ...base, count: 2 }))
  })
})

describe('model catalog', () => {
  it('indexes every model by id', () => {
    expect(MODELS_BY_ID.size).toBe(MODELS.length)
    expect(new Set(MODELS.map((m) => m.id)).size).toBe(MODELS.length)
  })

  it('points each media default at a model of that media', () => {
    for (const [media, modelId] of Object.entries(DEFAULT_MODEL)) {
      expect(MODELS_BY_ID.get(modelId)?.media).toBe(media)
    }
  })

  it('filters by media', () => {
    expect(modelsFor('video')).toHaveLength(36)
    expect(modelsFor('video').map((m) => m.label)).toEqual([
      'Seedance 2.5',
      'Seedance 2.0 VIP',
      'Seedance 2.0 Fast VIP',
      'Seedance 2.0 Mini',
      'Kling O3',
      'Minimax H3 Max',
      'Minimax H3',
      'Wan 3.0 Prime',
      'Wan 3.0',
      'Happy Horse 1.1',
      'Happy Horse 1.0',
      'Kling 3.0 Turbo',
      'Kling 3.0',
      'Wan 2.7',
      'Kling O1',
      'Wan 2.6',
      'Hailuo 2.3 Fast',
      'Hailuo 2.3',
      'Seedance1.5 Pro',
      'Seedance 1.0 Pro',
      'Seedance 1.0 Lite',
      'Kling 2.6',
      'Kling3.0 动作迁移',
      'Style Video',
      'Hailuo 02',
      'Vidu Q2',
      'Vidu Q2 Pro',
      'Vidu Q2 Turbo',
      'Vidu Q3 Pro',
      'OmniHuman 1.5',
      'Kling 2.5',
      'Kling 2.1',
      'Wan 2.2',
      'Wan 2.5',
      'Pixverse V5.5',
      'Pixverse V5',
    ])
    expect(modelsFor('image').every((m) => m.media === 'image')).toBe(true)
  })

  it('publishes a versioned deterministic catalog', () => {
    expect(MODEL_CATALOG_VERSION).toBe('2026-09-03.2')
    expect(DEFAULT_MODEL.video).toBe('seedance-2-5')
  })

  it('records representative video capability profiles', () => {
    expect(modelOutputOptions('seedance-2-5')).toMatchObject({
      aspectRatios: ['auto', '16:9', '4:3', '1:1', '3:4', '9:16', '21:9'],
      resolutions: ['480p', '720p', '1080p', '4K'],
      durationsSeconds: [5, 10, 15, 30],
      counts: [1, 2, 4],
      audio: 'optional',
      modes: ['text2video', 'omni-reference', 'image2video', 'first-last-frame', 'image-reference'],
    })

    expect(modelOutputOptions('minimax-h3-max')).toMatchObject({
      resolutions: ['720p', '1080p'],
      durationsSeconds: [5, 10],
      audio: 'unsupported',
      modes: ['text2video', 'image2video', 'first-last-frame'],
    })

    expect(modelOutputOptions('kling-3-motion-transfer')).toMatchObject({
      audio: 'unsupported',
      modes: ['motion-transfer'],
      referenceRequirements: {
        'motion-transfer': { images: { min: 1, max: 1 }, videos: { min: 1, max: 1 } },
      },
    })

    expect(modelOutputOptions('omnihuman-1-5')).toMatchObject({
      modes: ['digital-human'],
      referenceRequirements: {
        'digital-human': { images: { min: 1 }, audios: { min: 1 } },
      },
    })
  })
})

describe('normalizeOutputForModel', () => {
  it('keeps legal Seedance values and rejects modes that connected inputs cannot provide', () => {
    expect(
      normalizeOutputForModel(
        'seedance-2-5',
        {
          aspectRatio: '21:9',
          resolution: '4K',
          durationSeconds: 30,
          count: 4,
          withAudio: true,
          mode: 'video2video',
        },
        ['text2video', 'omni-reference'],
      ),
    ).toEqual({
      aspectRatio: '21:9',
      resolution: '4K',
      durationSeconds: 30,
      count: 4,
      withAudio: true,
      mode: 'omni-reference',
    })
  })

  it('falls back to model defaults and disables unsupported audio', () => {
    expect(
      normalizeOutputForModel('minimax-h3-max', {
        aspectRatio: '21:9',
        resolution: '4K',
        durationSeconds: 30,
        count: 4,
        withAudio: true,
        mode: 'omni-reference',
      }),
    ).toEqual({
      aspectRatio: '16:9',
      resolution: '720p',
      durationSeconds: 5,
      count: 1,
      withAudio: false,
      mode: 'text2video',
    })
  })
})
