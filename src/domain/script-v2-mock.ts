import { createNode } from './factory'
import { DEFAULT_MODEL } from './models'
import {
  SCRIPT_V2_RECOMPUTE_MAX_SHOTS,
  appendScriptV2Row,
  defaultScriptV2State,
  ScriptV2DomainError,
  type ScriptV2Asset,
  type ScriptV2AssetGenerationSettings,
  type ScriptV2Assets,
  type ScriptV2CharacterRef,
  type ScriptV2GenerateResult,
  type ScriptV2RecognizeAssetsResult,
  type ScriptV2RecomputeResult,
  type ScriptV2Row,
  type ScriptV2State,
} from './script-v2'
import type {
  CanvasMutation,
  WorkflowDocument,
  WorkflowEdge,
  WorkflowGroup,
  WorkflowNode,
} from './types'

const SCRIPT_V2_FIXTURE_TIMESTAMP = '2026-09-04T00:00:00.000Z'
const IMAGE_PROMPT_MIN = 200
const IMAGE_PROMPT_MAX = 400
const VIDEO_PROMPT_MIN = 350

export interface GenerateMockScriptV2Input {
  storyText: string
  idempotencySeed: string
  entry: 'screenplay' | 'character'
  character?: {
    name: string
    description: string
    premise: string
  }
}

export interface RecognizeMockScriptV2AssetsInput {
  storyText: string
  idempotencySeed: string
  character?: GenerateMockScriptV2Input['character']
}

export interface RecomputeMockScriptV2PromptsInput {
  state: ScriptV2State
  rowIds: string[]
}

export interface GenerateMockScriptV2AssetInput {
  asset: ScriptV2Asset
  settings: ScriptV2AssetGenerationSettings
}

export interface ScriptV2GenerateAssetResult {
  operation: 'generate-asset'
  asset: ScriptV2Asset
}

export type ScriptV2BatchKind = 'image' | 'video'

export interface ScriptV2BatchBuildResult {
  mutations: CanvasMutation[]
  createdNodeIds: string[]
  groupId: string | null
  blockedReason: string | null
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function stableId(prefix: string, ...parts: string[]): string {
  return `${prefix}_${fnv1a(parts.join(':'))}`
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function removeMentionMarkers(value: string): string {
  return value.replace(/[@＠](?=[^\s@＠，。！？、；：,.!?;:])/gu, '')
}

function bounded(value: string, max: number): string {
  const characters = [...value]
  if (characters.length <= max) return value
  return `${characters.slice(0, Math.max(0, max - 1)).join('')}…`
}

function mentionNames(storyText: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  const expression = /[@＠]([^\s@＠，。！？、；：,.!?;:]{1,40})/gu
  for (const match of storyText.matchAll(expression)) {
    const name = normalizeText(match[1] ?? '')
    if (!name || seen.has(name)) continue
    seen.add(name)
    result.push(name)
  }
  return result
}

function characterAsset(
  name: string,
  index: number,
  input: RecognizeMockScriptV2AssetsInput,
): ScriptV2Asset {
  const supplied = input.character?.name === name ? input.character : undefined
  return {
    id: stableId('asset', input.idempotencySeed, 'character', name, String(index)),
    role: 'character',
    name,
    description: bounded(
      normalizeText(supplied?.description ?? '') || `${name}，故事中首次出现的角色`,
      20_000,
    ),
    source: 'ai',
    status: 'pending',
    createdAt: SCRIPT_V2_FIXTURE_TIMESTAMP,
    updatedAt: SCRIPT_V2_FIXTURE_TIMESTAMP,
  }
}

export function recognizeMockScriptV2Assets(
  input: RecognizeMockScriptV2AssetsInput,
): ScriptV2RecognizeAssetsResult {
  const names = mentionNames(input.storyText)
  const suppliedName = normalizeText(input.character?.name ?? '')
  if (suppliedName && !names.includes(suppliedName)) names.unshift(suppliedName)
  return {
    operation: 'recognize-assets-only',
    assets: {
      characters: names.map((name, index) => characterAsset(name, index, input)),
      scenes: [],
      props: [],
    },
  }
}

function entityRefsFor(rowText: string, assets: ScriptV2Assets) {
  return assets.characters
    .filter((asset) => asset.name && rowText.includes(asset.name))
    .map((asset) => ({ text: asset.name, assetId: asset.id }))
}

function characterRefs(assets: ScriptV2Assets): ScriptV2CharacterRef[] {
  return assets.characters.map((asset) => ({
    characterName: asset.name,
    characterAssetId: asset.id,
    characterDescription: asset.description,
    characterImageUrl: asset.thumbnailUrl ?? '',
  }))
}

function linkedAssetSummary(row: ScriptV2Row, assets: ScriptV2Assets): string {
  const all = [...assets.characters, ...assets.scenes, ...assets.props]
  const ids = new Set([
    ...row.characters.map((character) => character.characterAssetId),
    ...row.sceneAssetIds,
    ...row.propAssetIds,
  ])
  const linked = all
    .filter((asset) => ids.has(asset.id))
    .map((asset) => `${asset.name}${asset.description ? `（${bounded(asset.description, 36)}）` : ''}`)
  return linked.length ? linked.join('、') : '未绑定具体资产，保持主体身份与外观连续'
}

function imagePromptFor(
  row: ScriptV2Row,
  assets: ScriptV2Assets,
  styleDescription: string | null,
): string {
  const subject = bounded(normalizeText(removeMentionMarkers(row.plotDescription)), 96) || '保持当前镜头叙事'
  const linked = bounded(linkedAssetSummary(row, assets), 96)
  const lighting = bounded(normalizeText(row.lightingAndAtmosphere), 64) || '自然层次光'
  const camera = bounded(normalizeText(row.cinematics?.cameraMovement ?? ''), 32) || '稳定观察'
  const style = bounded(normalizeText(styleDescription ?? ''), 48) || '电影化写实叙事'
  return [
    `画面主题：${subject}。`,
    `人物与动作：${linked}，动作瞬间必须服务当前情节，姿态自然，表情克制，服装、发型与身份特征连续一致。`,
    `镜头与构图：采用${row.shotSize}，${camera}，明确前景、中景和背景层次，主体位于视觉重心，留出合理视线空间，画面边缘没有无关元素。`,
    `环境与光线：${lighting}，主光、辅光和轮廓光方向清楚，阴影过渡自然，环境反射符合空间关系。`,
    `色彩与质感：以情节情绪建立主色和点缀色，控制饱和度，保留皮肤、织物、金属、玻璃与地面材质细节，避免塑料感。`,
    `景深与视觉连续：景深匹配${row.shotSize}，焦点锁定关键人物或道具，空间透视准确，比例稳定，动作方向与相邻镜头一致。`,
    `成像要求：${style}，真实摄影质感，高动态范围，细节清晰，构图完整，无文字水印，无多余肢体。`,
  ].join('')
}

function ensureImagePromptBounds(prompt: string): string {
  let result = prompt
  const supplement = '补充视觉控制：镜头、构图、光线、色彩、质感、景深、环境、人物、动作与材质保持统一。'
  while (result.replace(/\s/g, '').length < IMAGE_PROMPT_MIN) result += supplement
  if (result.replace(/\s/g, '').length <= IMAGE_PROMPT_MAX) return result

  const characters = [...result]
  let count = 0
  let end = 0
  while (end < characters.length && count < IMAGE_PROMPT_MAX - 1) {
    if (!/\s/.test(characters[end])) count += 1
    end += 1
  }
  return `${characters.slice(0, end).join('').replace(/[，。；：,.!?\s]+$/u, '')}。`
}

function videoPromptFor(
  row: ScriptV2Row,
  assets: ScriptV2Assets,
  styleDescription: string | null,
): string {
  const subject = bounded(normalizeText(removeMentionMarkers(row.plotDescription)), 110) || '延续当前镜头情节'
  const linked = bounded(linkedAssetSummary(row, assets), 110)
  const cameraMove = bounded(normalizeText(row.cinematics?.cameraMovement ?? ''), 40) || '缓慢推进'
  const atmosphere = bounded(normalizeText(row.lightingAndAtmosphere), 70) || '光线和环境保持稳定'
  const audio = bounded(normalizeText(row.audioEffects || row.sfx || ''), 48) || '保留自然环境声节奏'
  const style = bounded(normalizeText(styleDescription ?? ''), 48) || '电影化写实叙事'
  let result = [
    `本镜头时长${row.durationSeconds}秒，内容为：${subject}。人物与资产约束：${linked}。`,
    `首先以${row.shotSize}建立空间，镜头${cameraMove}，主体保持可辨识轮廓并沿既定视线轻微移动，呼吸、衣料和细小环境元素同步变化；摄像机运动平滑，不突然跳轴。`,
    `随后镜头继续推进并跟随情节重心，人物先停下确认目标，再自然转身或抬起视线，手部动作按叙事因果连续发生；如果画面没有明确人物，则由关键道具和环境变化承担同等节奏，禁止凭空新增主体。`,
    `与此同时，前景元素缓慢掠过，中景维持主要动作，背景只做低幅度视差和光影变化；${atmosphere}，反射、阴影、雨雾、尘埃或空气透视仅延续输入中已经存在的环境信息。`,
    `然后把运动速度逐步放缓，焦点从空间关系移动到关键人物或道具，保持脸部、服装、材质、比例和方向一致；任何镜头移动、人物动作和物体运动都采用自然缓入缓出，不闪烁、不变形、不穿模。`,
    `最后镜头在情节落点前停下，保留短暂停顿供下一个镜头衔接，构图、轴线、色彩和光线连续。声音节奏：${audio}。整体风格：${style}，帧间稳定，真实运动模糊，动作可读。`,
  ].join('')
  const supplement = '随后主体继续移动，镜头平稳跟随；与此同时环境细节自然变化，最后在视觉重心处停下。'
  while (result.replace(/\s/g, '').length < VIDEO_PROMPT_MIN) result += supplement
  return result
}

function promptsFor(row: ScriptV2Row, assets: ScriptV2Assets, styleDescription: string | null) {
  const refs = entityRefsFor(row.plotDescription, assets)
  return {
    imageGenerationPrompt: ensureImagePromptBounds(imagePromptFor(row, assets, styleDescription)),
    videoMotionPrompt: videoPromptFor(row, assets, styleDescription),
    ...(refs.length ? { finalImagePromptEntityRefs: refs, finalVideoPromptEntityRefs: refs } : {}),
  }
}

function storyTitle(storyText: string): string {
  const firstClause = removeMentionMarkers(storyText).split(/[，。！？,.!?]/u)[0]?.trim() ?? ''
  return bounded(firstClause || '未命名故事', 24)
}

export function generateMockScriptV2(input: GenerateMockScriptV2Input): ScriptV2GenerateResult {
  const storyText = normalizeText(input.storyText)
  const plainStory = bounded(removeMentionMarkers(storyText), 180)
  const recognized = recognizeMockScriptV2Assets({
    storyText,
    idempotencySeed: input.idempotencySeed,
    character: input.character,
  })
  const assets = recognized.assets
  const characters = characterRefs(assets)
  const styleDescription = '电影化写实叙事，克制色彩，连续镜头语言'
  const beats = [
    {
      shotSize: '远景' as const,
      durationSeconds: 6,
      plotDescription: `建立故事环境与人物关系：${plainStory}`,
      cameraMovement: '缓慢横移后停稳',
      lighting: '环境主光建立时间与空间层次',
    },
    {
      shotSize: '中景' as const,
      durationSeconds: 7,
      plotDescription: `人物进入核心行动，推进已给出的事件：${plainStory}`,
      cameraMovement: '平稳跟随主体',
      lighting: '主光保持连续，轮廓光分离人物与背景',
    },
    {
      shotSize: '近景' as const,
      durationSeconds: 8,
      plotDescription: `关键变化发生，强调人物反应与决定：${plainStory}`,
      cameraMovement: '缓慢推近关键反应',
      lighting: '对比略微增强，焦点集中于情节转折',
    },
    {
      shotSize: '全景' as const,
      durationSeconds: 6,
      plotDescription: `收束当前片段并留下连续动作：${plainStory}`,
      cameraMovement: '轻微后撤并稳定结束',
      lighting: '恢复整体空间层次并保留情绪余韵',
    },
  ]

  let state: ScriptV2State = {
    ...defaultScriptV2State(input.idempotencySeed),
    entry: input.entry,
    title: storyTitle(storyText),
    originalStoryText: storyText,
    styleDescription,
    assets,
  }
  for (const beat of beats) {
    const plotDescriptionEntityRefs = entityRefsFor(beat.plotDescription, assets)
    state = appendScriptV2Row(state, {
      durationSeconds: beat.durationSeconds,
      plotDescription: beat.plotDescription,
      ...(plotDescriptionEntityRefs.length ? { plotDescriptionEntityRefs } : {}),
      characters,
      cinematics: {
        shotSize: beat.shotSize,
        cameraMovement: beat.cameraMovement,
        lighting: beat.lighting,
      },
      shotSize: beat.shotSize,
      emotion: input.entry === 'character' ? '角色驱动' : '叙事推进',
      lightingAndAtmosphere: beat.lighting,
      audioEffects: '延续故事环境中的自然声音，不新增未给定声源',
    })
  }
  const rows = state.rows.map((row) => {
    const prompts = promptsFor(row, assets, styleDescription)
    return {
      ...row,
      ...prompts,
      imageToVideoMotionPrompt: prompts.videoMotionPrompt,
      imagePromptState: 'synced' as const,
      videoPromptState: 'synced' as const,
    }
  })
  return {
    operation: 'generate-full',
    title: state.title,
    rows,
    assets,
    styleDescription,
  }
}

export function recomputeMockScriptV2Prompts(
  input: RecomputeMockScriptV2PromptsInput,
): ScriptV2RecomputeResult {
  if (input.rowIds.length > SCRIPT_V2_RECOMPUTE_MAX_SHOTS) {
    throw new ScriptV2DomainError(
      'RECOMPUTE_LIMIT',
      `提示词重算单批最多 ${SCRIPT_V2_RECOMPUTE_MAX_SHOTS} 个镜头`,
    )
  }
  const requested = new Set(input.rowIds)
  const rows = input.state.rows.filter((row) => requested.has(row.id))
  if (!rows.length) {
    throw new ScriptV2DomainError('INVALID_RESULT', '提示词重算至少需要一个有效镜头')
  }
  return {
    operation: 'recompute-prompts',
    shots: rows.map((row) => ({
      shotId: row.id,
      ...promptsFor(row, input.state.assets, input.state.styleDescription),
    })),
  }
}

function xml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function localAssetSvg(asset: ScriptV2Asset, settings: ScriptV2AssetGenerationSettings): string {
  const hue = Number.parseInt(fnv1a(`${asset.id}:${settings.prompt}`).slice(0, 4), 16) % 360
  const label = xml(bounded(asset.name || '资产', 18))
  const role = { character: '角色', scene: '场景', prop: '道具' }[asset.role]
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="512" viewBox="0 0 1024 512">',
    '<defs>',
    `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="hsl(${hue} 42% 18%)"/><stop offset="1" stop-color="hsl(${(hue + 54) % 360} 56% 38%)"/></linearGradient>`,
    '</defs>',
    '<rect width="1024" height="512" rx="36" fill="url(#g)"/>',
    '<circle cx="512" cy="216" r="118" fill="rgba(255,255,255,.12)"/>',
    `<text x="512" y="238" text-anchor="middle" fill="white" font-size="72" font-family="system-ui,sans-serif">${label}</text>`,
    `<text x="512" y="330" text-anchor="middle" fill="rgba(255,255,255,.72)" font-size="28" font-family="system-ui,sans-serif">本地 ${role} fixture · ${xml(settings.resolution)} · ${xml(settings.aspectRatio)}</text>`,
    '</svg>',
  ].join('')
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function generateMockScriptV2Asset(
  input: GenerateMockScriptV2AssetInput,
): ScriptV2GenerateAssetResult {
  const asset: ScriptV2Asset = {
    ...input.asset,
    source: 'ai',
    status: 'ready',
    thumbnailUrl: localAssetSvg(input.asset, input.settings),
    generation: { ...input.settings },
    compliance: { state: 'pass', updatedAt: SCRIPT_V2_FIXTURE_TIMESTAMP },
    updatedAt: SCRIPT_V2_FIXTURE_TIMESTAMP,
  }
  delete asset.error
  return {
    operation: 'generate-asset',
    asset,
  }
}

function uniqueId(base: string, used: Set<string>): string {
  let candidate = base
  let suffix = 2
  while (used.has(candidate)) {
    candidate = `${base}_${suffix}`
    suffix += 1
  }
  used.add(candidate)
  return candidate
}

function blocked(reason: string): ScriptV2BatchBuildResult {
  return { mutations: [], createdNodeIds: [], groupId: null, blockedReason: reason }
}

function outputNode(
  kind: ScriptV2BatchKind,
  row: ScriptV2Row,
  index: number,
  source: WorkflowNode,
  existing: WorkflowNode[],
  id: string,
): WorkflowNode {
  const columns = 2
  const position = {
    x: source.position.x + source.size.width + 180 + (index % columns) * 470,
    y: source.position.y + Math.floor(index / columns) * 380,
  }
  const node = createNode(kind, position, existing, {
    id,
    name: kind === 'image' ? `分镜图 ${row.shotNumber}` : `分镜视频 ${row.shotNumber}`,
    createdAt: SCRIPT_V2_FIXTURE_TIMESTAMP,
    updatedAt: SCRIPT_V2_FIXTURE_TIMESTAMP,
  })
  if (kind === 'image') {
    return {
      ...node,
      data: {
        ...node.data,
        prompt: row.imageGenerationPrompt,
        modelId: DEFAULT_MODEL.image,
        output: { aspectRatio: '16:9', quality: 'standard', resolution: '2K', count: 1 },
        extra: {
          ...(node.data.extra ?? {}),
          scriptV2Source: {
            scriptNodeId: source.id,
            rowId: row.id,
            shotNumber: row.shotNumber,
            track: 'image',
          },
        },
      },
    }
  }
  return {
    ...node,
    data: {
      ...node.data,
      prompt: row.videoMotionPrompt,
      modelId: DEFAULT_MODEL.video,
      output: {
        aspectRatio: '16:9',
        resolution: '720p',
        durationSeconds: row.durationSeconds,
        count: 1,
        withAudio: false,
        mode: 'text2video',
      },
      extra: {
        ...(node.data.extra ?? {}),
        scriptV2Source: {
          scriptNodeId: source.id,
          rowId: row.id,
          shotNumber: row.shotNumber,
          track: 'video',
        },
      },
    },
  }
}

export function createScriptV2BatchMutations(
  document: WorkflowDocument,
  sourceNodeId: string,
  state: ScriptV2State,
  kind: ScriptV2BatchKind,
): ScriptV2BatchBuildResult {
  const source = document.nodes.find((node) => node.id === sourceNodeId)
  if (!source || source.type !== 'script') return blocked('脚本节点不存在')
  if (!state.rows.length) return blocked('请先添加至少一个镜头')
  const missing = state.rows.filter((row) =>
    kind === 'image' ? !row.imageGenerationPrompt.trim() : !row.videoMotionPrompt.trim(),
  )
  if (missing.length) {
    return blocked(
      kind === 'image'
        ? `有 ${missing.length} 个镜头缺少分镜图提示词`
        : `有 ${missing.length} 个镜头缺少视频运动提示词`,
    )
  }

  const usedNodeIds = new Set(document.nodes.map((node) => node.id))
  const usedEdgeIds = new Set(document.edges.map((edge) => edge.id))
  const usedGroupIds = new Set(document.groups.map((group) => group.id))
  const created: WorkflowNode[] = []
  for (const [index, row] of state.rows.entries()) {
    const id = uniqueId(
      stableId('nd', sourceNodeId, state.identitySeed, kind, row.id),
      usedNodeIds,
    )
    created.push(outputNode(kind, row, index, source, [...document.nodes, ...created], id))
  }
  const edges: WorkflowEdge[] = created.map((node, index) => ({
    id: uniqueId(
      stableId('edg', sourceNodeId, state.identitySeed, kind, state.rows[index].id),
      usedEdgeIds,
    ),
    source: sourceNodeId,
    target: node.id,
    createdAt: SCRIPT_V2_FIXTURE_TIMESTAMP,
  }))
  const groupId = uniqueId(
    stableId('grp', sourceNodeId, state.identitySeed, kind, state.rows.map((row) => row.id).join(',')),
    usedGroupIds,
  )
  const group: WorkflowGroup = {
    id: groupId,
    kind: kind === 'image' ? 'storyboard' : 'normal',
    name: kind === 'image' ? '分镜图生成器组' : '批量视频生成器组',
    nodeIds: created.map((node) => node.id),
    createdAt: SCRIPT_V2_FIXTURE_TIMESTAMP,
    ...(kind === 'image'
      ? {
          storyboard: {
            aspectRatio: '16:9' as const,
            grid: { rows: Math.ceil(created.length / 2), cols: Math.min(2, created.length) },
            showSequenceNumbers: true,
          },
        }
      : {}),
  }
  return {
    mutations: [
      ...created.map((node): CanvasMutation => ({ op: 'addNode', node })),
      ...edges.map((edge): CanvasMutation => ({ op: 'addEdge', edge })),
      { op: 'addGroup', group },
    ],
    createdNodeIds: created.map((node) => node.id),
    groupId,
    blockedReason: null,
  }
}
