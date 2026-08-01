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

export const STYLE_CATEGORIES = ['全部', '写实', '插画', '动画', '概念设计', '摄影', '复古'] as const

export const STYLE_PRESETS: StylePreset[] = [
  { id: 'style-cine-teal', name: '电影青橙', category: '写实', author: 'Lib 官方', commercial: true, preferredModelId: 'lib-image-2', compatibleModelIds: ['lib-image-ultra', 'flux-kontext'], hue: 190, description: '青橙对比的电影调色，暗部偏青、肤色偏暖。' },
  { id: 'style-ink-wash', name: '水墨写意', category: '插画', author: 'Lib 官方', commercial: true, preferredModelId: 'lib-image-ultra', compatibleModelIds: ['lib-image-2'], hue: 210, description: '留白与飞白笔触，墨色浓淡分明。' },
  { id: 'style-anime-cel', name: '赛璐璐动画', category: '动画', author: '社区', commercial: false, preferredModelId: 'lib-image-2', compatibleModelIds: ['seedream-4'], hue: 340, description: '硬边阴影与高饱和色块的传统动画质感。' },
  { id: 'style-concept-matte', name: '概念绘景', category: '概念设计', author: '社区', commercial: true, preferredModelId: 'lib-image-ultra', compatibleModelIds: ['lib-image-2', 'flux-kontext'], hue: 30, description: '大气透视与体积光的场景概念图。' },
  { id: 'style-film-grain', name: '胶片颗粒', category: '摄影', author: 'Lib 官方', commercial: true, preferredModelId: 'lib-image-2', compatibleModelIds: ['seedream-4'], hue: 45, description: '细腻颗粒与轻微暗角的胶片观感。' },
  { id: 'style-retro-print', name: '复古海报', category: '复古', author: '社区', commercial: false, preferredModelId: 'seedream-4', compatibleModelIds: ['lib-image-2'], hue: 15, description: '有限套色与网点印刷质感。' },
  { id: 'style-soft-portrait', name: '柔光人像', category: '摄影', author: 'Lib 官方', commercial: true, preferredModelId: 'lib-image-ultra', compatibleModelIds: ['lib-image-2'], hue: 350, description: '大光比柔化，肤质通透。' },
  { id: 'style-isometric', name: '等距微缩', category: '插画', author: '社区', commercial: true, preferredModelId: 'lib-image-2', compatibleModelIds: ['seedream-4'], hue: 265, description: '等距视角的微缩场景与干净配色。' },
  { id: 'style-noir', name: '黑色电影', category: '写实', author: 'Lib 官方', commercial: true, preferredModelId: 'lib-image-ultra', compatibleModelIds: ['flux-kontext'], hue: 220, description: '强对比硬光、百叶窗投影与高反差黑白。' },
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
}

export const CAMERA_MOVES: CameraMovePreset[] = [
  { id: 'cam-static', name: '固定', group: '固定', prompt: '机位固定，画面无位移。' },
  { id: 'cam-follow', name: '跟随', group: '跟随', prompt: '镜头跟随主体移动，保持主体在画面同一位置。' },
  { id: 'cam-orbit-l', name: '左环绕', group: '环绕', prompt: '镜头绕主体向左环绕。' },
  { id: 'cam-orbit-r', name: '右环绕', group: '环绕', prompt: '镜头绕主体向右环绕。' },
  { id: 'cam-push', name: '推', group: '推拉摇移', prompt: '镜头向主体匀速推近。' },
  { id: 'cam-pull', name: '拉', group: '推拉摇移', prompt: '镜头从主体匀速拉远。' },
  { id: 'cam-pan-l', name: '左摇', group: '推拉摇移', prompt: '机位不动，镜头向左摇。' },
  { id: 'cam-pan-r', name: '右摇', group: '推拉摇移', prompt: '机位不动，镜头向右摇。' },
  { id: 'cam-tilt-u', name: '上摇', group: '推拉摇移', prompt: '机位不动，镜头向上摇。' },
  { id: 'cam-tilt-d', name: '下摇', group: '推拉摇移', prompt: '机位不动，镜头向下摇。' },
  { id: 'cam-truck', name: '横移', group: '推拉摇移', prompt: '机位平行于主体横向移动。' },
  { id: 'cam-zoom-in', name: '变焦推近', group: '变焦', prompt: '机位不动，焦距变长压缩空间。' },
  { id: 'cam-zoom-out', name: '变焦拉远', group: '变焦', prompt: '机位不动，焦距变短扩展视野。' },
  { id: 'cam-dolly-zoom', name: '滑动变焦', group: '变焦', prompt: '机位前推同时焦距变短，主体大小不变而背景透视改变。' },
  { id: 'cam-handheld', name: '手持', group: '手持', prompt: '轻微不规则抖动的手持质感。' },
  { id: 'cam-drone-rise', name: '无人机升起', group: '无人机', prompt: '镜头自低处垂直升起并逐渐俯视。' },
  { id: 'cam-drone-flyover', name: '无人机掠过', group: '无人机', prompt: '镜头高速掠过场景上方。' },
  { id: 'cam-fpv', name: '第一人称', group: '第一人称', prompt: '第一人称视角穿行，视线随动作起伏。' },
]

export interface VoicePreset {
  id: string
  name: string
  language: string
  accent: string
  gender: '男' | '女' | '中性'
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
  ['voice-cn-female-warm', '温暖女声', '中文', '普通话', '女', '成年', ['旁白', '广告']],
  ['voice-cn-male-deep', '低沉男声', '中文', '普通话', '男', '成年', ['纪录片']],
  ['voice-cn-female-young', '清亮少女', '中文', '普通话', '女', '青年', ['动画']],
  ['voice-cn-male-young', '阳光少年', '中文', '普通话', '男', '青年', ['动画']],
  ['voice-cn-child', '童声', '中文', '普通话', '中性', '儿童', ['动画']],
  ['voice-cn-elder', '长者旁白', '中文', '普通话', '男', '老年', ['纪录片']],
  ['voice-yue-female', '粤语女声', '中文', '粤语', '女', '成年', ['本地化']],
  ['voice-en-female-news', 'English Anchor', '英文', '美式', '女', '成年', ['新闻']],
  ['voice-en-male-narr', 'English Narrator', '英文', '英式', '男', '成年', ['纪录片']],
  ['voice-jp-female', '日本語ナレーション', '日文', '标准', '女', '成年', ['旁白']],
  ['voice-ko-male', '한국어 내레이션', '韩文', '标准', '男', '青年', ['旁白']],
  ['voice-cn-female-soft', '轻柔女声', '中文', '普通话', '女', '成年', ['助眠', '广告']],
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

/** Non-verbal cues insertable into a TTS script. */
export const PARALINGUISTIC_CUES = [
  '笑声', '轻笑', '大笑', '咳嗽', '清嗓', '换气', '喘气', '吸气', '呼气', '叹气',
  '打嗝', '咂嘴', '哼唱', '口哨', '喷嚏', '抽泣', '鼓掌', '吞咽', '打哈欠', '低语', '尖叫',
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
  output: { resolution: '1K' | '2K' | '4K'; quality: 'standard' | 'high'; count: 1 | 2 | 4; aspectRatio: '16:9' | '1:1' | '9:16' }
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
