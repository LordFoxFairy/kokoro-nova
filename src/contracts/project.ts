import { z } from 'zod'

import { decodeExternalEnvelope } from './http'

/**
 * Local cover choices keep the project manager deterministic: each URL is a
 * checked-in fixture and can be rendered again after a browser reload.
 */
export const PROJECT_COVER_FIXTURES = [
  { id: 'city-night', label: '城市夜景', url: '/fixtures/libtv/media/city-night-poster.webp' },
  { id: 'first-frame', label: '电影首帧', url: '/fixtures/libtv/media/first-frame.webp' },
  { id: 'cloud-palace', label: '云端宫殿', url: '/fixtures/libtv/showcase/cloud-palace.webp' },
] as const

export const PROJECT_COVER_URLS = PROJECT_COVER_FIXTURES.map((fixture) => fixture.url)

export function isProjectFixtureCoverUrl(value: string): boolean {
  return (PROJECT_COVER_URLS as readonly string[]).includes(value)
}

export const ProjectListRequestSchema = z.object({
  id: z.union([z.number().int().nonnegative(), z.string().min(1)]),
  spaceTypes: z.array(z.number().int()).min(1),
  page: z.number().int().positive(),
  pageSize: z.number().int().min(1).max(100),
  orderBy: z.enum(['created_at_desc', 'updated_at_desc']),
  onlyFolder: z.boolean(),
})

export type ProjectListRequest = z.infer<typeof ProjectListRequestSchema>

export const ProjectEntrySchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    description: z.string(),
    parentFolderId: z.number().int(),
    spaceType: z.number().int(),
    depth: z.number().int().nonnegative(),
    coverUrl: z.string(),
    ownerId: z.number().int(),
    createdBy: z.number().int(),
    isFolder: z.boolean(),
    teamId: z.number().int(),
    fileCnt: z.number().int().nonnegative(),
    createAt: z.string(),
    updateAt: z.string(),
    creatorNickname: z.string(),
    shareAgentConversation: z.boolean(),
    type: z.number().int().optional(),
  })
  .passthrough()

export type ExternalProjectEntry = z.infer<typeof ProjectEntrySchema>

const ProjectListDataSchema = z.object({
  folders: z.array(ProjectEntrySchema),
  total: z.number().int().nonnegative(),
})

export type ProjectListItem = {
  id: string
  kind: 'folder' | 'project'
  name: string
  description: string
  coverUrl: string | null
  childCount: number
  createdAt: string
  updatedAt: string
}

export type ProjectListPage = {
  items: ProjectListItem[]
  page: number
  pageSize: number
  total: number
  hasMore: boolean
}

export const DEFAULT_PROJECT_LIST_REQUEST: ProjectListRequest = {
  id: 0,
  spaceTypes: [1, 10],
  page: 1,
  pageSize: 20,
  orderBy: 'created_at_desc',
  onlyFolder: false,
}

export function normalizeProjectEntry(entry: ExternalProjectEntry): ProjectListItem {
  return {
    id: entry.id,
    kind: entry.isFolder ? 'folder' : 'project',
    name: entry.name,
    description: entry.description,
    coverUrl: entry.coverUrl.trim() || null,
    childCount: entry.fileCnt,
    createdAt: entry.createAt,
    updatedAt: entry.updateAt,
  }
}

export function decodeProjectList(
  input: unknown,
  request: ProjectListRequest = DEFAULT_PROJECT_LIST_REQUEST,
): ProjectListPage {
  const parsedRequest = ProjectListRequestSchema.parse(request)
  const data = decodeExternalEnvelope(input, ProjectListDataSchema)
  const consumed = parsedRequest.page * parsedRequest.pageSize

  return {
    items: data.folders.map(normalizeProjectEntry),
    page: parsedRequest.page,
    pageSize: parsedRequest.pageSize,
    total: data.total,
    hasMore: consumed < data.total,
  }
}
