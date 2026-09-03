import { z, type ZodType } from 'zod'

export const ExternalEnvelopeSchema = z
  .object({
    code: z.number(),
    data: z.unknown(),
    msg: z.string().nullable().optional(),
    message: z.string().nullable().optional(),
    trace_id: z.string().optional(),
  })
  .passthrough()

export const LocalErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
  requestId: z.string(),
})

export type ContractDecodeErrorCode = 'INVALID_ENVELOPE' | 'EXTERNAL_BUSINESS_ERROR' | 'INVALID_DATA'

export class ContractDecodeError extends Error {
  constructor(
    public readonly code: ContractDecodeErrorCode,
    message: string,
    public readonly issues: unknown = null,
  ) {
    super(message)
    this.name = 'ContractDecodeError'
  }
}

export function decodeExternalEnvelope<T>(input: unknown, schema: ZodType<T>): T {
  const envelope = ExternalEnvelopeSchema.safeParse(input)
  if (!envelope.success) {
    throw new ContractDecodeError('INVALID_ENVELOPE', '响应 envelope 不合法', envelope.error.issues)
  }

  if (envelope.data.code !== 0) {
    throw new ContractDecodeError(
      'EXTERNAL_BUSINESS_ERROR',
      envelope.data.msg ?? envelope.data.message ?? `业务错误 ${envelope.data.code}`,
    )
  }

  const data = schema.safeParse(envelope.data.data)
  if (!data.success) {
    throw new ContractDecodeError('INVALID_DATA', '响应 data 不合法', data.error.issues)
  }

  return data.data
}
