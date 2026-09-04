import { z } from 'zod'

const IsoTimestampSchema = z.string().datetime()
const StableIdSchema = z.string().trim().min(1).max(200)

export const LedgerEntrySchema = z
  .object({
    id: StableIdSchema,
    spaceId: StableIdSchema,
    type: z.enum(['grant', 'reserve', 'settle', 'release', 'purchase']),
    credits: z.number().finite(),
    balanceAfter: z.number().finite(),
    logicalChargeId: StableIdSchema,
    jobId: StableIdSchema.nullable(),
    note: z.string().max(4_000),
    createdAt: IsoTimestampSchema,
  })
  .strict()

export const ChargeSummarySchema = z
  .object({
    jobId: StableIdSchema,
    state: z.enum(['held', 'settled', 'released']),
    reserved: z.number().finite().nonnegative(),
    returned: z.number().finite().nonnegative(),
    net: z.number().finite().nonnegative(),
    resolvedAt: IsoTimestampSchema.nullable(),
  })
  .strict()

export const LedgerRowSchema = LedgerEntrySchema.extend({
  charge: ChargeSummarySchema.nullable(),
}).strict()

export const LedgerTotalsSchema = z
  .object({
    earned: z.number().finite().nonnegative(),
    reserved: z.number().finite().nonnegative(),
    returned: z.number().finite().nonnegative(),
    spent: z.number().finite().nonnegative(),
    held: z.number().finite().nonnegative(),
  })
  .strict()

export const LedgerCountsSchema = z
  .object({
    earned: z.number().int().nonnegative(),
    spent: z.number().int().nonnegative(),
    returned: z.number().int().nonnegative(),
  })
  .strict()

export const LedgerJobLinkSchema = z
  .object({
    jobId: StableIdSchema,
    projectId: StableIdSchema,
    canvasId: StableIdSchema,
    nodeId: StableIdSchema,
    modelId: StableIdSchema,
    status: z.enum([
      'awaiting_confirmation',
      'queued',
      'running',
      'succeeded',
      'failed',
      'cancelled',
      'compliance_blocked',
    ]),
  })
  .strict()

export const LedgerViewProjectionSchema = z
  .object({
    balance: z.number().finite(),
    earned: z.array(LedgerRowSchema),
    spent: z.array(LedgerRowSchema),
    returned: z.array(LedgerRowSchema),
    counts: LedgerCountsSchema,
    totals: LedgerTotalsSchema,
    jobs: z.record(LedgerJobLinkSchema),
  })
  .strict()

export const LEDGER_MAX_LIMIT = 200

export type LedgerEntryContract = z.infer<typeof LedgerEntrySchema>
export type LedgerViewProjectionContract = z.infer<typeof LedgerViewProjectionSchema>
