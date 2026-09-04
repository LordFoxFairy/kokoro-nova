import { ShowcaseDetailView } from '@/components/showcase/ShowcaseDetailView'

export const dynamic = 'force-dynamic'

/**
 * Public detail route.
 *
 * The URL carries the snapshot id, never the canvas id: the published copy and
 * the canvas it was frozen from are different objects with different lifetimes,
 * and only the snapshot is public.
 */
export default async function ShowcaseDetailPage({
  params,
}: {
  params: Promise<{ snapshotId: string }>
}) {
  const { snapshotId } = await params
  return <ShowcaseDetailView snapshotId={snapshotId} />
}
