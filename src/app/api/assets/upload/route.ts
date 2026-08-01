import type { AssetNamespace } from '@/domain/types'
import {
  MAX_UPLOAD_FILES,
  UPLOAD_CANCELLED_REASON,
  cancelUpload,
  claimUploadTicket,
  commitUploads,
  discardStaged,
  isUploadToken,
  stageUploads,
  sweepAbandonedStaging,
  sweepUploadTickets,
  validateStaged,
  type TicketClaim,
  type UploadResult,
} from '@/server/assets'
import { HttpError, handle } from '@/server/http'
import { readState, withState, type WorkspaceState } from '@/server/store'
import type { AssetFolder } from '../folders/route'

export const dynamic = 'force-dynamic'

const NAMESPACES: AssetNamespace[] = ['personal', 'agent']

/**
 * 上传资产 — the only ingress for bytes the platform did not generate itself.
 *
 * The body is `multipart/form-data` with one or more `files` parts; the client
 * sends one file per request so it can report progress and cancel per file,
 * while the batch cap is still enforced here for any caller that does not.
 *
 * An `uploadToken` part names the request before it can answer, which is what
 * makes DELETE below able to undo it — see the cancellation-ticket note in
 * src/server/assets.ts for how the two are ordered against each other.
 */
export async function POST(request: Request) {
  return handle(async (): Promise<UploadResult> => {
    const form = await request.formData()
    // `getAll` yields `File | string`; anything that is not a string is a part
    // with a payload, which is the only thing worth staging.
    const files = form.getAll('files').filter((value): value is File => typeof value !== 'string')
    if (files.length === 0) throw new HttpError(400, '未选择文件')
    if (files.length > MAX_UPLOAD_FILES) {
      throw new HttpError(400, `一次最多上传 ${MAX_UPLOAD_FILES} 个文件`)
    }

    const namespace = readNamespace(form.get('namespace'))
    const folderId = readFolderId(form.get('folderId'))
    const token = readUploadToken(form.get('uploadToken'))

    // Rejected up front: staging bytes for a row that could never be filed
    // where the user is looking would only leave litter to clean up.
    if (folderId) {
      const state = await readState()
      if (!readAssetFolders(state).some((folder) => folder.id === folderId)) {
        throw new HttpError(404, '文件夹不存在')
      }
    }

    const { staged, rejected } = await stageUploads(files, { namespace, folderId })
    // Nothing reached disk, so there is no state to write.
    if (staged.length === 0) return { assets: [], rejected }

    // Quarantine is persisted on its own. Committing in a single write would
    // make an upload interrupted mid-validation indistinguishable from one that
    // never started; as a `staging` row it stays reconcilable against its bytes.
    let claim: TicketClaim = 'claimed'
    await withState(async (state) => {
      // Quarantine is reconciled on the way in: rows left behind by an earlier
      // request that died before its gate ran are ungated bytes the listing
      // would otherwise hand out as ordinary assets.
      await sweepAbandonedStaging(state)
      sweepUploadTickets(state)
      if (token) {
        claim = claimUploadTicket(state, token, staged.map((item) => item.asset.id))
        // A cancel already landed for this token, so these rows must never
        // exist. Leaving the push out is the cheapest possible undo.
        if (claim !== 'claimed') return
      }
      state.assets.push(...staged.map((item) => item.asset))
    })

    if (claim !== 'claimed') {
      // No row was persisted, so the bytes are the only thing left to undo.
      await discardStaged(staged)
      if (claim === 'conflict') throw new HttpError(409, '上传令牌冲突')
      return {
        assets: [],
        rejected: [
          ...rejected,
          ...staged.map((item) => ({ name: item.asset.name, reason: UPLOAD_CANCELLED_REASON })),
        ],
      }
    }

    const decisions = await validateStaged(staged)

    const committed = await withState((state) => commitUploads(state, decisions, token))
    return { assets: committed.assets, rejected: [...rejected, ...committed.rejected] }
  })
}

/**
 * 取消上传 — revokes every asset staged or committed under a client token and
 * removes its bytes.
 *
 * The token travels in the query string rather than a body so the client can
 * fire this from `pagehide`, where a request has to survive the document being
 * torn down and nothing may depend on reading a response back.
 */
export async function DELETE(request: Request) {
  return handle(async () => {
    const raw = new URL(request.url).searchParams.get('token')
    // Trimmed the same way the `uploadToken` part is, so one padded string
    // names the same ticket at both ends. Without this a client that pads
    // stages under the trimmed token and is then refused the cancel — which is
    // exactly the failure this endpoint exists to remove.
    const token = typeof raw === 'string' ? raw.trim() : null
    if (!isUploadToken(token)) throw new HttpError(400, '上传令牌不合法')

    const revoked = await withState(async (state) => {
      const count = await cancelUpload(state, token)
      // Swept after the cancel, never before: collecting the tombstone this
      // call just wrote would hand the race straight back to the commit.
      sweepUploadTickets(state)
      return count
    })
    return { revoked }
  })
}

function readNamespace(value: FormDataEntryValue | null): AssetNamespace {
  const namespace = typeof value === 'string' ? (value as AssetNamespace) : null
  return namespace && NAMESPACES.includes(namespace) ? namespace : 'personal'
}

function readFolderId(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Absent means the caller accepts that it cannot cancel; present but malformed
 * is a client bug, and failing loudly beats staging bytes behind a name the
 * client believes it still holds.
 */
function readUploadToken(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  if (!isUploadToken(trimmed)) throw new HttpError(400, '上传令牌不合法')
  return trimmed
}

/** Asset folders live under a runtime-attached key — see ../folders/route.ts. */
function readAssetFolders(state: WorkspaceState): AssetFolder[] {
  const stored = (state as WorkspaceState & { assetFolders?: AssetFolder[] }).assetFolders
  return Array.isArray(stored) ? stored : []
}
