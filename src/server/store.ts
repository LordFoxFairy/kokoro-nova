import { constants as fsConstants, promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { ScenarioIdSchema, type ScenarioId } from '@/contracts/scenario'
import { buildScenario } from '@/mocks/scenarios/build'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import type {
  AgentMessage,
  AgentSession,
  Asset,
  Canvas,
  Folder,
  GenerationJob,
  LedgerEntry,
  Project,
  Space,
} from '@/domain/types'
import { __resetScriptV2Runs } from './script-v2'

/**
 * File-backed workspace store.
 *
 * This is deliberately the *only* module that knows how state is persisted.
 * The integration target is Postgres (see architecture/orchestration-options.md);
 * swapping it means reimplementing this interface, not touching callers.
 *
 * Writes are serialised through a promise chain so concurrent route handlers
 * cannot interleave a read-modify-write.
 */

export interface WorkspaceState {
  spaces: Space[]
  folders: Folder[]
  projects: Project[]
  canvases: Canvas[]
  assets: Asset[]
  jobs: GenerationJob[]
  ledger: LedgerEntry[]
  sessions: AgentSession[]
  messages: AgentMessage[]
  /** Credit balance per space, kept in sync with the ledger tail. */
  balances: Record<string, number>
}

/**
 * Keep the normal workspace under `.data`, while allowing local demo/test
 * processes to point at an isolated directory without changing callers.
 * Relative values are resolved from the repository root (the Next cwd).
 */
export const DATA_DIR = path.resolve(process.cwd(), process.env.DATA_DIR?.trim() || '.data')
const STATE_FILE = path.join(DATA_DIR, 'workspace.json')
const SCENARIO_FILE = path.join(DATA_DIR, 'scenario.json')
const WRITE_LOCK_FILE = path.join(DATA_DIR, '.workspace.lock')
export const MEDIA_DIR = path.join(DATA_DIR, 'media')
const PUBLIC_FIXTURE_MEDIA_DIR = path.join(process.cwd(), 'public', 'fixtures', 'libtv', 'media')
const SEEDED_FIXTURE_MEDIA = ['city-night.mp4', 'compositor-bed.wav'] as const

export const DEFAULT_SPACE_ID = 'sp_default'
export const PROJECT_RECYCLE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

let writeChain: Promise<unknown> = Promise.resolve()

async function seedFixtureMedia(overwrite = false) {
  const target = path.join(MEDIA_DIR, 'fixtures')
  await fs.mkdir(target, { recursive: true })
  await Promise.all(SEEDED_FIXTURE_MEDIA.map(async (name) => {
    try {
      await fs.copyFile(
        path.join(PUBLIC_FIXTURE_MEDIA_DIR, name),
        path.join(target, name),
        overwrite ? 0 : fsConstants.COPYFILE_EXCL,
      )
    } catch (error) {
      // Unit tests intentionally import this store from temporary cwd roots
      // that do not carry browser fixtures. Runtime workspaces do.
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && code !== 'EEXIST') throw error
    }
  }))
}

async function ensureDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true })
  await fs.mkdir(MEDIA_DIR, { recursive: true })
  await seedFixtureMedia()
}

async function load(): Promise<WorkspaceState> {
  await ensureDirs()
  try {
    // The file is the authority. Next dev can load this module once per route
    // bundle, so an mtime-guarded process-local cache can hide a write made by
    // another bundle (and filesystems are allowed to coalesce mtimes).
    const raw = await fs.readFile(STATE_FILE, 'utf8')
    return JSON.parse(raw) as WorkspaceState
  } catch {
    const state = buildScenario(await readActiveScenarioId())
    await writeAtomically(STATE_FILE, JSON.stringify(state, null, 2))
    return state
  }
}

async function writeAtomically(file: string, contents: string) {
  // Include a UUID: route bundles share a process id but not necessarily a
  // module-local counter, so a pid-only temp name can collide under load.
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(tmp, contents, 'utf8')
    await fs.rename(tmp, file)
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => undefined)
  }
}

async function persist(state: WorkspaceState) {
  await ensureDirs()
  await writeAtomically(STATE_FILE, JSON.stringify(state, null, 2))
}

async function persistScenarioId(scenarioId: ScenarioId) {
  await ensureDirs()
  await writeAtomically(SCENARIO_FILE, JSON.stringify({ scenarioId }, null, 2))
}

export async function activeScenarioId(): Promise<ScenarioId> {
  return enqueueWrite(readActiveScenarioId)
}

/**
 * Read the scenario marker while the caller already owns the workspace lock.
 *
 * This is intentionally exported for the small number of fixture stores which
 * persist beside `workspace.json` (currently local identity). Calling the
 * public `activeScenarioId` from inside `withWorkspaceLock` would queue behind
 * itself and deadlock; keeping this explicit makes that boundary auditable.
 */
export async function activeScenarioIdWhileLocked(): Promise<ScenarioId> {
  return readActiveScenarioId()
}

async function readActiveScenarioId(): Promise<ScenarioId> {
  await ensureDirs()

  try {
    // Always read the marker. The active scenario is a cross-bundle control
    // value, not a safe process-local cache entry; mtime checks can miss a
    // replacement made with a coarser or preserved timestamp.
    const raw = JSON.parse(await fs.readFile(SCENARIO_FILE, 'utf8')) as unknown
    const parsed = ScenarioIdSchema.safeParse(
      raw && typeof raw === 'object' && 'scenarioId' in raw ? (raw as { scenarioId: unknown }).scenarioId : raw,
    )
    if (parsed.success) {
      return parsed.data
    }
  } catch {
    // Missing or malformed metadata falls through to the deterministic default.
  }

  await persistScenarioId(DEFAULT_SCENARIO_ID)
  return DEFAULT_SCENARIO_ID
}

async function acquireWriteLock(): Promise<() => Promise<void>> {
  await ensureDirs()
  while (true) {
    try {
      const handle = await fs.open(WRITE_LOCK_FILE, 'wx')
      return async () => {
        await handle.close().catch(() => undefined)
        await fs.unlink(WRITE_LOCK_FILE).catch(() => undefined)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      await new Promise<void>((resolve) => setTimeout(resolve, 5))
    }
  }
}

/** Serialize writes both within a bundle and across Next route bundles. */
function enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
  const run = async () => {
    const release = await acquireWriteLock()
    try {
      return await operation()
    } finally {
      await release()
    }
  }
  const next = writeChain.then(run, run)
  writeChain = next.catch(() => undefined)
  return next
}

/**
 * Execute a fixture operation under the same cross-bundle lock as workspace
 * mutations. This is for volatile companion stores only; workspace documents
 * must keep using `withState` so their persistence remains centralised here.
 */
export function withWorkspaceLock<T>(operation: () => Promise<T>): Promise<T> {
  return enqueueWrite(operation)
}

export async function readState(): Promise<WorkspaceState> {
  // Reads participate in the lock as well. A reset replaces both the scenario
  // marker and workspace document, so an unlocked reader could otherwise
  // combine the marker from one fixture generation with the document from the
  // next one.
  return enqueueWrite(load)
}

/** A linearizable fixture snapshot for routes that expose scenario + state. */
export async function readScenarioState(): Promise<{ scenarioId: ScenarioId; state: WorkspaceState }> {
  return enqueueWrite(async () => ({
    scenarioId: await readActiveScenarioId(),
    state: await load(),
  }))
}

/**
 * Serialised read-modify-write. The mutator receives the live state object and
 * may mutate it in place; the return value is passed back to the caller.
 */
export async function withState<T>(mutator: (state: WorkspaceState) => T | Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const state = await load()
    const result = await mutator(state)
    await persist(state)
    return result
  }
  return enqueueWrite(run)
}

/**
 * Kept as a compatibility seam for tests and future storage adapters.
 * The file-backed implementation reads disk for every operation, so there is
 * no process-local cache to invalidate.
 */
export function invalidateCache() {}

export async function resetStore(scenarioId?: ScenarioId) {
  return enqueueWrite(async () => {
    const selected = scenarioId === undefined ? await readActiveScenarioId() : ScenarioIdSchema.parse(scenarioId)
    const next = buildScenario(selected)
    await ensureDirs()
    await seedFixtureMedia(true)
    await persist(next)
    await persistScenarioId(selected)
    await resetVolatileFixtureState(selected)
    return next
  })
}

/**
 * Reset every stateful local fixture as one lifecycle boundary.
 *
 * App routes are independently bundled by Next in development. The workspace
 * lock above is the shared ordering point, while these modules keep their
 * state either process-global or in DATA_DIR. Imports stay lazy to avoid a
 * store -> feature -> store evaluation cycle during Next route compilation.
 */
async function resetVolatileFixtureState(scenarioId: ScenarioId) {
  __resetScriptV2Runs()
  const [
    creationContext,
    identity,
    presence,
    generationRunner,
    mockProvider,
    compose,
  ] = await Promise.all([
    import('./creation-context'),
    import('./identity'),
    import('./presence'),
    import('./generation/runner'),
    import('./generation/mock-provider'),
    import('./compose'),
  ])

  creationContext.resetCreationContextStore()
  presence.resetPresence()
  generationRunner.__resetGenerationRunnerForTests()
  mockProvider.__resetMockProvider()
  compose.__resetComposeCapabilities()
  await identity.resetLocalIdentityStore(scenarioId)
}

/* ------------------------------------------------------------------ *
 * Selectors — pure lookups shared by route handlers
 * ------------------------------------------------------------------ */

export function isProjectRecycled(project: Project): boolean {
  return Boolean(project.recycledAt)
}

/** Lookup excluding recycled projects. Normal project and canvas routes must use this. */
export function findProject(state: WorkspaceState, projectId: string): Project | undefined {
  return state.projects.find((p) => p.id === projectId && !isProjectRecycled(p))
}

/** Internal recycle-bin lookup that deliberately includes soft-deleted rows. */
export function findStoredProject(state: WorkspaceState, projectId: string): Project | undefined {
  return state.projects.find((p) => p.id === projectId)
}

/** Folder membership is always scoped to the same workspace as its project. */
export function findProjectFolder(state: WorkspaceState, folderId: string, spaceId: string): Folder | undefined {
  return state.folders.find((folder) => folder.id === folderId && folder.spaceId === spaceId)
}

export function findCanvas(state: WorkspaceState, canvasId: string): Canvas | undefined {
  return state.canvases.find((c) => c.id === canvasId)
}

export function canvasesOfProject(state: WorkspaceState, projectId: string): Canvas[] {
  const project = findProject(state, projectId)
  if (!project) return []
  return project.canvasIds
    .map((id) => state.canvases.find((c) => c.id === id))
    .filter((c): c is Canvas => Boolean(c))
}

export type RecycledProjectView = Project & {
  canvasCount: number
  originalFolderName: string | null
  daysRemaining: number
}

/**
 * Marks projects as recycled without touching canvases, jobs or Agent history.
 * The original folder is retained independently so restore can fall back to the
 * root workspace when that folder was permanently removed in the meantime.
 */
export function recycleProjects(
  state: WorkspaceState,
  projectIds: string[],
  now: Date = new Date(),
): string[] {
  if (projectIds.length === 0) return []
  const ids = new Set(projectIds)
  const recycledAt = now.toISOString()
  const recycleExpiresAt = new Date(now.getTime() + PROJECT_RECYCLE_RETENTION_MS).toISOString()
  const recycled: string[] = []
  for (const project of state.projects) {
    if (!ids.has(project.id) || isProjectRecycled(project)) continue
    project.recycleOriginalFolderId = project.folderId
    project.recycledAt = recycledAt
    project.recycleExpiresAt = recycleExpiresAt
    project.updatedAt = recycledAt
    recycled.push(project.id)
  }
  return recycled
}

/** Restore a soft-deleted project and all its untouched canvas documents. */
export function restoreProject(state: WorkspaceState, projectId: string, now: Date = new Date()): Project | undefined {
  const project = findStoredProject(state, projectId)
  if (!project || !isProjectRecycled(project)) return undefined
  const originalFolderId = project.recycleOriginalFolderId ?? project.folderId
  project.folderId = originalFolderId && state.folders.some((folder) => folder.id === originalFolderId) ? originalFolderId : null
  // Keep normal Project responses free of recycle-only persistence fields.
  delete project.recycledAt
  delete project.recycleExpiresAt
  delete project.recycleOriginalFolderId
  project.updatedAt = now.toISOString()
  return project
}

/** Permanently remove recycle-bin entries whose 30-day retention elapsed. */
export function purgeExpiredRecycledProjects(state: WorkspaceState, now: Date = new Date()): string[] {
  const expiredIds = state.projects
    .filter((project) => {
      if (!isProjectRecycled(project) || !project.recycleExpiresAt) return false
      return new Date(project.recycleExpiresAt).getTime() <= now.getTime()
    })
    .map((project) => project.id)
  return deleteProjects(state, expiredIds)
}

export function recycledProjects(state: WorkspaceState, now: Date = new Date()): RecycledProjectView[] {
  return state.projects
    .filter((project) => isProjectRecycled(project))
    .map((project) => {
      const expiry = project.recycleExpiresAt ? new Date(project.recycleExpiresAt).getTime() : now.getTime()
      return {
        ...project,
        canvasCount: project.canvasIds.filter((id) => state.canvases.some((canvas) => canvas.id === id)).length,
        originalFolderName: project.recycleOriginalFolderId
          ? state.folders.find((folder) => folder.id === project.recycleOriginalFolderId)?.name ?? null
          : null,
        daysRemaining: Math.max(0, Math.ceil((expiry - now.getTime()) / (24 * 60 * 60 * 1000))),
      }
    })
    .sort((left, right) => (right.recycledAt ?? '').localeCompare(left.recycledAt ?? ''))
}

export function balanceOf(state: WorkspaceState, spaceId: string): number {
  return state.balances[spaceId] ?? 0
}

/* ------------------------------------------------------------------ *
 * Cascading deletes
 *
 * Three routes can remove a project — directly, via its folder, or as part of
 * a workspace teardown. They used to each re-derive the cascade and had drifted
 * apart, leaving orphaned sessions and messages behind. Deletion order lives
 * here so every caller sheds exactly the same subtree.
 * ------------------------------------------------------------------ */

/** Remove sessions and, with them, their message history. */
export function deleteSessions(state: WorkspaceState, sessionIds: string[]): number {
  if (sessionIds.length === 0) return 0
  const doomed = new Set(sessionIds)
  const before = state.sessions.length
  state.sessions = state.sessions.filter((s) => !doomed.has(s.id))
  state.messages = state.messages.filter((m) => !doomed.has(m.sessionId))
  return before - state.sessions.length
}

/**
 * Remove projects together with their canvases, agent sessions and messages.
 * Returns the ids actually removed so callers can report a count.
 */
export function deleteProjects(state: WorkspaceState, projectIds: string[]): string[] {
  if (projectIds.length === 0) return []
  const doomed = new Set(projectIds)
  const removed = state.projects.filter((p) => doomed.has(p.id)).map((p) => p.id)
  if (removed.length === 0) return []

  state.projects = state.projects.filter((p) => !doomed.has(p.id))
  state.canvases = state.canvases.filter((c) => !doomed.has(c.projectId))
  deleteSessions(
    state,
    state.sessions.filter((s) => s.projectId !== null && doomed.has(s.projectId)).map((s) => s.id),
  )
  return removed
}
