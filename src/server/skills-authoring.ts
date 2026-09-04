import type { AuthoredSkill, SkillAuthorFile, SkillAuthorReview, UpdateAuthoredSkillRequest } from '@/contracts/skills'
import { AUTHORING_ACTOR, AUTHORING_TIMESTAMP, AUTHOR_SKILL_TEMPLATE_FILES, EMPTY_AUTHORED_SKILLS } from '@/mocks/skills-authoring'
import { HttpError } from './http'
import { readState, withState, type WorkspaceState } from './store'

/**
 * Authoring records intentionally live on the local workspace carrier. This
 * mirrors the other frontend-only seams and keeps the persistence boundary
 * isolated from `WorkspaceState` until a real backend owns this aggregate.
 */
type AuthoringCarrier = WorkspaceState & { authoredSkills?: AuthoredSkill[] }

function authored(state: WorkspaceState): AuthoredSkill[] {
  const value = (state as AuthoringCarrier).authoredSkills
  return Array.isArray(value) ? value.map(normalizeAuthoredSkill) : EMPTY_AUTHORED_SKILLS
}

function editable(state: WorkspaceState): AuthoredSkill[] {
  const carrier = state as AuthoringCarrier
  if (!Array.isArray(carrier.authoredSkills)) carrier.authoredSkills = []
  carrier.authoredSkills = carrier.authoredSkills.map(normalizeAuthoredSkill)
  return carrier.authoredSkills
}

/** Fill new author-form fields on read so old deterministic drafts remain editable. */
function normalizeAuthoredSkill(skill: AuthoredSkill): AuthoredSkill {
  const legacy = skill as AuthoredSkill & Partial<Pick<AuthoredSkill, 'usageScenarios' | 'howToUse' | 'outputContent' | 'outputTypes' | 'cover'>>
  return {
    ...skill,
    usageScenarios: legacy.usageScenarios ?? '',
    howToUse: legacy.howToUse ?? '',
    outputContent: legacy.outputContent ?? '',
    outputTypes: legacy.outputTypes ?? [],
    cover: legacy.cover ?? null,
  }
}

function authoredId(index: number) {
  return `skill-local-${String(index).padStart(3, '0')}`
}

function timestamp(revision: number) {
  return new Date(Date.parse(AUTHORING_TIMESTAMP) + revision * 1_000).toISOString()
}

function cloneFiles(files: SkillAuthorFile[]): SkillAuthorFile[] {
  return files.map((file) => ({ ...file }))
}

function reviewFor(skill: Pick<AuthoredSkill, 'name' | 'summary' | 'category' | 'usageScenarios' | 'howToUse' | 'outputContent' | 'outputTypes' | 'version' | 'files'>, checkedAt: string | null): SkillAuthorReview {
  const semantic = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(skill.version)
  const mainFile = skill.files.find((file) => file.path === 'SKILL.md')
  const mainHasBody = Boolean(mainFile?.content.trim())
  const hasMeaningfulText = (value: string) => value.trim().length >= 8
  const checks: SkillAuthorReview['checks'] = [
    { id: 'name', label: '名称', passed: skill.name.trim().length >= 2, message: '名称至少需要 2 个字符。' },
    { id: 'summary', label: '简介', passed: skill.summary.trim().length >= 12, message: '简介至少需要 12 个字符。' },
    { id: 'category', label: '分类', passed: Boolean(skill.category), message: '请选择一个 Skill 分类。' },
    { id: 'usage-scenarios', label: '使用场景', passed: hasMeaningfulText(skill.usageScenarios), message: '请补充至少 8 个字符的使用场景。' },
    { id: 'how-to-use', label: '如何使用', passed: hasMeaningfulText(skill.howToUse), message: '请补充至少 8 个字符的使用方法。' },
    { id: 'output-content', label: '输出内容', passed: hasMeaningfulText(skill.outputContent), message: '请补充至少 8 个字符的输出内容。' },
    { id: 'output-types', label: '输出类型', passed: skill.outputTypes.length > 0, message: '请至少选择一种输出类型。' },
    { id: 'skill-file', label: 'SKILL.md', passed: mainHasBody, message: '请补充根目录 SKILL.md 的执行规范。' },
    { id: 'semantic-version', label: '语义版本', passed: semantic, message: '版本必须符合 MAJOR.MINOR.PATCH。' },
  ]
  return { status: checks.every((check) => check.passed) ? 'approved' : 'changes_requested', checkedAt, checks }
}

function findEditable(state: WorkspaceState, skillId: string): [AuthoredSkill[], number, AuthoredSkill] {
  const rows = editable(state)
  const index = rows.findIndex((skill) => skill.id === skillId)
  if (index < 0) throw new HttpError(404, '本地作者 Skill 不存在')
  return [rows, index, rows[index]]
}

export async function listAuthoredSkills(): Promise<AuthoredSkill[]> {
  const state = await readState()
  return authored(state).map((skill) => structuredClone(skill)).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export async function getAuthoredSkill(skillId: string): Promise<AuthoredSkill> {
  const state = await readState()
  const skill = authored(state).find((candidate) => candidate.id === skillId)
  if (!skill) throw new HttpError(404, '本地作者 Skill 不存在')
  return structuredClone(skill)
}

export async function createAuthoredSkill(name?: string): Promise<AuthoredSkill> {
  return withState((state) => {
    const rows = editable(state)
    const id = authoredId(rows.length + 1)
    const createdAt = timestamp(rows.length)
    const draft: AuthoredSkill = {
      id,
      name: name?.trim() || '未命名 Skill',
      summary: '',
      category: '叙事分镜',
      usageScenarios: '',
      howToUse: '',
      outputContent: '',
      outputTypes: [],
      cover: null,
      version: '0.1.0',
      status: 'draft',
      review: { status: 'not_requested', checkedAt: null, checks: [] },
      files: cloneFiles(AUTHOR_SKILL_TEMPLATE_FILES),
      tags: [],
      createdAt,
      updatedAt: createdAt,
      publishedAt: null,
      author: AUTHORING_ACTOR,
      hue: (204 + rows.length * 37) % 360,
    }
    rows.push(draft)
    return structuredClone(draft)
  })
}

/** Saving always returns the record to draft so a reviewed publication cannot drift. */
export async function updateAuthoredSkill(skillId: string, patch: UpdateAuthoredSkillRequest): Promise<AuthoredSkill> {
  return withState((state) => {
    const [rows, index, current] = findEditable(state, skillId)
    if (current.status === 'published') throw new HttpError(409, '已发布的 Skill 请先下架再编辑')
    const next: AuthoredSkill = {
      ...current,
      ...patch,
      files: patch.files ? cloneFiles(patch.files) : current.files,
      tags: patch.tags ? [...patch.tags] : current.tags,
      outputTypes: patch.outputTypes ? [...patch.outputTypes] : current.outputTypes,
      status: current.status === 'unpublished' ? 'unpublished' : 'draft',
      review: { status: 'not_requested', checkedAt: null, checks: [] },
      updatedAt: timestamp(index + 10 + current.files.length),
    }
    rows[index] = next
    return structuredClone(next)
  })
}

export async function transitionAuthoredSkill(skillId: string, action: 'submit_review' | 'publish' | 'unpublish'): Promise<AuthoredSkill> {
  return withState((state) => {
    const [rows, index, current] = findEditable(state, skillId)
    if (action === 'submit_review') {
      if (current.status === 'published') throw new HttpError(409, '已发布的 Skill 请先下架再提交审核')
      const checkedAt = timestamp(index + 100)
      const review = reviewFor(current, checkedAt)
      const next: AuthoredSkill = { ...current, review, status: review.status === 'approved' ? 'in_review' : 'draft', updatedAt: checkedAt }
      rows[index] = next
      return structuredClone(next)
    }
    if (action === 'publish') {
      if (current.status === 'published') return structuredClone(current)
      const checkedAt = timestamp(index + 200)
      const review = reviewFor(current, checkedAt)
      if (review.status !== 'approved') {
        const next = { ...current, review, status: 'draft' as const, updatedAt: checkedAt }
        rows[index] = next
        throw new HttpError(422, review.checks.filter((check) => !check.passed).map((check) => check.message).join(' '))
      }
      if (current.status !== 'in_review') throw new HttpError(409, '请先提交审核，再发布 Skill')
      const next: AuthoredSkill = { ...current, review, status: 'published', updatedAt: checkedAt, publishedAt: checkedAt }
      rows[index] = next
      return structuredClone(next)
    }
    if (current.status !== 'published') throw new HttpError(409, '只有已发布的 Skill 可以下架')
    const updatedAt = timestamp(index + 300)
    const next: AuthoredSkill = { ...current, status: 'unpublished', updatedAt }
    rows[index] = next
    return structuredClone(next)
  })
}

/** Published authored drafts are projected into the existing `我的` market collection. */
export async function publishedAuthorSkillCards() {
  const rows = await listAuthoredSkills()
  return rows.filter((skill) => skill.status === 'published').map((skill) => ({
    id: skill.id,
    name: skill.name,
    summary: skill.summary,
    category: skill.category,
    author: skill.author,
    origin: 'personal' as const,
    version: skill.version,
    updatedAt: skill.updatedAt.slice(0, 10),
    hue: skill.hue,
    usageCount: 0,
    tags: skill.tags,
    usageScenarios: skill.usageScenarios,
    howToUse: skill.howToUse,
    outputContent: skill.outputContent,
    outputTypes: skill.outputTypes,
    cover: skill.cover,
    examples: [skill.howToUse],
    executableSpec: [
      { heading: '使用场景', body: skill.usageScenarios },
      { heading: '如何使用', body: skill.howToUse },
      { heading: '输出内容', body: skill.outputContent },
      { heading: '输出类型', body: skill.outputTypes.join('、') },
      { heading: 'SKILL.md', body: skill.files.find((file) => file.path === 'SKILL.md')?.content || '暂无内容' },
    ],
    favourite: false,
  }))
}
