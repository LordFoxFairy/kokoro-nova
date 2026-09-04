import { constants as fsConstants, promises as fs } from 'node:fs'
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
export const MEDIA_DIR = path.join(DATA_DIR, 'media')
const PUBLIC_FIXTURE_MEDIA_DIR = path.join(process.cwd(), 'public', 'fixtures', 'libtv', 'media')
const SEEDED_FIXTURE_MEDIA = ['city-night.mp4', 'compositor-bed.wav'] as const

export const DEFAULT_SPACE_ID = 'sp_default'

let cache: WorkspaceState | null = null
let cacheMtimeNs: bigint | null = null
let activeScenarioCache: ScenarioId | null = null
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
    const stat = await fs.stat(STATE_FILE, { bigint: true })
    if (cache && cacheMtimeNs === stat.mtimeNs) return cache
    const raw = await fs.readFile(STATE_FILE, 'utf8')
    cache = JSON.parse(raw) as WorkspaceState
    cacheMtimeNs = (await fs.stat(STATE_FILE, { bigint: true })).mtimeNs
  } catch {
    cache = buildScenario(await activeScenarioId())
    await fs.writeFile(STATE_FILE, JSON.stringify(cache, null, 2), 'utf8')
    cacheMtimeNs = (await fs.stat(STATE_FILE, { bigint: true })).mtimeNs
  }
  return cache
}

async function persist(state: WorkspaceState) {
  await ensureDirs()
  // Atomic-ish replace: write a temp file then rename, so a crash mid-write
  // cannot truncate the authoritative document.
  const tmp = `${STATE_FILE}.${process.pid}.tmp`
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8')
  await fs.rename(tmp, STATE_FILE)
  cacheMtimeNs = (await fs.stat(STATE_FILE, { bigint: true })).mtimeNs
}

async function persistScenarioId(scenarioId: ScenarioId) {
  await ensureDirs()
  const tmp = `${SCENARIO_FILE}.${process.pid}.tmp`
  await fs.writeFile(tmp, JSON.stringify({ scenarioId }, null, 2), 'utf8')
  await fs.rename(tmp, SCENARIO_FILE)
}

export async function activeScenarioId(): Promise<ScenarioId> {
  if (activeScenarioCache) return activeScenarioCache
  await ensureDirs()
  try {
    const raw = JSON.parse(await fs.readFile(SCENARIO_FILE, 'utf8')) as unknown
    const parsed = ScenarioIdSchema.safeParse(
      raw && typeof raw === 'object' && 'scenarioId' in raw ? (raw as { scenarioId: unknown }).scenarioId : raw,
    )
    if (parsed.success) {
      activeScenarioCache = parsed.data
      return parsed.data
    }
  } catch {
    // Missing or malformed metadata falls through to the deterministic default.
  }

  activeScenarioCache = DEFAULT_SCENARIO_ID
  await persistScenarioId(DEFAULT_SCENARIO_ID)
  return DEFAULT_SCENARIO_ID
}

export async function readState(): Promise<WorkspaceState> {
  return load()
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
  const next = writeChain.then(run, run)
  // Keep the chain alive even if this link rejects.
  writeChain = next.catch(() => undefined)
  return next
}

/** Test/dev helper: drop the in-memory cache so the next read re-reads disk. */
export function invalidateCache() {
  cache = null
  cacheMtimeNs = null
  activeScenarioCache = null
}

export async function resetStore(scenarioId?: ScenarioId) {
  __resetScriptV2Runs()
  const selected = scenarioId === undefined ? await activeScenarioId() : ScenarioIdSchema.parse(scenarioId)
  const next = buildScenario(selected)
  await ensureDirs()
  await seedFixtureMedia(true)
  await persist(next)
  await persistScenarioId(selected)
  cache = next
  activeScenarioCache = selected
  return next
}

/* ------------------------------------------------------------------ *
 * Selectors — pure lookups shared by route handlers
 * ------------------------------------------------------------------ */

export function findProject(state: WorkspaceState, projectId: string): Project | undefined {
  return state.projects.find((p) => p.id === projectId)
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
