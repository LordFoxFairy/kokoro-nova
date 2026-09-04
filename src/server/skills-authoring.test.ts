import { afterEach, describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { resetStore } from './store'
import { listSkills } from './skills'
import { createAuthoredSkill, transitionAuthoredSkill, updateAuthoredSkill } from './skills-authoring'

describe.sequential('local authoring catalogue projection', () => {
  afterEach(async () => { await resetStore(DEFAULT_SCENARIO_ID) })

  it('keeps drafts private, projects only published revisions into 我的, and removes them on unpublish', async () => {
    const draft = await createAuthoredSkill('节奏镜头规划')
    await updateAuthoredSkill(draft.id, {
      summary: '把连续镜头整理成具有节奏和明确转场的执行计划。',
      usageScenarios: '适用于脚本定稿后需要整理连续镜头的创作阶段。',
      howToUse: '输入镜头表、目标时长和既有角色资产后调用。',
      outputContent: '返回镜头节奏表、转场建议和可执行生成清单。',
      outputTypes: ['video', 'text'],
      cover: '/fixtures/libtv/skills/example-02.svg',
      version: '1.0.0',
      files: [{ path: 'SKILL.md', language: 'markdown', content: '# 节奏镜头规划\n\n1. 拆镜。' }],
    })
    expect((await listSkills({ collection: '我的' })).skills.map((skill) => skill.id)).not.toContain(draft.id)
    await transitionAuthoredSkill(draft.id, 'submit_review')
    await transitionAuthoredSkill(draft.id, 'publish')
    expect((await listSkills({ collection: '我的' })).skills).toEqual(expect.arrayContaining([expect.objectContaining({ id: draft.id, version: '1.0.0', origin: 'personal', usageScenarios: '适用于脚本定稿后需要整理连续镜头的创作阶段。', outputTypes: ['video', 'text'], cover: '/fixtures/libtv/skills/example-02.svg' })]))
    await transitionAuthoredSkill(draft.id, 'unpublish')
    expect((await listSkills({ collection: '我的' })).skills.map((skill) => skill.id)).not.toContain(draft.id)
  })
})
