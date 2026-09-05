import { IdentityResponseSchema, UpdateSessionRequestSchema } from '@/contracts/identity'
import { client } from './client'

/** Typed local session seam shared by public Home and private Project gates. */
export const identityClient = {
  async get(returnTo?: string) {
    const query = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''
    return IdentityResponseSchema.parse(await client.raw.get(`/api/identity${query}`))
  },
  async update(input: unknown) {
    const body = UpdateSessionRequestSchema.parse(input)
    return IdentityResponseSchema.parse(await client.raw.post('/api/identity', body))
  },
}
