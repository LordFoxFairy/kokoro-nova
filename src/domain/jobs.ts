/**
 * Deterministic controls used exclusively by the frontend-only mock runner.
 * They are encoded into the durable invocation id so a browser reload or a
 * server bundle reload keeps exercising the same provider outcome.
 */
export const JOB_FIXTURE_IDS = [
  'pending',
  'succeeded',
  'failed',
  'cancelled',
  'compliance_blocked',
  'network_offline',
  'capability_unsupported',
  'expired_quote',
] as const

export type JobFixtureId = (typeof JOB_FIXTURE_IDS)[number]

const FIXTURE_PREFIX = 'fixture:'
const FIXTURE_SEPARATOR = ':'

export function isJobFixtureId(value: unknown): value is JobFixtureId {
  return typeof value === 'string' && (JOB_FIXTURE_IDS as readonly string[]).includes(value)
}

/** Stable across reloads; the suffix remains the normal unique invocation id. */
export function invocationIdForFixture(invocationId: string, fixture?: JobFixtureId): string {
  return fixture ? `${FIXTURE_PREFIX}${fixture}${FIXTURE_SEPARATOR}${invocationId}` : invocationId
}

/** Reads a fixture from the persisted job invocation without any server cache. */
export function fixtureForInvocation(invocationId: string): JobFixtureId | null {
  if (!invocationId.startsWith(FIXTURE_PREFIX)) return null
  const end = invocationId.indexOf(FIXTURE_SEPARATOR, FIXTURE_PREFIX.length)
  if (end < 0) return null
  const candidate = invocationId.slice(FIXTURE_PREFIX.length, end)
  return isJobFixtureId(candidate) ? candidate : null
}

/** A retried terminal job receives a new logical provider invocation exactly once. */
export function retryInvocationId(invocationId: string): string {
  return `retry:${invocationId}`
}
