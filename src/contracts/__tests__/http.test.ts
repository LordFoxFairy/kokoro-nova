import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { ContractDecodeError, decodeExternalEnvelope } from '@/contracts/http'

const Payload = z.object({ total: z.number().int().nonnegative() })

describe('decodeExternalEnvelope', () => {
  it('accepts LibTV msg and Agent message envelope variants', () => {
    expect(decodeExternalEnvelope({ code: 0, data: { total: 2 }, msg: 'ok' }, Payload)).toEqual({ total: 2 })
    expect(decodeExternalEnvelope({ code: 0, data: { total: 3 }, message: 'ok' }, Payload)).toEqual({ total: 3 })
    expect(decodeExternalEnvelope({ code: 0, data: { total: 4 }, msg: null }, Payload)).toEqual({ total: 4 })
  })

  it('rejects a non-zero business code with a stable normalized error', () => {
    expect(() => decodeExternalEnvelope({ code: 4001, data: null, msg: '会话已过期' }, Payload)).toThrowError(
      expect.objectContaining({
        name: 'ContractDecodeError',
        code: 'EXTERNAL_BUSINESS_ERROR',
        message: '会话已过期',
      }),
    )
  })

  it('rejects malformed successful data instead of leaking unknown into UI state', () => {
    expect(() => decodeExternalEnvelope({ code: 0, data: { total: '2' }, msg: '' }, Payload)).toThrow(
      ContractDecodeError,
    )
  })

  it('rejects values that are not a recognized envelope', () => {
    expect(() => decodeExternalEnvelope({ data: { total: 2 } }, Payload)).toThrowError(
      expect.objectContaining({ code: 'INVALID_ENVELOPE' }),
    )
  })
})
