import type { AuthoredSkill, SkillAuthorFile } from '@/contracts/skills'

/** Deterministic authoring template. It is copied into workspace state on create. */
export const AUTHOR_SKILL_TEMPLATE_FILES: SkillAuthorFile[] = [
  {
    path: 'SKILL.md',
    language: 'markdown',
    content: '# 我的新 Skill\n\n## 触发条件\n描述 Agent 何时应该使用这份 Skill。\n\n## 输入\n- 用户目标\n- 已选素材或参考\n\n## 执行步骤\n1. 先确认约束。\n2. 输出可执行的创作建议。\n\n## 输出格式\n按镜头或任务逐项返回。',
  },
  {
    path: 'references.json',
    language: 'json',
    content: '{\n  "references": []\n}',
  },
]

/** The explicit empty fixture lets UI and API tests demonstrate a first-time author. */
export const EMPTY_AUTHORED_SKILLS: AuthoredSkill[] = []
export const AUTHORING_ACTOR = '本地创作者'
export const AUTHORING_TIMESTAMP = '2026-09-04T12:00:00.000Z'
