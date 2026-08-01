import {
  SKILL_CATALOGUE,
  applyFavourite,
  findSkill,
  parseSkillCategory,
  parseSkillCollection,
  selectSkills,
  toSkillCards,
  type SkillCard,
  type SkillCategoryFilter,
  type SkillCollection,
} from '@/domain/skills'
import { HttpError } from './http'
import { DEFAULT_SPACE_ID, readState, withState, type WorkspaceState } from './store'

/*
 * Persistence constraint: `WorkspaceState` is owned by src/server/store.ts and
 * that module is closed to this feature, so skill favourites cannot get a
 * declared field. They ride on the very same persisted object under an extra key
 * this module attaches at runtime — the same arrangement src/server/publish.ts
 * uses for published snapshots. `withState` serialises and writes the whole
 * object, so the key survives restarts like a declared field would.
 *
 * The consequence every reader must respect: a workspace.json written before
 * this feature existed (or one reset by `resetStore`) has no such key, so it is
 * optional on read and only materialised on the first favourite.
 */
type FavouriteCarrier = WorkspaceState & { skillFavourites?: Record<string, string[]> }

/**
 * Keyed by space, not global: a star is a statement by one workspace about its
 * own shelf, and the catalogue it points into is shared and read-only.
 */
function readFavouriteIds(state: WorkspaceState, spaceId: string): string[] {
  const stored = (state as FavouriteCarrier).skillFavourites
  const ids = stored && typeof stored === 'object' ? stored[spaceId] : undefined
  return Array.isArray(ids) ? ids : []
}

function writeFavouriteIds(state: WorkspaceState, spaceId: string, ids: string[]) {
  const carrier = state as FavouriteCarrier
  if (!carrier.skillFavourites || typeof carrier.skillFavourites !== 'object') {
    carrier.skillFavourites = {}
  }
  carrier.skillFavourites[spaceId] = ids
}

export interface SkillListInput {
  category?: string | null
  query?: string | null
  collection?: string | null
}

export interface SkillListResult {
  skills: SkillCard[]
  category: SkillCategoryFilter
  collection: SkillCollection
  /**
   * How many rows each collection would return under the *same* category and
   * query, so the switch can say what is behind a tab before it is opened.
   */
  counts: { all: number; favourite: number; mine: number }
}

export async function listSkills(input: SkillListInput = {}): Promise<SkillListResult> {
  const state = await readState()
  const favouriteIds = readFavouriteIds(state, DEFAULT_SPACE_ID)

  const category = parseSkillCategory(input.category)
  const collection = parseSkillCollection(input.collection)
  const narrow = { category, query: input.query, favouriteIds }

  return {
    skills: toSkillCards(selectSkills(SKILL_CATALOGUE, { ...narrow, collection }), favouriteIds),
    category,
    collection,
    counts: {
      all: selectSkills(SKILL_CATALOGUE, { ...narrow, collection: '全部' }).length,
      favourite: selectSkills(SKILL_CATALOGUE, { ...narrow, collection: '收藏' }).length,
      mine: selectSkills(SKILL_CATALOGUE, { ...narrow, collection: '我的' }).length,
    },
  }
}

export async function getSkill(skillId: string): Promise<SkillCard> {
  const skill = findSkill(skillId)
  if (!skill) throw new HttpError(404, 'Skill 不存在或已下架')
  const state = await readState()
  return toSkillCards([skill], readFavouriteIds(state, DEFAULT_SPACE_ID))[0]
}

/**
 * Set the star to an explicit state.
 *
 * Explicit rather than a flip so the write is idempotent: a retried request, a
 * double click or two tabs sending the same intent all land on the same state,
 * whereas a flip would land on whichever parity the requests happened to have.
 */
export async function setSkillFavourite(skillId: string, favourite: boolean): Promise<SkillCard> {
  const skill = findSkill(skillId)
  if (!skill) throw new HttpError(404, 'Skill 不存在或已下架')

  return withState((state) => {
    const current = readFavouriteIds(state, DEFAULT_SPACE_ID)
    // The catalogue itself is never touched — only this space's id list moves.
    writeFavouriteIds(state, DEFAULT_SPACE_ID, applyFavourite(current, skillId, favourite))
    return { ...skill, favourite }
  })
}
