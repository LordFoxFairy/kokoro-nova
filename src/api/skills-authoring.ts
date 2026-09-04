import {
  AuthorSkillActionResponseSchema,
  AuthorSkillListResponseSchema,
  CreateAuthoredSkillResponseSchema,
  GetAuthoredSkillResponseSchema,
  UpdateAuthoredSkillResponseSchema,
  type CreateAuthoredSkillRequest,
  type UpdateAuthoredSkillRequest,
} from '@/contracts/skills'
import { api } from '@/lib/api'

const base = '/api/skills/author'

/** Typed browser boundary for the deterministic local authoring aggregate. */
export const skillAuthoringApi = {
  async list() {
    return AuthorSkillListResponseSchema.parse(await api.get<unknown>(base))
  },
  async create(input: CreateAuthoredSkillRequest = {}) {
    return CreateAuthoredSkillResponseSchema.parse(await api.post<unknown>(base, input))
  },
  async get(skillId: string) {
    return GetAuthoredSkillResponseSchema.parse(await api.get<unknown>(`${base}/${encodeURIComponent(skillId)}`))
  },
  async update(skillId: string, patch: UpdateAuthoredSkillRequest) {
    return UpdateAuthoredSkillResponseSchema.parse(await api.patch<unknown>(`${base}/${encodeURIComponent(skillId)}`, patch))
  },
  async action(skillId: string, action: 'submit_review' | 'publish' | 'unpublish') {
    return AuthorSkillActionResponseSchema.parse(await api.post<unknown>(`${base}/${encodeURIComponent(skillId)}`, { action }))
  },
}
