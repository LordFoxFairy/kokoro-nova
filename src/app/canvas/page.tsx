import { redirect } from 'next/navigation'
import { CanvasWorkspace } from '@/components/canvas/CanvasWorkspace'

export const dynamic = 'force-dynamic'

/**
 * Editor route.
 *
 * The object URL carries stable ids only; the readable project/canvas names are
 * never part of the lookup key.
 */
export default async function CanvasPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; canvasId?: string }>
}) {
  const { projectId, canvasId } = await searchParams
  if (!projectId) redirect('/project')

  return <CanvasWorkspace projectId={projectId} canvasId={canvasId} />
}
