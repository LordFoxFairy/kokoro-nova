export const FIXED_NOW = '2026-09-03T12:00:00.000Z'

const FIXED_NOW_MS = Date.parse(FIXED_NOW)

export function isoAt(offsetSeconds: number): string {
  return new Date(FIXED_NOW_MS + offsetSeconds * 1_000).toISOString()
}
