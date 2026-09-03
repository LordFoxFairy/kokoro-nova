import { client } from '@/api/client'

export { ApiError, client, createApiClient } from '@/api/client'

/**
 * Compatibility surface for components that have not moved to endpoint groups
 * yet. Every request still shares the typed client's JSON and error pipeline.
 */
export const api = client.raw
