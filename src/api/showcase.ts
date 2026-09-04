import type { AccountProfileResponse } from '@/contracts/account'
import type { CanvasMutation } from '@/domain/types'
import type { PublishedSnapshot } from '@/domain/publish'
import { client } from '@/lib/api'

export const SHOWCASE_FAVOURITES_STORAGE_KEY = 'kokoro-nova/showcase-favourites'

/**
 * Replays the immutable public document using the same mutation endpoint the
 * editor uses. This keeps a copied project structurally independent while
 * preserving the work a viewer saw in the public process view.
 */
export function buildShowcaseCloneMutations(snapshot: PublishedSnapshot['document']): CanvasMutation[] {
  return [
    ...snapshot.nodes.map((node) => ({ op: 'addNode' as const, node: structuredClone(node) })),
    ...snapshot.edges.map((edge) => ({ op: 'addEdge' as const, edge: structuredClone(edge) })),
    ...snapshot.groups.map((group) => ({ op: 'addGroup' as const, group: structuredClone(group) })),
    { op: 'setViewport', viewport: structuredClone(snapshot.viewport) },
  ]
}

export function isShowcaseAuthenticated(profile: AccountProfileResponse): boolean {
  return profile.identity.maskedAccount !== '未登录'
}

export function toggleShowcaseFavourite(ids: readonly string[], snapshotId: string): string[] {
  return ids.includes(snapshotId) ? ids.filter((id) => id !== snapshotId) : [...ids, snapshotId]
}

export async function cloneShowcaseSnapshot(snapshot: PublishedSnapshot) {
  const { project, canvas } = await client.projects.create({ name: `${snapshot.title} · 副本` })
  const result = await client.canvas.mutate(canvas.id, {
    canvasId: canvas.id,
    expectedRevision: canvas.revision,
    label: `复制公开作品：${snapshot.title}`,
    mutations: buildShowcaseCloneMutations(snapshot.document),
  })

  return { project, canvas: { ...canvas, revision: result.revision, document: result.document } }
}
