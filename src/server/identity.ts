import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

import {
  IdentityResponseSchema,
  LocalReturnToSchema,
  type IdentityResponse,
  type LocalSession,
  type UpdateSessionRequest,
} from '@/contracts/identity'
import {
  LocalPreferencesSchema,
  type LocalPreferences,
  type UpdatePreferencesRequest,
} from '@/contracts/preferences'
import {
  NotificationSummarySchema,
  type NotificationSummary,
} from '@/contracts/notifications'
import {
  DEFAULT_LOCAL_PREFERENCES,
  LOCAL_IDENTITY_FIXTURE,
  LOCAL_NOTIFICATION_FIXTURE,
} from '@/mocks/identity'
import { activeScenarioId, activeScenarioIdWhileLocked, DATA_DIR, withWorkspaceLock } from '@/server/store'

const IDENTITY_FILE = path.join(DATA_DIR, 'local-identity.json')

type StoredIdentityState = {
  scenarioId: string
  sessionStatus: LocalSession['status']
  preferences: LocalPreferences
  readNotificationIds: string[]
}

function defaultStatus(scenarioId: string): LocalSession['status'] {
  return scenarioId === 'anonymous' || scenarioId === 'public-showcase' ? 'anonymous' : 'authenticated'
}

function defaultStoredState(scenarioId: string): StoredIdentityState {
  return {
    scenarioId,
    sessionStatus: defaultStatus(scenarioId),
    preferences: { ...DEFAULT_LOCAL_PREFERENCES },
    readNotificationIds: [],
  }
}

function parseStoredState(value: unknown, scenarioId: string): StoredIdentityState {
  if (!value || typeof value !== 'object') return defaultStoredState(scenarioId)
  const record = value as Partial<StoredIdentityState>
  const preferences = LocalPreferencesSchema.safeParse(record.preferences)
  return {
    scenarioId: typeof record.scenarioId === 'string' ? record.scenarioId : scenarioId,
    sessionStatus: record.sessionStatus === 'anonymous' || record.sessionStatus === 'authenticated'
      ? record.sessionStatus
      : defaultStatus(scenarioId),
    preferences: preferences.success ? preferences.data : { ...DEFAULT_LOCAL_PREFERENCES },
    readNotificationIds: Array.isArray(record.readNotificationIds)
      ? record.readNotificationIds.filter((item): item is string => typeof item === 'string')
      : [],
  }
}

async function loadStoredState(alreadyLocked = false): Promise<StoredIdentityState> {
  const scenarioId = alreadyLocked ? await activeScenarioIdWhileLocked() : await activeScenarioId()
  try {
    const parsed = parseStoredState(JSON.parse(await fs.readFile(IDENTITY_FILE, 'utf8')) as unknown, scenarioId)
    // Scenario changes are an explicit fixture reset boundary. Preferences
    // remain local, while auth and notification state re-enter deterministically.
    if (parsed.scenarioId !== scenarioId) {
      return { ...defaultStoredState(scenarioId), preferences: parsed.preferences }
    }
    return parsed
  } catch {
    return defaultStoredState(scenarioId)
  }
}

async function persist(state: StoredIdentityState) {
  await fs.mkdir(DATA_DIR, { recursive: true })
  const temporary = `${IDENTITY_FILE}.${process.pid}.${randomUUID()}.tmp`
  await fs.writeFile(temporary, JSON.stringify(state, null, 2), 'utf8')
  await fs.rename(temporary, IDENTITY_FILE)
}

async function mutate<T>(operation: (state: StoredIdentityState) => T | Promise<T>): Promise<T> {
  return withWorkspaceLock(async () => {
    const state = await loadStoredState(true)
    const value = await operation(state)
    await persist(state)
    return value
  })
}

/**
 * Invoked by `resetStore` while it owns the workspace lifecycle lock. Keeping
 * identity in that transaction prevents a stale account preference/session
 * write from landing between the workspace and scenario reset files.
 */
export async function resetLocalIdentityStore(scenarioId: string): Promise<void> {
  await persist(defaultStoredState(scenarioId))
}

function toSummary(state: StoredIdentityState): NotificationSummary {
  if (state.sessionStatus === 'anonymous') return { unreadCount: 0, totalCount: 0, items: [] }
  const read = new Set(state.readNotificationIds)
  const items = LOCAL_NOTIFICATION_FIXTURE.map((item) => ({ ...item, unread: item.unread && !read.has(item.id) }))
  return NotificationSummarySchema.parse({
    unreadCount: items.filter((item) => item.unread).length,
    totalCount: items.length,
    items,
  })
}

function normaliseReturnTo(returnTo: string | undefined): string {
  const parsed = LocalReturnToSchema.safeParse(returnTo ?? '/')
  if (!parsed.success) throw new Error('returnTo 必须是站内相对路径')
  return parsed.data
}

function toIdentityResponse(state: StoredIdentityState, returnTo?: string): IdentityResponse {
  const response = {
    identity: state.sessionStatus === 'authenticated' ? LOCAL_IDENTITY_FIXTURE : null,
    session: {
      status: state.sessionStatus,
      returnTo: normaliseReturnTo(returnTo),
    },
  }
  return IdentityResponseSchema.parse(response)
}

export async function readLocalIdentity(returnTo?: string): Promise<IdentityResponse> {
  return withWorkspaceLock(async () => toIdentityResponse(await loadStoredState(true), returnTo))
}

export async function updateLocalSession(input: UpdateSessionRequest): Promise<IdentityResponse> {
  return mutate((state) => {
    state.sessionStatus = input.action === 'signIn' ? 'authenticated' : 'anonymous'
    return toIdentityResponse(state, input.returnTo)
  })
}

export async function readLocalPreferences(): Promise<LocalPreferences> {
  return withWorkspaceLock(async () => (await loadStoredState(true)).preferences)
}

export async function updateLocalPreferences(input: UpdatePreferencesRequest): Promise<LocalPreferences> {
  return mutate((state) => {
    state.preferences = LocalPreferencesSchema.parse({ ...state.preferences, ...input })
    return state.preferences
  })
}

export async function readNotificationSummary(): Promise<NotificationSummary> {
  return withWorkspaceLock(async () => toSummary(await loadStoredState(true)))
}

export async function markAllLocalNotificationsRead(): Promise<NotificationSummary> {
  return mutate((state) => {
    state.readNotificationIds = LOCAL_NOTIFICATION_FIXTURE.map((item) => item.id)
    return toSummary(state)
  })
}
