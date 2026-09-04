import type { SkillComposerAsset, SkillComposerMode } from '@/contracts/skills'

/**
 * Stable, local-only composer fixtures.
 *
 * The market is intentionally useful before a real workspace is connected:
 * these rows are the same every time, contain no user data, and are served by
 * /api/skills?composer=... . Querying `fixture=empty` or `fixture=error` is kept as
 * a deterministic seam for browser tests to exercise recovery UI.
 */
export const SKILL_COMPOSER_ATTACHMENTS: SkillComposerAsset[] = [
  {
    id: 'attachment-night-city-board',
    label: '夜雨城市参考板',
    description: '一组用于建立夜景色调与镜头节奏的本地参考图。',
    type: 'image',
    meta: 'PNG · 4 张 · 2.4 MB',
    thumbnail: '/fixtures/libtv/skills/example-01.svg',
  },
  {
    id: 'attachment-product-brief',
    label: '产品发布 brief',
    description: '包含卖点、受众和 30 秒片长约束的文本资料。',
    type: 'document',
    meta: 'MD · 18 KB',
    thumbnail: '/fixtures/libtv/skills/example-02.svg',
  },
  {
    id: 'attachment-city-bed',
    label: '城市环境声',
    description: '可作为氛围参考的夜间城市底噪。',
    type: 'audio',
    meta: 'WAV · 00:18 · 3.1 MB',
    thumbnail: '/fixtures/libtv/skills/example-03.svg',
  },
]

export const SKILL_COMPOSER_REFERENCES: SkillComposerAsset[] = [
  {
    id: 'reference-main-character',
    label: '女主角角色卡',
    description: '锁定脸型、发型和体型的角色一致性参考。',
    type: 'character',
    meta: '画布节点 · 角色 01',
    thumbnail: '/fixtures/libtv/skills/example-04.svg',
  },
  {
    id: 'reference-brand-style',
    label: '品牌视觉基调',
    description: '冷蓝高光与暖橙反差的统一视觉风格。',
    type: 'style',
    meta: '画布节点 · 风格 02',
    thumbnail: '/fixtures/libtv/skills/example-01.svg',
  },
  {
    id: 'reference-last-frame',
    label: '上一镜结尾帧',
    description: '用于保持人物位置和运动方向连续。',
    type: 'image',
    meta: '画布节点 · 图片 03',
    thumbnail: '/fixtures/libtv/skills/example-02.svg',
  },
  {
    id: 'reference-voiceover',
    label: '旁白音色参考',
    description: '为后续配音生成提供语气与节奏锚点。',
    type: 'audio',
    meta: '素材库 · WAV · 00:12',
    thumbnail: '/fixtures/libtv/skills/example-03.svg',
  },
]

export const SKILL_COMPOSER_MODES: SkillComposerMode[] = [
  {
    id: 'manual',
    label: '手动规划',
    description: '先给出脚本、镜头和素材建议，确认后再继续。',
    hint: '适合需要逐步把控的创作',
  },
  {
    id: 'auto',
    label: '自动生成',
    description: '根据当前上下文快速整理一版可执行的创作方案。',
    hint: '适合快速验证想法',
  },
  {
    id: 'draft',
    label: '只出草稿',
    description: '只生成文字草稿与待确认清单，不触发媒体生成。',
    hint: '适合先收敛方向',
  },
]

export function composerAssets(kind: 'attachments' | 'references'): SkillComposerAsset[] {
  return kind === 'attachments' ? SKILL_COMPOSER_ATTACHMENTS : SKILL_COMPOSER_REFERENCES
}
