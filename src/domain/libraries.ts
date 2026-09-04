/**
 * Static catalogues backing the in-canvas libraries: 风格库 / 特效库 /
 * 角色库 / 音色库 / 运镜库 / Slash 叙事预设.
 *
 * They are local descriptors with generated preview art (see
 * `src/lib/preview.ts`) so the editor is fully usable before an integrator
 * points them at real catalogue services.
 */

export interface StylePreset {
  id: string
  name: string
  category: string
  author: string
  commercial: boolean
  preferredModelId: string
  compatibleModelIds: string[]
  hue: number
  description: string
}

export const STYLE_CATEGORIES = [
  '全部',
  '推荐',
  '摄影写真',
  '电商营销',
  '动漫游戏',
  '风格插画',
  '平面设计',
  '建筑及室内设计',
  '创意玩法',
  '文创周边',
  '小说推文',
] as const

export const STYLE_PRESETS: StylePreset[] = [
  { id: 'style-cine-teal', name: '电影青橙', category: '推荐', author: 'Lib 官方', commercial: true, preferredModelId: 'lib-image-2', compatibleModelIds: ['lib-navo-pro', 'lib-navo-2'], hue: 190, description: '青橙对比的电影调色，暗部偏青、肤色偏暖。' },
  { id: 'style-ink-wash', name: '水墨写意', category: '风格插画', author: 'Lib 官方', commercial: true, preferredModelId: 'lib-navo-pro', compatibleModelIds: ['lib-image-2'], hue: 210, description: '留白与飞白笔触，墨色浓淡分明。' },
  { id: 'style-anime-cel', name: '赛璐璐动画', category: '动漫游戏', author: '社区', commercial: false, preferredModelId: 'midjourney-niji-7', compatibleModelIds: ['seedream-5-pro'], hue: 340, description: '硬边阴影与高饱和色块的传统动画质感。' },
  { id: 'style-concept-matte', name: '概念绘景', category: '动漫游戏', author: '社区', commercial: true, preferredModelId: 'lib-navo-pro', compatibleModelIds: ['lib-image-2', 'midjourney-v8-1'], hue: 30, description: '大气透视与体积光的场景概念图。' },
  { id: 'style-film-grain', name: '胶片颗粒', category: '摄影写真', author: 'Lib 官方', commercial: true, preferredModelId: 'lib-image-2', compatibleModelIds: ['seedream-5-pro'], hue: 45, description: '细腻颗粒与轻微暗角的胶片观感。' },
  { id: 'style-retro-print', name: '复古海报', category: '平面设计', author: '社区', commercial: false, preferredModelId: 'seedream-5-pro', compatibleModelIds: ['lib-image-2'], hue: 15, description: '有限套色与网点印刷质感。' },
  { id: 'style-soft-portrait', name: '柔光人像', category: '摄影写真', author: 'Lib 官方', commercial: true, preferredModelId: 'lib-navo-pro', compatibleModelIds: ['lib-image-2'], hue: 350, description: '大光比柔化，肤质通透。' },
  { id: 'style-isometric', name: '等距微缩', category: '建筑及室内设计', author: '社区', commercial: true, preferredModelId: 'lib-image-2', compatibleModelIds: ['seedream-5-pro'], hue: 265, description: '等距视角的微缩场景与干净配色。' },
  { id: 'style-noir', name: '黑色电影', category: '创意玩法', author: 'Lib 官方', commercial: true, preferredModelId: 'lib-navo-pro', compatibleModelIds: ['midjourney-v8-1'], hue: 220, description: '强对比硬光、百叶窗投影与高反差黑白。' },
]

export interface EffectPreset {
  id: string
  name: string
  category: string
  author: string
  commercial: boolean
  usageCount: number
  modelIds: string[]
  hue: number
  description: string
}

export const EFFECT_CATEGORIES = ['全部', '人物', '转场', '氛围', '解构', '趣味'] as const

export const EFFECT_PRESETS: EffectPreset[] = [
  { id: 'fx-hair-blow', name: '发丝飘动', category: '人物', author: 'Lib 官方', commercial: true, usageCount: 128_400, modelIds: ['kling-o1', 'seedance-2'], hue: 200, description: '风吹发丝与衣角的自然摆动。' },
  { id: 'fx-dissolve-particles', name: '粒子消散', category: '解构', author: '社区', commercial: true, usageCount: 96_200, modelIds: ['kling-o1'], hue: 280, description: '主体沿边缘化为粒子随风消散。' },
  { id: 'fx-time-freeze', name: '时间静止', category: '氛围', author: 'Lib 官方', commercial: true, usageCount: 74_900, modelIds: ['seedance-2', 'veo-3'], hue: 190, description: '环境静止，仅主体保持运动。' },
  { id: 'fx-zoom-punch', name: '冲击变焦', category: '转场', author: '社区', commercial: false, usageCount: 61_300, modelIds: ['kling-o1', 'hailuo-2'], hue: 10, description: '快速推拉配合运动模糊的硬切转场。' },
  { id: 'fx-rain-window', name: '雨窗氛围', category: '氛围', author: 'Lib 官方', commercial: true, usageCount: 58_100, modelIds: ['seedance-2'], hue: 210, description: '玻璃上的雨痕与背景散焦灯光。' },
  { id: 'fx-clone-split', name: '分身裂变', category: '趣味', author: '社区', commercial: false, usageCount: 44_700, modelIds: ['kling-o1'], hue: 300, description: '主体分裂为多个同步动作的分身。' },
  { id: 'fx-liquid-morph', name: '液态变形', category: '解构', author: '社区', commercial: true, usageCount: 39_500, modelIds: ['veo-3', 'kling-o1'], hue: 170, description: '主体表面液化并重塑为新形态。' },
  { id: 'fx-light-sweep', name: '光带扫过', category: '氛围', author: 'Lib 官方', commercial: true, usageCount: 35_800, modelIds: ['seedance-2', 'hailuo-2'], hue: 50, description: '带方向的体积光扫过画面。' },
]

export interface CameraMovePreset {
  id: string
  name: string
  group: string
  prompt: string
  /** Local deterministic preview direction; never points at account media. */
  hue: number
  previewVariant: string
}

export const CAMERA_MOVES: CameraMovePreset[] = [
  { id: 'cam-static', name: '固定镜头', group: '基础', prompt: '固定镜头，机位与焦距保持稳定。', hue: 216, previewVariant: 'static' },
  { id: 'cam-follow', name: '跟随拍摄', group: '基础', prompt: '镜头跟随主体移动，保持主体在画面同一位置。', hue: 226, previewVariant: 'follow' },
  { id: 'cam-orbit-rise', name: '盘旋抬升', group: '环绕', prompt: '镜头围绕主体盘旋并平滑抬升。', hue: 248, previewVariant: 'orbit-rise' },
  { id: 'cam-orbit-fall', name: '盘旋下降', group: '环绕', prompt: '镜头围绕主体盘旋并平滑下降。', hue: 262, previewVariant: 'orbit-fall' },
  { id: 'cam-tilt-up', name: '镜头上摇', group: '摇摄', prompt: '机位不动，镜头由下向上摇摄。', hue: 286, previewVariant: 'tilt-up' },
  { id: 'cam-tilt-down', name: '镜头下摇', group: '摇摄', prompt: '机位不动，镜头由上向下摇摄。', hue: 300, previewVariant: 'tilt-down' },
  { id: 'cam-pan-left', name: '镜头左摇', group: '摇摄', prompt: '机位不动，镜头向左摇摄。', hue: 322, previewVariant: 'pan-left' },
  { id: 'cam-pan-right', name: '镜头右摇', group: '摇摄', prompt: '机位不动，镜头向右摇摄。', hue: 338, previewVariant: 'pan-right' },
  { id: 'cam-rise', name: '镜头上升', group: '升降', prompt: '机位垂直上升，平稳扩大俯瞰范围。', hue: 356, previewVariant: 'rise' },
  { id: 'cam-fall', name: '镜头下降', group: '升降', prompt: '机位垂直下降，逐步贴近主体。', hue: 12, previewVariant: 'fall' },
  { id: 'cam-truck-left', name: '镜头左移', group: '横移', prompt: '镜头平行于主体向左移动。', hue: 28, previewVariant: 'truck-left' },
  { id: 'cam-truck-right', name: '镜头右移', group: '横移', prompt: '镜头平行于主体向右移动。', hue: 42, previewVariant: 'truck-right' },
  { id: 'cam-push', name: '镜头前推', group: '推拉', prompt: '镜头向主体匀速前推，空间透视自然增强。', hue: 58, previewVariant: 'push' },
  { id: 'cam-pull', name: '镜头后移', group: '推拉', prompt: '镜头从主体匀速后移，逐步揭示环境。', hue: 74, previewVariant: 'pull' },
  { id: 'cam-zoom-in', name: '变焦推进', group: '变焦', prompt: '机位不动，焦距变长并向主体推进。', hue: 92, previewVariant: 'zoom-in' },
  { id: 'cam-zoom-out', name: '变焦拉远', group: '变焦', prompt: '机位不动，焦距变短并拉远视野。', hue: 112, previewVariant: 'zoom-out' },
  { id: 'cam-dolly-zoom', name: '柯克变焦', group: '变焦', prompt: '机位与焦距反向联动，主体大小稳定而背景透视剧烈变化。', hue: 136, previewVariant: 'dolly-zoom' },
  { id: 'cam-orbit', name: '环绕拍摄', group: '环绕', prompt: '镜头以主体为中心完成平滑环绕拍摄。', hue: 156, previewVariant: 'orbit' },
  { id: 'cam-roll', name: '滚筒旋转', group: '旋转', prompt: '镜头沿光轴连续滚筒旋转。', hue: 174, previewVariant: 'roll' },
  { id: 'cam-fpv', name: '第一视角', group: '视角', prompt: '使用第一视角穿行，视线随动作自然起伏。', hue: 190, previewVariant: 'fpv' },
  { id: 'cam-drone', name: '无人机', group: '航拍', prompt: '无人机机位平滑穿越场景并保持宽阔视野。', hue: 202, previewVariant: 'drone' },
  { id: 'cam-aerial', name: '高空航拍', group: '航拍', prompt: '高空俯瞰航拍，缓慢展示场景整体结构。', hue: 214, previewVariant: 'aerial' },
  { id: 'cam-handheld', name: '手持拍摄', group: '质感', prompt: '使用轻微不规则抖动的手持拍摄质感。', hue: 232, previewVariant: 'handheld' },
]

export interface VoicePreset {
  id: string
  name: string
  language: string
  accent: string
  gender: '男' | '女' | '中性' | 'Character'
  age: '儿童' | '青年' | '成年' | '老年'
  tags: string[]
}

const VOICE_SEED: [
  id: string,
  name: string,
  language: string,
  accent: string,
  gender: VoicePreset['gender'],
  age: VoicePreset['age'],
  tags: string[],
][] = [
  ['voice-young-green', '青涩青年音色', '中文', '普通话', '男', '青年', ['自然', '青年']],
  ['voice-young-elite', '精英青年音色', '中文', '普通话', '男', '青年', ['沉稳', '商务']],
  ['voice-young-dominant', '霸道青年音色', '中文', '普通话', '男', '青年', ['强势', '剧情']],
  ['voice-college-student', '青年大学生音色', '中文', '普通话', '男', '青年', ['校园', '自然']],
  ['voice-girl', '少女音色', '中文', '普通话', '女', '青年', ['清亮', '默认']],
  ['voice-queen', '御姐音色', '中文', '普通话', '女', '成年', ['成熟', '剧情']],
  ['voice-mature-woman', '成熟女性音色', '中文', '普通话', '女', '成年', ['沉稳', '旁白']],
  ['voice-sweet-woman', '甜美女性音色', '中文', '普通话', '女', '青年', ['甜美', '广告']],
  ['voice-young-green-beta', '青涩青年音色-beta', '中文', '普通话', '男', '青年', ['beta', '自然']],
  ['voice-young-elite-beta', '精英青年音色-beta', '中文', '普通话', '男', '青年', ['beta', '商务']],
  ['voice-young-dominant-beta', '霸道青年音色-beta', '中文', '普通话', '男', '青年', ['beta', '剧情']],
  ['voice-college-student-beta', '青年大学生音色-beta', '中文', '普通话', '男', '青年', ['beta', '校园']],
  ['voice-girl-beta', '少女音色-beta', '中文', '普通话', '女', '青年', ['beta', '清亮']],
  ['voice-queen-beta', '御姐音色-beta', '中文', '普通话', '女', '成年', ['beta', '成熟']],
  ['voice-mature-woman-beta', '成熟女性音色-beta', '中文', '普通话', '女', '成年', ['beta', '旁白']],
  ['voice-sweet-woman-beta', '甜美女性音色-beta', '中文', '普通话', '女', '青年', ['beta', '甜美']],
  ['voice-smart-boy', '聪明男童', '中文', '普通话', '男', '儿童', ['儿童', '聪明']],
  ['voice-cute-boy', '可爱男童', '中文', '普通话', '男', '儿童', ['儿童', '可爱']],
  ['voice-cute-girl', '萌萌女童', '中文', '普通话', '女', '儿童', ['儿童', '可爱']],
  ['voice-cartoon-pig', '卡通猪小琪', '中文', '普通话', 'Character', '儿童', ['角色', '卡通']],
]

export const VOICES: VoicePreset[] = VOICE_SEED.map(([id, name, language, accent, gender, age, tags]) => ({
  id,
  name,
  language,
  accent,
  gender,
  age,
  tags,
}))

export const VOICE_CATALOG_TOTAL = 327
export const VOICE_PAGE_SIZE = 20

/**
 * Deterministic local rows behind pages 2–17. Page one stays byte-for-byte
 * aligned with the currently observed catalogue; the remaining names are
 * explicit fixtures rather than copied account audio.
 */
export function voiceCatalogFixtures(): VoicePreset[] {
  const languages = [
    ['中文', '普通话'],
    ['英文', '美式'],
    ['英文', '英式'],
    ['日文', '标准'],
    ['韩文', '标准'],
  ] as const
  const genders = ['男', '女', '中性', 'Character'] as const
  const ages = ['青年', '成年', '儿童', '老年'] as const
  const generated = Array.from({ length: VOICE_CATALOG_TOTAL - VOICES.length }, (_, index): VoicePreset => {
    const ordinal = index + VOICES.length + 1
    const [language, accent] = languages[index % languages.length]
    const gender = genders[index % genders.length]
    const age = ages[index % ages.length]
    return {
      id: `voice-fixture-${String(ordinal).padStart(3, '0')}`,
      name: `本地演示音色 ${String(ordinal).padStart(3, '0')}`,
      language,
      accent,
      gender,
      age,
      tags: ['本地样本', language, age],
    }
  })
  return [...VOICES.map((voice) => ({ ...voice, tags: [...voice.tags] })), ...generated]
}

/** Non-verbal cues insertable into a TTS script. */
export const PARALINGUISTIC_CUES = [
  '笑声', '轻笑', '咳嗽', '清嗓子', '正常换气', '喘气', '吸气', '呼气', '倒吸气', '吸鼻子',
  '叹气', '喷鼻息', '打嗝', '咂嘴', '哼唱', '嘶嘶声', '嗯', '口哨', '喷嚏', '抽泣', '鼓掌',
] as const

export const PAUSE_PRESETS = [0.25, 0.5, 1, 1.5] as const

export interface CharacterPreset {
  id: string
  name: string
  tags: string[]
  gender: string
  age: string
  ethnicity: string
  era: string
  culture: string
  build: string
  hair: string
  /** Each character applies as four independent reference image nodes. */
  references: { key: string; label: string; hue: number }[]
}

const CHARACTER_REFERENCE_SET = [
  { key: 'three-view', label: '三视图', hue: 205 },
  { key: 'expression', label: '表情参考', hue: 340 },
  { key: 'face-closeup', label: '脸部近景', hue: 25 },
  { key: 'full-body', label: '角色立绘', hue: 265 },
]

export const CHARACTER_PRESETS: CharacterPreset[] = [
  { id: 'char-fresh-girl', name: '清新少女', tags: ['现代', '校园'], gender: '女', age: '青年', ethnicity: '东亚', era: '现代', culture: '东亚', build: '纤细', hair: '黑色', references: CHARACTER_REFERENCE_SET },
  { id: 'char-city-detective', name: '都市侦探', tags: ['悬疑', '风衣'], gender: '男', age: '成年', ethnicity: '欧美', era: '近代', culture: '欧美', build: '标准', hair: '棕色', references: CHARACTER_REFERENCE_SET },
  { id: 'char-wuxia-swordsman', name: '江湖剑客', tags: ['武侠', '古装'], gender: '男', age: '青年', ethnicity: '东亚', era: '古代', culture: '东亚', build: '精瘦', hair: '黑色', references: CHARACTER_REFERENCE_SET },
  { id: 'char-space-engineer', name: '太空工程师', tags: ['科幻', '制服'], gender: '女', age: '成年', ethnicity: '混血', era: '未来', culture: '泛全球', build: '健硕', hair: '银色', references: CHARACTER_REFERENCE_SET },
  { id: 'char-village-elder', name: '村中长者', tags: ['乡土', '写实'], gender: '男', age: '老年', ethnicity: '东亚', era: '近代', culture: '东亚', build: '偏瘦', hair: '灰白', references: CHARACTER_REFERENCE_SET },
  { id: 'char-idol-dancer', name: '舞台偶像', tags: ['演出', '华丽'], gender: '女', age: '青年', ethnicity: '东亚', era: '现代', culture: '东亚', build: '标准', hair: '粉色', references: CHARACTER_REFERENCE_SET },
]

export const CHARACTER_FILTERS = {
  性别: ['全部', '男', '女', '中性'],
  年龄: ['全部', '儿童', '青年', '成年', '老年'],
  种族: ['全部', '东亚', '南亚', '欧美', '非洲', '混血'],
  时代: ['全部', '古代', '近代', '现代', '未来'],
  文化区域: ['全部', '东亚', '南亚', '欧美', '中东', '泛全球'],
  体型: ['全部', '纤细', '精瘦', '标准', '健硕', '偏瘦', '丰满'],
  发色: ['全部', '黑色', '棕色', '金色', '银色', '粉色', '灰白'],
} as const

/* ------------------------------------------------------------------ *
 * Slash / narrative presets
 * ------------------------------------------------------------------ */

export interface SlashPreset {
  id: string
  name: string
  /** Resolution and count the preset forces on the pending node. */
  output: {
    resolution: '1K' | '2K' | '4K'
    quality: 'standard' | 'high'
    count: 1 | 2 | 4
    aspectRatio: '21:9' | '9:21' | '16:9' | '9:16' | '5:4' | '4:5' | '4:3' | '3:4' | '3:2' | '2:3' | '2:1' | '1:2' | '1:1'
  }
  promptTemplate: string
  summary: string
}

export const SLASH_PRESETS: SlashPreset[] = [
  {
    id: 'slash-multicam-9',
    name: '多机位九宫格',
    output: { resolution: '4K', quality: 'high', count: 1, aspectRatio: '16:9' },
    promptTemplate: '在保持主体、服装与场景完全一致的前提下，输出九宫格：九种不同机位与景别的同一瞬间。',
    summary: '同一瞬间的九种机位覆盖，用于挑选最终镜头。',
  },
  {
    id: 'slash-story-4',
    name: '剧情推演四宫格',
    output: { resolution: '2K', quality: 'high', count: 1, aspectRatio: '16:9' },
    promptTemplate: '基于当前画面向后推演四个连续剧情瞬间，按四宫格从左上到右下排列，保持角色与光线连贯。',
    summary: '把一张静帧推演为四格连续剧情。',
  },
  {
    id: 'slash-coherent-25',
    name: '25 宫格连贯分镜',
    output: { resolution: '4K', quality: 'high', count: 1, aspectRatio: '16:9' },
    promptTemplate: '输出 5×5 共 25 格连贯分镜，覆盖完整段落的起承转合，保持角色一致与镜头衔接。',
    summary: '一次生成整段落的连贯分镜网格。',
  },
  {
    id: 'slash-relight',
    name: '电影级光影矫正',
    output: { resolution: '2K', quality: 'high', count: 1, aspectRatio: '16:9' },
    promptTemplate: '保持构图与主体不变，重建为电影级布光：明确主光方向、轮廓光与环境反射，提升层次。',
    summary: '不改构图，只重建布光。',
  },
  {
    id: 'slash-three-view',
    name: '角色三视图',
    output: { resolution: '2K', quality: 'high', count: 1, aspectRatio: '16:9' },
    promptTemplate: '输出同一角色的正面、四分之三侧面与背面三视图，纯色背景，服装配饰一致。',
    summary: '把角色图扩展为可复用的三视图。',
  },
  {
    id: 'slash-progress-after',
    name: '画面推演 3 秒后',
    output: { resolution: '2K', quality: 'standard', count: 1, aspectRatio: '16:9' },
    promptTemplate: '推演当前画面 3 秒之后的瞬间，保持机位与光线连续，只改变主体动作与位置。',
    summary: '沿时间轴向后推一步。',
  },
  {
    id: 'slash-progress-before',
    name: '画面推演 5 秒前',
    output: { resolution: '2K', quality: 'standard', count: 1, aspectRatio: '16:9' },
    promptTemplate: '推演当前画面 5 秒之前的瞬间，保持机位与光线连续，只改变主体动作与位置。',
    summary: '沿时间轴向前推一步。',
  },
  {
    id: 'slash-character-sheet',
    name: '角色设定图',
    output: { resolution: '2K', quality: 'high', count: 1, aspectRatio: '16:9' },
    promptTemplate: '输出角色设定图：全身立绘、头部特写、服装细节与配饰分解，统一底色与标注留白。',
    summary: '一张可交付的角色设定页。',
  },
  {
    id: 'slash-portrait-quality',
    name: '人像质感调节',
    output: { resolution: '2K', quality: 'standard', count: 1, aspectRatio: '16:9' },
    promptTemplate: '保持身份特征不变，优化肤质通透度、发丝细节与眼神光，不改变五官比例。',
    summary: '只提质感，不改人。',
  },
  {
    id: 'slash-emotion',
    name: '情绪调节',
    output: { resolution: '2K', quality: 'standard', count: 1, aspectRatio: '16:9' },
    promptTemplate: '在四向情绪坐标（激动/平静、亲近/疏离）上重新定位人物表情，保持身份与构图。',
    summary: '先识别人物，再按四向坐标定位情绪。',
  },
]

export type ImagePresetCategory = '分镜叙事' | '质感调节' | '空间与机位' | '设定图'

export interface ImageAuthoringPreset extends SlashPreset {
  category: ImagePresetCategory
}

function imagePreset(
  id: string,
  name: string,
  category: ImagePresetCategory,
  summary: string,
  promptTemplate: string,
  output: SlashPreset['output'] = {
    resolution: '2K',
    quality: 'high',
    count: 1,
    aspectRatio: '16:9',
  },
): ImageAuthoringPreset {
  return { id, name, category, summary, promptTemplate, output }
}

/** Current Image composer preset directory, frozen in visible group order. */
export const IMAGE_AUTHORING_PRESETS: ImageAuthoringPreset[] = [
  imagePreset('image-schedule-storyboard', '调度故事板', '分镜叙事', '生成带有运动轨迹等调度草图分镜', '把当前内容拆为调度故事板，标出人物站位、运动轨迹、机位与镜头衔接。'),
  imagePreset('image-storyboard', '故事板', '分镜叙事', '生成完整剧情片段', '把当前内容拆为一组完整剧情分镜，保持角色、场景、光线和叙事连续。'),
  imagePreset('slash-coherent-25', '25宫格连贯分镜', '分镜叙事', '生成连续分镜长图', '输出 5×5 共 25 格连贯分镜，覆盖完整段落的起承转合，保持角色一致与镜头衔接。', { resolution: '4K', quality: 'high', count: 1, aspectRatio: '16:9' }),
  imagePreset('slash-story-4', '剧情推演四宫格', '分镜叙事', '生成四格剧情推演', '基于当前画面向后推演四个连续剧情瞬间，按四宫格排列，保持角色与光线连贯。'),
  imagePreset('slash-progress-after', '画面推演 - 3秒后', '分镜叙事', '推演画面后续动作', '推演当前画面 3 秒之后的瞬间，保持机位与光线连续，只改变主体动作与位置。', { resolution: '2K', quality: 'standard', count: 1, aspectRatio: '16:9' }),
  imagePreset('slash-progress-before', '画面推演 - 5秒前', '分镜叙事', '还原画面前置状态', '推演当前画面 5 秒之前的瞬间，保持机位与光线连续，只改变主体动作与位置。', { resolution: '2K', quality: 'standard', count: 1, aspectRatio: '16:9' }),
  imagePreset('slash-portrait-quality', '人像质感调节', '质感调节', '降低 AI 感，优化人物质感与光影', '保持身份特征不变，优化肤质通透度、发丝细节与眼神光，不改变五官比例。', { resolution: '2K', quality: 'standard', count: 1, aspectRatio: '16:9' }),
  imagePreset('slash-relight', '电影级光影校正', '质感调节', '调整画面光影质感', '保持构图与主体不变，重建为电影级布光：明确主光方向、轮廓光与环境反射，提升层次。'),
  imagePreset('image-panorama-720', '720全景', '空间与机位', '生成全景场景图', '扩展当前场景为无缝 720 全景图，保持空间结构、材质与光线连续。', { resolution: '4K', quality: 'high', count: 1, aspectRatio: '2:1' }),
  imagePreset('slash-multicam-9', '多机位九宫格', '空间与机位', '生成多视角机位图', '在保持主体、服装与场景完全一致的前提下，输出九宫格：九种不同机位与景别的同一瞬间。', { resolution: '4K', quality: 'high', count: 1, aspectRatio: '16:9' }),
  imagePreset('image-face-three-view', '角色脸部三视图', '设定图', '基于一张参考图生成脸部细节三视图', '输出角色脸部正面、四分之三侧面和侧面细节，身份特征、妆容与光线一致。'),
  imagePreset('slash-character-sheet', '角色设定图', '设定图', '角色主视觉与设定拆解', '输出角色设定图：全身立绘、头部特写、服装细节与配饰分解，统一底色与标注留白。'),
  imagePreset('slash-three-view', '角色三视图', '设定图', '正侧背视图与脸部特写', '输出同一角色的正面、侧面与背面三视图，并补充脸部特写，服装配饰一致。'),
  imagePreset('image-scene-sheet', '场景设定图', '设定图', '场景主视觉与设定拆解', '输出场景主视觉、平面关系、关键材质、光线状态与局部细节设定图。'),
  imagePreset('image-product-sheet', '产品设定图', '设定图', '产品主视觉与设定拆解', '输出产品主视觉、正侧背视图、结构细节与材质说明设定图。'),
]

/** 情绪调节 default label at the coordinate origin. */
export const EMOTION_DEFAULT_LABEL = '淡然自若'

export function emotionLabel(x: number, y: number): string {
  // x: 疏离(-1) → 亲近(1); y: 平静(-1) → 激动(1)
  if (Math.abs(x) < 0.25 && Math.abs(y) < 0.25) return EMOTION_DEFAULT_LABEL
  if (y >= 0.25 && x >= 0.25) return '热情洋溢'
  if (y >= 0.25 && x <= -0.25) return '愤然抗拒'
  if (y >= 0.25) return '情绪高涨'
  if (y <= -0.25 && x >= 0.25) return '温和亲切'
  if (y <= -0.25 && x <= -0.25) return '冷淡疏远'
  if (y <= -0.25) return '沉静内敛'
  return x > 0 ? '略显亲近' : '略显疏离'
}

/** 景别 options for the script v2 shot table. */
export const SHOT_SIZES = [
  '大远景', '远景', '全景', '中全景', '中景', '中近景', '近景', '特写', '大特写',
  '头肩', '半身', '全身',
] as const

export const IMAGE_TOOL_ACTIONS = [
  { id: 'portrait', label: '人像质感' },
  { id: 'panorama', label: '全景' },
  { id: 'multi-angle', label: '多角度' },
  { id: 'lighting', label: '打光' },
  { id: 'nine-grid', label: '九宫格' },
] as const

export const MULTI_ANGLE_PRESETS = ['鱼眼', '倾斜', '俯拍', '仰拍', '背面', '正面', '侧面'] as const

export const CROP_ASPECTS = ['原图', '1:1', '4:3', '3:4', '16:9', '9:16'] as const

export const TRANSITIONS = [
  { id: 'fade', label: '淡入淡出' },
  { id: 'to-black', label: '黑场' },
  { id: 'to-white', label: '白场' },
] as const
